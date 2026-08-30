import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import { signAccessToken } from '../../src/infrastructure/security/jwt';

// Real HTTP requests exercising the endpoint the codebase itself calls
// "the single most important endpoint in the app" — GET
// /courses/:id/resources — plus admin role-gating (requireAuth +
// requireAdmin over real HTTP) and the real file-upload middleware
// chain (multer + validateFileSignature's magic-byte check).
//
// None of this is covered by tests/integration: those call
// catalog.service functions directly, so they never touch routing,
// requireAdmin's 403, multer's buffering, or validateFileSignature's
// real byte inspection. tests/unit/modules/catalog/access-policy.test.ts
// already proves decideAccess's four branches in isolation; this proves
// the full real chain (auth -> admin gate -> DB -> access-policy ->
// response shape) produces the same four outcomes over real HTTP.
//
// Admin users have no signup endpoint by design (SRS: admins are
// provisioned directly, not self-registered) — created here straight
// via Prisma, with a real signAccessToken() call standing in for what
// an admin's real login would issue.
//
// Run via `npm run test:e2e`, never as part of plain `npm test`.

const TEST_PREFIX = 'e2e-test-catalog';
let counter = 0;
const uniqueName = (label: string) => {
  counter += 1;
  return `${TEST_PREFIX}-${label}-${Date.now()}-${counter}`;
};
const uniquePhone = () => {
  counter += 1;
  return `+2519${(Date.now() + counter).toString().slice(-9)}`;
};

// A minimal but genuinely valid PDF — file-type detects the mime from
// the real leading magic bytes ("%PDF-"), not the filename or the
// Content-Type header, so this has to be real, not just named right.
const MINIMAL_PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

const createdUserIds: number[] = [];
const createdStreamIds: number[] = [];
const createdDepartmentIds: number[] = [];
const createdCourseIds: number[] = [];
const createdResourceIds: number[] = [];

afterAll(async () => {
  await prisma.resource.deleteMany({ where: { id: { in: createdResourceIds } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
  await prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } });
  await prisma.stream.deleteMany({ where: { id: { in: createdStreamIds } } });
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
      email: `${uniqueName('admin')}@example.com`,
      phone: uniquePhone(),
      passwordHash: 'not-a-real-hash-this-is-test-fixture-data',
      role: 'admin',
    },
  });
  createdUserIds.push(admin.id);
  return { admin, token: signAccessToken({ userId: admin.id, role: 'admin' }) };
};

describe('catalog admin CRUD role-gating (real HTTP, real Express app)', () => {
  it('rejects an unauthenticated request with 401, and a student token with 403', async () => {
    const unauth = await request(app)
      .post('/admin/streams')
      .send({ name: uniqueName('stream') });
    expect(unauth.status).toBe(401);

    const signupRes = await request(app)
      .post('/auth/signup')
      .send({
        name: 'E2E Test Student',
        email: `${uniqueName('student')}@example.com`,
        phone: uniquePhone(),
        password: 'a-genuinely-long-enough-password-123',
      });
    createdUserIds.push(signupRes.body.user.id);

    const asStudent = await request(app)
      .post('/admin/streams')
      .set('Authorization', `Bearer ${signupRes.body.access_token}`)
      .send({ name: uniqueName('stream') });
    expect(asStudent.status).toBe(403);
    expect(asStudent.body.error.code).toBe('ADMIN_ONLY');
  });

  it('lets a real admin token create a stream over real HTTP', async () => {
    const { token } = await createAdminAndToken();

    const res = await request(app)
      .post('/admin/streams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: uniqueName('stream') });

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(Number));
    createdStreamIds.push(res.body.id);
  });
});

