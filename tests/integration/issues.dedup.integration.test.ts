import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import * as issuesService from '../../src/modules/issues/issues.service';

// Real Prisma writes against a real, separate TEST database — same
// rationale as the other integration tests here. The real guarantee
// FR-6.3 depends on is a partial unique index
// (one_open_report_per_student_per_resource, WHERE status = 'pending'),
// not application code — issuesService.createReport pre-checks with
// findOpenReport before inserting, but that pre-check has a real race
// window: two concurrent requests can both pass the pre-check before
// either insert commits. Only a genuine concurrent write against a
// genuine unique index can prove the index itself still holds when
// that race is lost — a mocked unit test's mocked repository has no
// index to violate, so it can't catch this either way.
//
// Run via `npm run test:integration`, never as part of plain `npm test`.

const TEST_PREFIX = 'integration-test-issues';
let counter = 0;
const uniqueName = (label: string) => {
  counter += 1;
  return `${TEST_PREFIX}-${label}-${Date.now()}-${counter}`;
};

let adminId: number;
let studentId: number;
let resourceId: number;
const createdReportIds: number[] = [];
const createdResourceIds: number[] = [];
const createdCourseIds: number[] = [];
const createdDepartmentIds: number[] = [];
const createdStreamIds: number[] = [];

const seedResourceTree = async () => {
  const admin = await prisma.user.create({
    data: {
      name: 'Integration Test Admin',
      email: `${uniqueName('admin')}@example.com`,
      phone: `+2519${Date.now().toString().slice(-9)}`,
      passwordHash: 'not-a-real-hash-this-is-test-fixture-data',
      role: 'admin',
    },
  });
  adminId = admin.id;

  const student = await prisma.user.create({
    data: {
      name: 'Integration Test Student',
      email: `${uniqueName('student')}@example.com`,
      phone: `+2519${(Date.now() + 1).toString().slice(-9)}`,
      passwordHash: 'not-a-real-hash-this-is-test-fixture-data',
      role: 'student',
    },
  });
  studentId = student.id;

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
      category: 'midterm',
      title: uniqueName('resource'),
      fileUrl: 'https://files.test.example.com/fake-key.pdf',
      fileSizeBytes: 1024,
      checksum: 'sha256:0000000000000000000000000000000000000000000000000000000000000',
      uploadedByAdminId: adminId,
    },
  });
  resourceId = resource.id;
  createdResourceIds.push(resource.id);
};

// issue_reports.resource_id_fkey is CASCADE (deleting a Resource takes
// its reports with it), but reporter_id_fkey is RESTRICT — so any
// report row must be gone before the student user can be deleted,
// regardless of which FK would have handled it automatically.
afterAll(async () => {
  await prisma.issueReport.deleteMany({ where: { id: { in: createdReportIds } } });
  await prisma.resource.deleteMany({ where: { id: { in: createdResourceIds } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
  await prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } });
  await prisma.stream.deleteMany({ where: { id: { in: createdStreamIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [adminId, studentId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, studentId] } } });
  await prisma.$disconnect();
});

describe('issues FR-6.3 dedup (real database, real partial unique index)', () => {
  it('allows a single report and rejects a second sequential attempt with a clean 409', async () => {
    await seedResourceTree();

    const first = await issuesService.createReport(resourceId, studentId, 'broken_file', undefined);
    createdReportIds.push(first.id);
    expect(first.status).toBe('pending');

    await expect(
      issuesService.createReport(resourceId, studentId, 'wrong_file', undefined),
    ).rejects.toMatchObject({ code: 'REPORT_ALREADY_OPEN' });

    const openReports = await prisma.issueReport.count({
      where: { resourceId, reporterId: studentId, status: 'pending' },
    });
    expect(openReports).toBe(1);
  });

  it('holds under a genuine race — two concurrent createReport calls for the same student+resource never both succeed', async () => {
    await seedResourceTree();

    // Fired together, not awaited one at a time — both requests reach
    // the findOpenReport pre-check before either has a chance to
    // insert, which is exactly the race the partial unique index (not
    // the pre-check) is the real defense against.
    const results = await Promise.allSettled([
      issuesService.createReport(resourceId, studentId, 'broken_file', undefined),
      issuesService.createReport(resourceId, studentId, 'wrong_file', undefined),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // The real invariant: the database must never end up with two
    // open reports for the same student+resource, no matter how the
    // race resolves at the application layer.
    const openReports = await prisma.issueReport.findMany({
      where: { resourceId, reporterId: studentId, status: 'pending' },
    });
    expect(openReports).toHaveLength(1);
    createdReportIds.push(...openReports.map((r) => r.id));

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Whether the loser of the race gets a clean REPORT_ALREADY_OPEN
    // (app-layer pre-check happened to catch it) or the raw unique-
    // index violation (the race window was actually hit) is the real
    // open question here — if this fails, it means createReport
    // doesn't currently catch the DB-level violation and convert it to
    // a clean 409, which is worth fixing but is not a data-integrity
    // problem (the row count assertion above already proves the data
    // stayed correct either way).
    const loser = rejected[0] as PromiseRejectedResult;
    expect(loser.reason).toMatchObject({ code: 'REPORT_ALREADY_OPEN' });
  });

  it('throws RESOURCE_NOT_FOUND for a genuinely nonexistent resource, without touching the database', async () => {
    await seedResourceTree();

    await expect(
      issuesService.createReport(999_999_999, studentId, 'broken_file', undefined),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });

    const anyReports = await prisma.issueReport.count({ where: { reporterId: studentId } });
    expect(anyReports).toBe(0);
  });
});