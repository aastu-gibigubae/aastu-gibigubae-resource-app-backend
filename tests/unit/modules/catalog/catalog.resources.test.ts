import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as catalogRepository from '../../../../src/modules/catalog/catalog.repository';
import * as catalogService from '../../../../src/modules/catalog/catalog.service';
import * as r2Client from '../../../../src/infrastructure/storage/r2-client';
import * as deviceService from '../../../../src/modules/device/device.service';
import * as usersService from '../../../../src/modules/users/users.service';
import { writeAuditLog } from '../../../../src/infrastructure/audit/audit-log';
import { BadRequestError, NotFoundError } from '../../../../src/shared/errors/app-errors';

vi.mock('../../../../src/modules/catalog/catalog.repository');
vi.mock('../../../../src/infrastructure/storage/r2-client');
vi.mock('../../../../src/modules/device/device.service');
vi.mock('../../../../src/modules/users/users.service');
vi.mock('../../../../src/infrastructure/audit/audit-log');

const mockStream = { id: 1, name: 'Engineering', createdAt: new Date('2026-01-01') };
const mockDepartment = {
  id: 2,
  streamId: 1,
  name: 'Software Engineering',
  createdAt: new Date('2026-01-01'),
};

const mockCourse = {
  id: 5,
  departmentId: 2,
  academicYear: 2,
  name: 'Data Structures',
  createdAt: new Date('2026-01-01'),
};

const mockResource = {
  id: 10,
  courseId: 5,
  category: 'midterm' as const,
  title: 'Midterm 2024',
  description: 'Latest midterm',
  fileUrl: 'https://files.example.com/abc-123.pdf',
  fileSizeBytes: 2000000,
  checksum: 'sha256:existinghash',
  isFreeSample: false,
  uploadedByAdminId: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(r2Client.buildUrl).mockImplementation((key: string) => `https://files.example.com/${key}`);
});

describe('createResource', () => {
  const input = {
    courseId: 5,
    category: 'midterm' as const,
    title: 'Midterm 2024',
    isFreeSample: true,
    file: Buffer.from('fake pdf content'),
    originalFileName: 'midterm.pdf',
  };

  it('throws COURSE_NOT_FOUND when the course does not exist', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(null);

    await expect(catalogService.createResource(input, 1)).rejects.toThrow(NotFoundError);
    expect(r2Client.upload).not.toHaveBeenCalled();
  });

  it('throws FREE_SAMPLE_LIMIT_REACHED BEFORE ever calling R2 — no point uploading a file that will be rejected', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.countFreeSamples).mockResolvedValue(2); // already at the FR-2.5 cap

    await expect(catalogService.createResource(input, 1)).rejects.toThrow(BadRequestError);
    expect(r2Client.upload).not.toHaveBeenCalled();
    expect(catalogRepository.createResource).not.toHaveBeenCalled();
  });

  it('does not check the free-sample limit at all when isFreeSample is false', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.createResource).mockResolvedValue(mockResource);

    await catalogService.createResource({ ...input, isFreeSample: false }, 1);

    expect(catalogRepository.countFreeSamples).not.toHaveBeenCalled();
  });

  it('uploads to R2 BEFORE inserting the DB row (DB doc sec 15 ordering)', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.countFreeSamples).mockResolvedValue(0);
    vi.mocked(catalogRepository.createResource).mockResolvedValue(mockResource);

    const callOrder: string[] = [];
    vi.mocked(r2Client.upload).mockImplementation(async () => {
      callOrder.push('r2-upload');
    });
    vi.mocked(catalogRepository.createResource).mockImplementation(async () => {
      callOrder.push('db-insert');
      return mockResource;
    });

    await catalogService.createResource(input, 1);

    expect(callOrder).toEqual(['r2-upload', 'db-insert']);
  });

  it('computes a sha256-prefixed checksum matching the SRS example format', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.countFreeSamples).mockResolvedValue(0);
    vi.mocked(catalogRepository.createResource).mockResolvedValue(mockResource);

    await catalogService.createResource(input, 1);

    const callArgs = vi.mocked(catalogRepository.createResource).mock.calls[0]?.[0];
    expect(callArgs?.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('writes an AdminActionLog entry after a successful create (FR-2.4)', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.countFreeSamples).mockResolvedValue(0);
    vi.mocked(catalogRepository.createResource).mockResolvedValue(mockResource);

    await catalogService.createResource(input, 42);

    expect(writeAuditLog).toHaveBeenCalledWith(42, 'create', 'Resource', mockResource.id);
  });
});

