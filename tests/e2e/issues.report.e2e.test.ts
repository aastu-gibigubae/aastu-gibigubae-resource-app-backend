import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import { signAccessToken } from '../../src/infrastructure/security/jwt';

// Real HTTP requests against the issues module's three endpoints:
// POST /resources/:id/report, GET /admin/reports, and
// POST /admin/reports/:id/resolve. tests/integration/issues.dedup
// already proves the real partial unique index and race behavior at
// the service layer; this proves routing, requireAdmin's real
// 401/403/200, and the status-filter query param all work over real
// HTTP too — none of which the integration test touches at all.
//
// No R2 involved — the resource used here is seeded directly via
// Prisma with a fake fileUrl (same pattern as
// tests/integration/issues.dedup), since this test's focus is the
// issues module, not catalog's real upload pipeline.
//
// Run via `npm run test:e2e`, never as part of plain `npm test`.

const TEST_PREFIX = 'e2e-test-issues';
let counter = 0;
const uniqueName = (label: string) => {
  counter += 1;
  return `${TEST_PREFIX}-${label}-${Date.now()}-${counter}`;
};
const uniqueEmail = () => {
  counter += 1;
  return `${TEST_PREFIX}-${Date.now()}-${counter}@example.com`;
};
const uniquePhone = () => {
  counter += 1;
  return `+2519${(Date.now() + counter).toString().slice(-9)}`;
};

const createdUserIds: number[] = [];
const createdReportIds: number[] = [];
const createdResourceIds: number[] = [];
const createdCourseIds: number[] = [];
const createdDepartmentIds: number[] = [];
const createdStreamIds: number[] = [];

afterAll(async () => {
  await prisma.issueReport.deleteMany({ where: { id: { in: createdReportIds } } });
  await prisma.resource.deleteMany({ where: { id: { in: createdResourceIds } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
  await prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } });
  await prisma.stream.deleteMany({ where: { id: { in: createdStreamIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
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

const seedResource = async (adminId: number) => {
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
  const resource = await prisma.resource.create({
    data: {
      courseId: course.id,
      category: 'handout',
      title: uniqueName('resource'),
      fileUrl: 'https://files.test.example.com/fake-key.pdf',
      fileSizeBytes: 1024,
      checksum: 'sha256:0000000000000000000000000000000000000000000000000000000000000',
      uploadedByAdminId: adminId,
    },
  });
  createdResourceIds.push(resource.id);
  return resource;
};

const createStudentAndToken = async () => {
  const signupRes = await request(app).post('/auth/signup').send({
    name: 'E2E Test Student',
    email: uniqueEmail(),
    phone: uniquePhone(),
    password: 'a-genuinely-long-enough-password-123',
  });
  createdUserIds.push(signupRes.body.user.id);
  return { userId: signupRes.body.user.id as number, token: signupRes.body.access_token as string };
};

describe('POST /resources/:id/report (real HTTP, real database)', () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).post('/resources/1/report').send({ reason: 'broken_file' });
    expect(res.status).toBe(401);
  });

  it('creates a report, rejects a duplicate with 409, and returns 404 for a nonexistent resource', async () => {
    const { admin } = await createAdminAndToken();
    const resource = await seedResource(admin.id);
    const { token: studentToken } = await createStudentAndToken();

    const first = await request(app)
      .post(`/resources/${resource.id}/report`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'broken_file' });

    expect(first.status).toBe(201);
    expect(first.body.status).toBe('pending');
    createdReportIds.push(first.body.id);

    const duplicate = await request(app)
      .post(`/resources/${resource.id}/report`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'wrong_file' });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('REPORT_ALREADY_OPEN');

    const notFound = await request(app)
      .post('/resources/999999999/report')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'broken_file' });

    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('rejects an invalid reason with a real 400 validation error', async () => {
    const { admin } = await createAdminAndToken();
    const resource = await seedResource(admin.id);
    const { token: studentToken } = await createStudentAndToken();

    const res = await request(app)
      .post(`/resources/${resource.id}/report`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'not_a_real_reason' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /admin/reports and POST /admin/reports/:id/resolve (real HTTP, role-gated)', () => {
  it('rejects a student token on both endpoints with a real 403', async () => {
    const { token: studentToken } = await createStudentAndToken();

    const listRes = await request(app)
      .get('/admin/reports')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(listRes.status).toBe(403);
    expect(listRes.body.error.code).toBe('ADMIN_ONLY');

    const resolveRes = await request(app)
      .post('/admin/reports/1/resolve')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(resolveRes.status).toBe(403);
    expect(resolveRes.body.error.code).toBe('ADMIN_ONLY');
  });

  it('lists a real report for an admin, resolves it for real, and the status filter reflects the change', async () => {
    const { admin, token: adminToken } = await createAdminAndToken();
    const resource = await seedResource(admin.id);
    const { userId: studentId, token: studentToken } = await createStudentAndToken();

    const createRes = await request(app)
      .post(`/resources/${resource.id}/report`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'poor_quality', other_text: 'Scan is blurry' });
    const reportId = createRes.body.id as number;
    createdReportIds.push(reportId);

    const listPending = await request(app)
      .get('/admin/reports')
      .query({ status: 'pending' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listPending.status).toBe(200);
    expect(listPending.body.reports.some((r: { id: number }) => r.id === reportId)).toBe(true);

    const resolveRes = await request(app)
      .post(`/admin/reports/${reportId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.status).toBe('addressed');

    const listPendingAfter = await request(app)
      .get('/admin/reports')
      .query({ status: 'pending' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listPendingAfter.body.reports.some((r: { id: number }) => r.id === reportId)).toBe(
      false,
    );

    const listAddressedAfter = await request(app)
      .get('/admin/reports')
      .query({ status: 'addressed' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listAddressedAfter.body.reports.some((r: { id: number }) => r.id === reportId)).toBe(
      true,
    );

    // resolveReport also calls notificationsService.create for the
    // original reporter (issue_report_addressed) — confirm the real row
    // landed, not just that the HTTP response looked right.
    const notification = await prisma.notification.findFirst({
      where: { userId: studentId, type: 'issue_report_addressed' },
    });
    expect(notification).not.toBeNull();
  });

  it('returns a real 404 REPORT_NOT_FOUND when resolving a nonexistent report', async () => {
    const { token: adminToken } = await createAdminAndToken();

    const res = await request(app)
      .post('/admin/reports/999999999/resolve')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('REPORT_NOT_FOUND');
  });
});
