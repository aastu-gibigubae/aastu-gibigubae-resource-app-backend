import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import { signAccessToken } from '../../src/infrastructure/security/jwt';

// Real HTTP requests against POST /verify/heartbeat and
// POST /admin/users/:id/revoke-device — the two device-module
// endpoints. tests/integration doesn't cover this module at all yet
// (grantPremium's integration test proves activateFromLastLogin runs
// correctly inside the transaction, but nothing exercises
// checkHeartbeat or revokeDevice over real HTTP, or requireAdmin's
// real 403 on this specific route).
//
// Deliberately does NOT touch R2 — device.service never imports
// r2-client at all, so unlike catalog.browse.e2e, this file runs
// fast with no real-network dependency beyond the real database.
//
// Run via `npm run test:e2e`, never as part of plain `npm test`.

const TEST_PREFIX = 'e2e-test-device';
let counter = 0;
const uniqueEmail = () => {
  counter += 1;
  return `${TEST_PREFIX}-${Date.now()}-${counter}@example.com`;
};
const uniquePhone = () => {
  counter += 1;
  return `+2519${(Date.now() + counter).toString().slice(-9)}`;
};

const createdUserIds: number[] = [];

afterAll(async () => {
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.deviceRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.paymentSubmission.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.adminActionLog.deleteMany({ where: { adminId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

const createAdminAndToken = async () => {
  const admin = await prisma.user.create({
    data: {
      name: 'E2E Test Admin',
      email: uniqueEmail(),
      phone: uniquePhone(),
      passwordHash: 'not-a-real-hash-this-is-test-fixture-data',
      role: 'admin',
    },
  });
  createdUserIds.push(admin.id);
  return { admin, token: signAccessToken({ userId: admin.id, role: 'admin' }) };
};

describe('POST /verify/heartbeat (real HTTP, real database)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app)
      .post('/verify/heartbeat')
      .send({ device_fingerprint: 'fp_anything' });
    expect(res.status).toBe(401);
  });

  it('reports locked:true for a student with no premium at all', async () => {
    const signupRes = await request(app).post('/auth/signup').send({
      name: 'E2E Test Student',
      email: uniqueEmail(),
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    createdUserIds.push(signupRes.body.user.id);

    const res = await request(app)
      .post('/verify/heartbeat')
      .set('Authorization', `Bearer ${signupRes.body.access_token}`)
      .send({ device_fingerprint: 'fp_no_premium_test' });

    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.subscription_status).toBe('none');
    expect(res.body.reason_code).toBeUndefined();
  });

  it('walks the full real flow: locked before grant, unlocked with matching device, locked again with device_mismatch, then locked again after revoke', async () => {
    const { token: adminToken } = await createAdminAndToken();

    const email = uniqueEmail();
    const signupRes = await request(app).post('/auth/signup').send({
      name: 'E2E Test Student',
      email,
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    createdUserIds.push(signupRes.body.user.id);

    const loginRes = await request(app).post('/auth/login').send({
      email,
      password: 'a-genuinely-long-enough-password-123',
      device_fingerprint: 'fp_e2e_heartbeat_test',
    });

    // Grant premium — activates a device from the student's last-login
    // fingerprint ('fp_e2e_heartbeat_test').
    const grantRes = await request(app)
      .post(`/admin/users/${signupRes.body.user.id}/grant-premium`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'E2E heartbeat test grant' });
    expect(grantRes.status).toBe(200);

    // Matching device -> unlocked.
    const matchingRes = await request(app)
      .post('/verify/heartbeat')
      .set('Authorization', `Bearer ${loginRes.body.access_token}`)
      .send({ device_fingerprint: 'fp_e2e_heartbeat_test' });

    expect(matchingRes.status).toBe(200);
    expect(matchingRes.body.locked).toBe(false);
    expect(matchingRes.body.subscription_status).toBe('active');

    // Different device -> device_mismatch.
    const mismatchRes = await request(app)
      .post('/verify/heartbeat')
      .set('Authorization', `Bearer ${loginRes.body.access_token}`)
      .send({ device_fingerprint: 'fp_a_totally_different_device' });

    expect(mismatchRes.status).toBe(200);
    expect(mismatchRes.body.locked).toBe(true);
    expect(mismatchRes.body.reason_code).toBe('device_mismatch');

    // Admin revokes the device for real over HTTP.
    const revokeRes = await request(app)
      .post(`/admin/users/${signupRes.body.user.id}/revoke-device`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.revoked_device_id).toEqual(expect.any(Number));
    expect(revokeRes.body.revoked_at).toEqual(expect.any(String));

    // Even the PREVIOUSLY matching fingerprint is now locked — no
    // active device exists at all anymore.
    const afterRevokeRes = await request(app)
      .post('/verify/heartbeat')
      .set('Authorization', `Bearer ${loginRes.body.access_token}`)
      .send({ device_fingerprint: 'fp_e2e_heartbeat_test' });

    expect(afterRevokeRes.status).toBe(200);
    expect(afterRevokeRes.body.locked).toBe(true);
  });
});

describe('POST /admin/users/:id/revoke-device role-gating and edge cases (real HTTP)', () => {
  it('rejects a student token with a real 403', async () => {
    const signupRes = await request(app).post('/auth/signup').send({
      name: 'E2E Test Student',
      email: uniqueEmail(),
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    createdUserIds.push(signupRes.body.user.id);

    const res = await request(app)
      .post(`/admin/users/${signupRes.body.user.id}/revoke-device`)
      .set('Authorization', `Bearer ${signupRes.body.access_token}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ADMIN_ONLY');
  });

  it('returns a real 404 NO_ACTIVE_DEVICE for a student who was never granted premium', async () => {
    const { token: adminToken } = await createAdminAndToken();

    const signupRes = await request(app).post('/auth/signup').send({
      name: 'E2E Test Student',
      email: uniqueEmail(),
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    createdUserIds.push(signupRes.body.user.id);

    const res = await request(app)
      .post(`/admin/users/${signupRes.body.user.id}/revoke-device`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NO_ACTIVE_DEVICE');
  });
});