describe('deleteResource', () => {
  it('throws RESOURCE_NOT_FOUND when the resource does not exist', async () => {
    vi.mocked(catalogRepository.findResourceById).mockResolvedValue(null);

    await expect(catalogService.deleteResource(999, 1)).rejects.toThrow(NotFoundError);
  });

  it('deletes the DB row BEFORE the R2 object (SRS exact ordering)', async () => {
    vi.mocked(catalogRepository.findResourceById).mockResolvedValue(mockResource);
    const callOrder: string[] = [];
    vi.mocked(catalogRepository.deleteResource).mockImplementation(async () => {
      callOrder.push('db-delete');
      return mockResource;
    });
    vi.mocked(r2Client.deleteObject).mockImplementation(async () => {
      callOrder.push('r2-delete');
    });

    await catalogService.deleteResource(10, 1);

    expect(callOrder).toEqual(['db-delete', 'r2-delete']);
  });

  it('does not throw when the R2 delete fails — caught and logged, not surfaced to the caller', async () => {
    vi.mocked(catalogRepository.findResourceById).mockResolvedValue(mockResource);
    vi.mocked(catalogRepository.deleteResource).mockResolvedValue(mockResource);
    vi.mocked(r2Client.deleteObject).mockRejectedValue(new Error('R2 is down'));

    await expect(catalogService.deleteResource(10, 1)).resolves.toBeUndefined();
  });
});

describe('deleteCourse (cascade)', () => {
  it('throws COURSE_NOT_FOUND when the course does not exist', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(null);

    await expect(catalogService.deleteCourse(999, 1)).rejects.toThrow(NotFoundError);
  });

  it('deletes every resource under the course before deleting the course row itself', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.findResourcesByCourse).mockResolvedValue([
      mockResource,
      { ...mockResource, id: 11 },
    ]);
    vi.mocked(catalogRepository.findResourceById).mockImplementation(async (id) =>
      id === 10 || id === 11 ? { ...mockResource, id } : null,
    );
    vi.mocked(catalogRepository.deleteResource).mockImplementation(async (id) => ({
      ...mockResource,
      id,
    }));

    await catalogService.deleteCourse(5, 1);

    expect(catalogRepository.deleteResource).toHaveBeenCalledTimes(2);
    expect(catalogRepository.deleteCourseRow).toHaveBeenCalledWith(5);
    // R2 cleanup happens per-resource, inside deleteResource, so 2
    // resources means 2 R2 delete attempts.
    expect(r2Client.deleteObject).toHaveBeenCalledTimes(2);
  });
});

describe('deleteDepartment (cascade)', () => {
  it('throws DEPARTMENT_NOT_FOUND when the department does not exist', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(null);

    await expect(catalogService.deleteDepartment(999, 1)).rejects.toThrow(NotFoundError);
  });

  it('deletes every resource under every course under the department, then each course, then the department itself', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(mockDepartment);
    vi.mocked(catalogRepository.findCoursesByDepartment).mockResolvedValue([
      mockCourse,
      { ...mockCourse, id: 6 },
    ]);
    vi.mocked(catalogRepository.findResourcesByCourse).mockResolvedValue([mockResource]);
    vi.mocked(catalogRepository.findResourceById).mockResolvedValue(mockResource);
    vi.mocked(catalogRepository.deleteResource).mockResolvedValue(mockResource);

    await catalogService.deleteDepartment(2, 1);

    // 2 courses, 1 resource each -> deleteResource called twice total
    expect(catalogRepository.deleteResource).toHaveBeenCalledTimes(2);
    expect(catalogRepository.deleteCourseRow).toHaveBeenCalledWith(5);
    expect(catalogRepository.deleteCourseRow).toHaveBeenCalledWith(6);
    expect(catalogRepository.deleteDepartmentRow).toHaveBeenCalledWith(2);
  });

  it('deletes the department row itself only after every child course is already gone', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(mockDepartment);
    vi.mocked(catalogRepository.findCoursesByDepartment).mockResolvedValue([mockCourse]);
    vi.mocked(catalogRepository.findResourcesByCourse).mockResolvedValue([]);

    const callOrder: string[] = [];
    vi.mocked(catalogRepository.deleteCourseRow).mockImplementation(async (id) => {
      callOrder.push(`course-${id}`);
      return mockCourse;
    });
    vi.mocked(catalogRepository.deleteDepartmentRow).mockImplementation(async (id) => {
      callOrder.push(`department-${id}`);
      return mockDepartment;
    });

    await catalogService.deleteDepartment(2, 1);

    expect(callOrder).toEqual(['course-5', 'department-2']);
  });

  it('writes an AdminActionLog entry for every course deleted, and for the department itself', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(mockDepartment);
    vi.mocked(catalogRepository.findCoursesByDepartment).mockResolvedValue([mockCourse]);
    vi.mocked(catalogRepository.findResourcesByCourse).mockResolvedValue([]);

    await catalogService.deleteDepartment(2, 77);

    expect(writeAuditLog).toHaveBeenCalledWith(77, 'delete', 'Course', 5);
    expect(writeAuditLog).toHaveBeenCalledWith(77, 'delete', 'Department', 2);
  });
});

