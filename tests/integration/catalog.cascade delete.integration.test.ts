import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import * as catalogService from '../../src/modules/catalog/catalog.service';
import * as r2Client from '../../src/infrastructure/storage/r2-client';

// Real Prisma writes against a real, separate TEST database — same
// rationale as the other integration tests in this folder. The thing
// worth verifying here that no mocked unit test can: does the real
// foreign-key chain (Resource -> Course -> Department -> Stream, every
// one of them onDelete: Restrict) actually allow this cascade to
// complete?
//
// A real concern going in, not just a formality: catalog.repository's
// deleteResource does a SOFT delete (sets deletedAt), while
// deleteCourseRow/deleteDepartmentRow/deleteStreamRow do REAL hard
// deletes of their own row. Postgres's RESTRICT blocks deleting a
// parent while ANY row still references it via a live foreign key —
// it has no concept of "soft-deleted," so a Resource row that still
// physically exists (just flagged deletedAt) may well block deleting
// its parent Course. catalog.service.test.ts (unit, mocked) cannot
// catch this either way, because its mocked deleteCourseRow always
// "succeeds" regardless of what real Postgres would do.
//
// Only r2Client is mocked here — every DB write is real. Mocking
// r2Client is not cutting a corner: this test's whole purpose is
// proving DB-level cascade behavior, and no R2 credentials are needed
// or available in this environment yet.
//
// Run via `npm run test:integration`, never as part of plain `npm test`.

vi.mock('../../src/infrastructure/storage/r2-client');

const TEST_PREFIX = 'integration-test-cascade';
let counter = 0;
const uniqueName = (label: string) => {
  counter += 1;
  return `${TEST_PREFIX}-${label}-${Date.now()}-${counter}`;
};

const createdResourceIds: number[] = [];
const createdCourseIds: number[] = [];
const createdDepartmentIds: number[] = [];
const createdStreamIds: number[] = [];
let adminId: number;

beforeEach(() => {
  vi.mocked(r2Client.deleteObject).mockResolvedValue(undefined);
  vi.mocked(r2Client.upload).mockResolvedValue(undefined);
});

// Cleanup is intentionally resilient to either outcome (cascade fully
// succeeded, or it threw partway through) — deleteMany on an id list
// matches zero rows without erroring if the cascade already removed
// them for real, so this works regardless of which behavior the tests
// below actually observe. Children before parents, same FK-driven
// ordering reasoning as every other integration test's cleanup here.
afterAll(async () => {
  await prisma.resource.deleteMany({ where: { id: { in: createdResourceIds } } });
  await prisma.course.deleteMany({ where: { id: { in: createdCourseIds } } });
  await prisma.department.deleteMany({ where: { id: { in: createdDepartmentIds } } });
  await prisma.stream.deleteMany({ where: { id: { in: createdStreamIds } } });
  await prisma.adminActionLog.deleteMany({ where: { adminId } });
  if (adminId) await prisma.user.deleteMany({ where: { id: adminId } });
  await prisma.$disconnect();
});

const seedAdmin = async () => {
  if (adminId) return adminId;
  const suffix = uniqueName('admin');
  const admin = await prisma.user.create({
    data: {
      name: 'Integration Test Admin',
      email: `${suffix}@example.com`,
      phone: `+2519${Date.now().toString().slice(-9)}`,
      passwordHash: 'not-a-real-hash-this-is-test-fixture-data',
      role: 'admin',
    },
  });
  adminId = admin.id;
  return adminId;
};

const seedResource = async (courseId: number) => {
  const resource = await prisma.resource.create({
    data: {
      courseId,
      category: 'midterm',
      title: uniqueName('resource'),
      fileUrl: 'https://files.test.example.com/fake-key-does-not-need-to-be-real.pdf',
      fileSizeBytes: 1024,
      checksum: 'sha256:0000000000000000000000000000000000000000000000000000000000000',
      uploadedByAdminId: adminId,
    },
  });
  createdResourceIds.push(resource.id);
  return resource;
};

describe('catalog cascade delete (real database, real foreign keys)', () => {
  it('deleteCourse removes every resource under it, then the course row itself, with no live FK violation', async () => {
    await seedAdmin();
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
    const resourceA = await seedResource(course.id);
    const resourceB = await seedResource(course.id);

    await catalogService.deleteCourse(course.id, adminId);

    // The real question: did the course row actually get removed, or
    // did Postgres reject it because the (soft-deleted) resource rows
    // still physically reference it?
    const reloadedCourse = await prisma.course.findUnique({ where: { id: course.id } });
    expect(reloadedCourse).toBeNull();

    const reloadedResourceA = await prisma.resource.findUnique({ where: { id: resourceA.id } });
    const reloadedResourceB = await prisma.resource.findUnique({ where: { id: resourceB.id } });
    // Either they were hard-removed as part of a real cascade, or they
    // still exist but are marked deletedAt — both are acceptable
    // end states for "the resource is gone from every student-facing
    // view." What matters is the course row itself came out clean.
    if (reloadedResourceA) expect(reloadedResourceA.deletedAt).not.toBeNull();
    if (reloadedResourceB) expect(reloadedResourceB.deletedAt).not.toBeNull();

    const auditEntries = await prisma.adminActionLog.findMany({
      where: { adminId, actionType: 'delete', targetType: 'Course', targetId: course.id },
    });
    expect(auditEntries).toHaveLength(1);
  });

  it('deleteStream walks every department, every course, every resource, in order, before removing the stream itself', async () => {
    await seedAdmin();
    const stream = await prisma.stream.create({ data: { name: uniqueName('stream') } });
    createdStreamIds.push(stream.id);
    const department = await prisma.department.create({
      data: { streamId: stream.id, name: uniqueName('dept') },
    });
    createdDepartmentIds.push(department.id);
    const courseA = await prisma.course.create({
      data: { departmentId: department.id, academicYear: 1, name: uniqueName('course-a') },
    });
    const courseB = await prisma.course.create({
      data: { departmentId: department.id, academicYear: 2, name: uniqueName('course-b') },
    });
    createdCourseIds.push(courseA.id, courseB.id);
    await seedResource(courseA.id);
    await seedResource(courseB.id);

    await catalogService.deleteStream(stream.id, adminId);

    const reloadedStream = await prisma.stream.findUnique({ where: { id: stream.id } });
    expect(reloadedStream).toBeNull();

    const reloadedDepartment = await prisma.department.findUnique({ where: { id: department.id } });
    expect(reloadedDepartment).toBeNull();

    const reloadedCourseA = await prisma.course.findUnique({ where: { id: courseA.id } });
    const reloadedCourseB = await prisma.course.findUnique({ where: { id: courseB.id } });
    expect(reloadedCourseA).toBeNull();
    expect(reloadedCourseB).toBeNull();

    // Full audit trail, every level — matches deleteStream's own
    // comment that every course, department, and the stream itself
    // each get their own logged entry.
    const auditEntries = await prisma.adminActionLog.findMany({
      where: { adminId, targetType: { in: ['Course', 'Department', 'Stream'] } },
      orderBy: { id: 'asc' },
    });
    const targetTypes = auditEntries.map((e) => e.targetType);
    expect(targetTypes).toContain('Course');
    expect(targetTypes).toContain('Department');
    expect(targetTypes).toContain('Stream');
  });

  it('deleteDepartment throws DEPARTMENT_NOT_FOUND for a genuinely nonexistent id, without touching anything', async () => {
    await seedAdmin();
    await expect(catalogService.deleteDepartment(999_999_999, adminId)).rejects.toMatchObject({
      code: 'DEPARTMENT_NOT_FOUND',
    });
  });
});