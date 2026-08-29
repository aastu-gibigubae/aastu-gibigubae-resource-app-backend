import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/infrastructure/database/prisma-client';

// Real HTTP requests against the real Express app (routing, zod
// validation, requireAuth, checkLockout, the error-handler's response
// shape) plus a real database — the one thing none of the other tests
// in this project exercise. tests/integration/auth.round-trip calls
// authService directly, which proves the service logic is correct but
// never proves a real client's exact request/response bytes actually
// work end to end through the HTTP layer.
//
// Deliberately only ONE failed-login attempt anywhere in this file —
// rate-limit.ts's lockout counters are in-memory and keyed by email
// AND by IP, and every supertest request in this process shares the
// same IP. Tripping the real 5-attempt threshold here would lock out
// every other test in this file for the full 15-minute window.
//
// Run via `npm run test:e2e`, never as part of plain `npm test`.

const TEST_PREFIX = 'e2e-test-auth';
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
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('auth HTTP endpoints (real Express app, real database)', () => {
  it('walks the full chain over real HTTP: signup -> login -> refresh -> logout', async () => {
    const email = uniqueEmail();

    const signupRes = await request(app).post('/auth/signup').send({
      name: 'E2E Test Student',
      email,
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.user.email).toBe(email);
    expect(signupRes.body.user.role).toBe('student');
    expect(signupRes.body.access_token).toEqual(expect.any(String));
    expect(signupRes.body.refresh_token).toEqual(expect.any(String));
    createdUserIds.push(signupRes.body.user.id);

    const loginRes = await request(app).post('/auth/login').send({
      email,
      password: 'a-genuinely-long-enough-password-123',
      device_fingerprint: 'fp_e2e_test',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.id).toBe(signupRes.body.user.id);

    const refreshRes = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: loginRes.body.refresh_token });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.access_token).toEqual(expect.any(String));
    expect(refreshRes.body.refresh_token).not.toBe(loginRes.body.refresh_token);

    // requireAuth reads the real Authorization header — this is the
    // one thing tests/integration/auth.round-trip never touches at all,
    // since it calls authService.logout directly with a plain userId.
    const logoutRes = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${refreshRes.body.access_token}`);
    expect(logoutRes.status).toBe(204);

    // The old (already-rotated) refresh token must genuinely be
    // rejected by a real HTTP call, not just at the service layer.
    const reuseRes = await request(app)
      .post('/auth/refresh')
      .send({ refresh_token: loginRes.body.refresh_token });
    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('rejects malformed signup input with the real validation error envelope', async () => {
    const res = await request(app).post('/auth/signup').send({
      name: 'E2E Test Student',
      email: 'not-a-valid-email',
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate signup email over real HTTP', async () => {
    const email = uniqueEmail();
    const first = await request(app).post('/auth/signup').send({
      name: 'First Student',
      email,
      phone: uniquePhone(),
      password: 'a-genuinely-long-enough-password-123',
    });
    createdUserIds.push(first.body.user.id);

    const second = await request(app).post('/auth/signup').send({
      name: 'Second Student',
      email,
      phone: uniquePhone(),
      password: 'a-different-password-456',
    });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('rejects a wrong password with a real 401 (the ONE deliberate failed login in this file)', async () => {
    const email = uniqueEmail();
    const signupRes = await request(app).post('/auth/signup').send({
      name: 'E2E Test Student',
      email,
      phone: uniquePhone(),
      password: 'correct-password-123',
    });
    createdUserIds.push(signupRes.body.user.id);

    const res = await request(app).post('/auth/login').send({
      email,
      password: 'wrong-password-999',
      device_fingerprint: 'fp_e2e_wrong_pw_test',
    });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects /auth/logout with no Authorization header at all', async () => {
    const res = await request(app).post('/auth/logout');
    expect(res.status).toBe(401);
  });
});