describe('deleteStream (cascade)', () => {
  it('throws STREAM_NOT_FOUND when the stream does not exist', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(null);

    await expect(catalogService.deleteStream(999, 1)).rejects.toThrow(NotFoundError);
  });

  it('walks every department, every course under each department, and every resource under each course, in that order, before deleting the stream itself', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(mockStream);
    vi.mocked(catalogRepository.findDepartmentsByStream).mockResolvedValue([mockDepartment]);
    vi.mocked(catalogRepository.findCoursesByDepartment).mockResolvedValue([mockCourse]);
    vi.mocked(catalogRepository.findResourcesByCourse).mockResolvedValue([mockResource]);
    vi.mocked(catalogRepository.findResourceById).mockResolvedValue(mockResource);

    const callOrder: string[] = [];
    vi.mocked(catalogRepository.deleteResource).mockImplementation(async (id) => {
      callOrder.push(`resource-${id}`);
      return mockResource;
    });
    vi.mocked(catalogRepository.deleteCourseRow).mockImplementation(async (id) => {
      callOrder.push(`course-${id}`);
      return mockCourse;
    });
    vi.mocked(catalogRepository.deleteDepartmentRow).mockImplementation(async (id) => {
      callOrder.push(`department-${id}`);
      return mockDepartment;
    });
    vi.mocked(catalogRepository.deleteStreamRow).mockImplementation(async (id) => {
      callOrder.push(`stream-${id}`);
      return mockStream;
    });

    await catalogService.deleteStream(1, 1);

    expect(callOrder).toEqual(['resource-10', 'course-5', 'department-2', 'stream-1']);
  });

  it('handles multiple departments, each with their own courses and resources', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(mockStream);
    vi.mocked(catalogRepository.findDepartmentsByStream).mockResolvedValue([
      mockDepartment,
      { ...mockDepartment, id: 3, name: 'Electrical Engineering' },
    ]);
    vi.mocked(catalogRepository.findCoursesByDepartment).mockResolvedValue([mockCourse]);
    vi.mocked(catalogRepository.findResourcesByCourse).mockResolvedValue([]);

    await catalogService.deleteStream(1, 1);

    expect(catalogRepository.findCoursesByDepartment).toHaveBeenCalledWith(2);
    expect(catalogRepository.findCoursesByDepartment).toHaveBeenCalledWith(3);
    expect(catalogRepository.deleteDepartmentRow).toHaveBeenCalledTimes(2);
  });

  it('writes an AdminActionLog entry for every level: courses, departments, and the stream itself', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(mockStream);
    vi.mocked(catalogRepository.findDepartmentsByStream).mockResolvedValue([mockDepartment]);
    vi.mocked(catalogRepository.findCoursesByDepartment).mockResolvedValue([mockCourse]);
    vi.mocked(catalogRepository.findResourcesByCourse).mockResolvedValue([]);

    await catalogService.deleteStream(1, 88);

    expect(writeAuditLog).toHaveBeenCalledWith(88, 'delete', 'Course', 5);
    expect(writeAuditLog).toHaveBeenCalledWith(88, 'delete', 'Department', 2);
    expect(writeAuditLog).toHaveBeenCalledWith(88, 'delete', 'Stream', 1);
  });
});