describe('resource upload (real multer + real magic-byte validation)', () => {
  it('rejects a non-PDF payload with a real 400 from validateFileSignature', async () => {
    const { token } = await createAdminAndToken();
    const stream = await prisma.stream.create({ data: { name: uniqueName('stream') } });
    createdStreamIds.push(stream.id);
    const department = await prisma.department.create({
      data: { streamId: stream.id, name: uniqueName('dept') },
    });
    createdDepartmentIds.push(department.id);
    const course = await prisma.course.create({
      data: { departmentId: department.id, academicYear: 1, name: uniqueName('course') },
    });
    createdCourseIds.push(course.id);

    const res = await request(app)
      .post('/admin/resources')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Fake resource')
      .field('course_id', String(course.id))
      .field('category', 'handout')
      .field('is_free_sample', 'true')
      // Real bytes, genuinely not a PDF — a renamed-extension attack is
      // exactly what magic-byte checking exists to catch. multer's own
      // Content-Type filter would never see this, since supertest sets
      // a plausible field, not a spoofed header multer inspects.
      .attach('file', Buffer.from('this is definitely not a pdf'), {
        filename: 'not-a-pdf.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('accepts a real PDF and creates the resource', async () => {
    const { token } = await createAdminAndToken();
    const stream = await prisma.stream.create({ data: { name: uniqueName('stream') } });
    createdStreamIds.push(stream.id);
    const department = await prisma.department.create({
      data: { streamId: stream.id, name: uniqueName('dept') },
    });
    createdDepartmentIds.push(department.id);
    const course = await prisma.course.create({
      data: { departmentId: department.id, academicYear: 1, name: uniqueName('course') },
    });
    createdCourseIds.push(course.id);

    const res = await request(app)
      .post('/admin/resources')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Real PDF resource')
      .field('course_id', String(course.id))
      .field('category', 'handout')
      .field('is_free_sample', 'false')
      .attach('file', MINIMAL_PDF, { filename: 'real.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Real PDF resource');
    expect(res.body.is_free_sample).toBe(false);
    createdResourceIds.push(res.body.id);
  });
});

describe('GET /courses/:id/resources access decisions (real HTTP, real access-policy)', () => {
  it('walks all four decideAccess outcomes end to end over real HTTP', async () => {
    const { token: adminToken } = await createAdminAndToken();

    const stream = await prisma.stream.create({ data: { name: uniqueName('stream') } });
    createdStreamIds.push(stream.id);
    const department = await prisma.department.create({
      data: { streamId: stream.id, name: uniqueName('dept') },
    });
    createdDepartmentIds.push(department.id);
    const course = await prisma.course.create({
      data: { departmentId: department.id, academicYear: 1, name: uniqueName('course') },
    });
    createdCourseIds.push(course.id);

    // A free sample resource and a locked (premium-only) resource in
    // the same category, so one GET call surfaces both cases at once.
    const freeSample = await request(app)
      .post('/admin/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', 'Free sample handout')
      .field('course_id', String(course.id))
      .field('category', 'handout')
      .field('is_free_sample', 'true')
      .attach('file', MINIMAL_PDF, { filename: 'free.pdf', contentType: 'application/pdf' });
    createdResourceIds.push(freeSample.body.id);

    const premiumOnly = await request(app)
      .post('/admin/resources')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('title', 'Premium-only handout')
      .field('course_id', String(course.id))
      .field('category', 'handout')
      .field('is_free_sample', 'false')
      .attach('file', MINIMAL_PDF, { filename: 'premium.pdf', contentType: 'application/pdf' });
    createdResourceIds.push(premiumOnly.body.id);

    // A real student, real signup + login (device_fingerprint set),
    // no premium granted yet.
    const email = `${uniqueName('student')}@example.com`;
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
      device_fingerprint: 'fp_e2e_catalog_test',
    });
    const studentToken = loginRes.body.access_token as string;

    // --- Case 1 & 2: free sample unlocked, premium-only locked (no premium yet) ---
    const beforePremium = await request(app)
      .get(`/courses/${course.id}/resources`)
      .query({ category: 'handout' })
      .set('Authorization', `Bearer ${studentToken}`);

    expect(beforePremium.status).toBe(200);
    const freeView = beforePremium.body.resources.find(
      (r: { id: number }) => r.id === freeSample.body.id,
    );
    const lockedView = beforePremium.body.resources.find(
      (r: { id: number }) => r.id === premiumOnly.body.id,
    );

    expect(freeView.locked).toBe(false);
    expect(freeView.file_url).toEqual(expect.any(String));

    expect(lockedView.locked).toBe(true);
    expect(lockedView.reason_code).toBe('premium_required');
    expect(lockedView.file_url).toBeUndefined();

    // --- Grant premium: activates a device from the student's
    // last-login fingerprint ('fp_e2e_catalog_test') ---
    const grantRes = await request(app)
      .post(`/admin/users/${signupRes.body.user.id}/grant-premium`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'E2E test grant' });
    expect(grantRes.status).toBe(200);
    expect(grantRes.body.activation_status).toBe('activated');

    // --- Case 4: premium + activated + matching device -> unlocked.
    // The SAME student token still works — it already carried the
    // 'fp_e2e_catalog_test' deviceFingerprint claim from login, and
    // that's now the active device on file.
    const afterPremiumMatchingDevice = await request(app)
      .get(`/courses/${course.id}/resources`)
      .query({ category: 'handout' })
      .set('Authorization', `Bearer ${studentToken}`);

    const nowUnlocked = afterPremiumMatchingDevice.body.resources.find(
      (r: { id: number }) => r.id === premiumOnly.body.id,
    );
    expect(nowUnlocked.locked).toBe(false);
    expect(nowUnlocked.file_url).toEqual(expect.any(String));

    // --- Case 3: premium + activated but a DIFFERENT device ->
    // device_mismatch. A fresh token carrying a fingerprint that was
    // never activated proves the check is real, not just "any token
    // works once premium is granted."
    const wrongDeviceToken = signAccessToken({
      userId: signupRes.body.user.id,
      role: 'student',
      deviceFingerprint: 'fp_e2e_a_totally_different_device',
    });

    const wrongDeviceRes = await request(app)
      .get(`/courses/${course.id}/resources`)
      .query({ category: 'handout' })
      .set('Authorization', `Bearer ${wrongDeviceToken}`);

    const mismatchView = wrongDeviceRes.body.resources.find(
      (r: { id: number }) => r.id === premiumOnly.body.id,
    );
    expect(mismatchView.locked).toBe(true);
    expect(mismatchView.reason_code).toBe('device_mismatch');
    expect(mismatchView.file_url).toBeUndefined();
  }, 90_000);
});