describe('getResourcesForStudent', () => {
  it('throws COURSE_NOT_FOUND when the course does not exist', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(null);

    await expect(
      catalogService.getResourcesForStudent(1, 999, 'midterm', 'fp_abc', { page: 1, limit: 20 }),
    ).rejects.toThrow(NotFoundError);
  });

  it('checks device validity and subscription status ONCE per request, not once per resource', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.findResourcesByCourseAndCategory).mockResolvedValue({
      resources: [mockResource, { ...mockResource, id: 11 }, { ...mockResource, id: 12 }],
      total: 3,
    });
    vi.mocked(usersService.getSubscriptionStatus).mockResolvedValue({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2027-01-01'),
      activationStatus: 'activated',
    });
    vi.mocked(deviceService.isDeviceValid).mockResolvedValue(true);

    await catalogService.getResourcesForStudent(1, 5, 'midterm', 'fp_abc', { page: 1, limit: 20 });

    // 3 resources in the result, but the device/subscription checks
    // should each fire exactly once, not 3 times — this is the N+1
    // mistake caught and fixed while writing this function.
    expect(deviceService.isDeviceValid).toHaveBeenCalledTimes(1);
    expect(usersService.getSubscriptionStatus).toHaveBeenCalledTimes(1);
  });

  it('omits file_url/file_size_bytes/checksum entirely (not null) when locked', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.findResourcesByCourseAndCategory).mockResolvedValue({
      resources: [{ ...mockResource, isFreeSample: false }],
      total: 1,
    });
    vi.mocked(usersService.getSubscriptionStatus).mockResolvedValue({
      subscriptionStatus: 'none',
      subscriptionExpiryDate: null,
      activationStatus: 'pending',
    });
    vi.mocked(deviceService.isDeviceValid).mockResolvedValue(false);

    const result = await catalogService.getResourcesForStudent(1, 5, 'midterm', 'fp_abc', {
      page: 1,
      limit: 20,
    });

    const view = result.resources[0];
    expect(view?.locked).toBe(true);
    expect(view?.reasonCode).toBe('premium_required');
    expect('fileUrl' in (view ?? {})).toBe(false); // key genuinely absent, not undefined-valued
  });

  it('treats a missing deviceFingerprint (no fingerprint on the access token) as an invalid device, not a crash', async () => {
    vi.mocked(catalogRepository.findCourseById).mockResolvedValue(mockCourse);
    vi.mocked(catalogRepository.findResourcesByCourseAndCategory).mockResolvedValue({
      resources: [{ ...mockResource, isFreeSample: false }],
      total: 1,
    });
    vi.mocked(usersService.getSubscriptionStatus).mockResolvedValue({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date('2027-01-01'),
      activationStatus: 'activated',
    });

    const result = await catalogService.getResourcesForStudent(1, 5, 'midterm', undefined, {
      page: 1,
      limit: 20,
    });

    expect(result.resources[0]?.locked).toBe(true);
    expect(result.resources[0]?.reasonCode).toBe('device_mismatch');
    expect(deviceService.isDeviceValid).not.toHaveBeenCalled(); // no fingerprint -> no point checking
  });
});

describe('search', () => {
  it('returns both course and resource results, applying the same locking rules as browse', async () => {
    vi.mocked(catalogRepository.searchCourses).mockResolvedValue([mockCourse]);
    vi.mocked(catalogRepository.searchResources).mockResolvedValue([mockResource]);
    vi.mocked(usersService.getSubscriptionStatus).mockResolvedValue({
      subscriptionStatus: 'none',
      subscriptionExpiryDate: null,
      activationStatus: 'pending',
    });
    vi.mocked(deviceService.isDeviceValid).mockResolvedValue(false);

    const results = await catalogService.search('data structures', 1, 'fp_abc');

    expect(results).toEqual([
      { type: 'course', id: mockCourse.id, name: mockCourse.name },
      { type: 'resource', id: mockResource.id, title: mockResource.title, locked: true },
    ]);
  });
});

