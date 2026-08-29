import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as catalogRepository from '../../../../src/modules/catalog/catalog.repository';
import * as catalogService from '../../../../src/modules/catalog/catalog.service';
import { writeAuditLog } from '../../../../src/infrastructure/audit/audit-log';
import { BadRequestError, NotFoundError } from '../../../../src/shared/errors/app-errors';

vi.mock('../../../../src/modules/catalog/catalog.repository');
vi.mock('../../../../src/infrastructure/audit/audit-log');

const mockStream = { id: 1, name: 'Engineering', createdAt: new Date('2026-01-01') };
const mockDepartment = {
  id: 2,
  streamId: 1,
  name: 'Software Engineering',
  createdAt: new Date('2026-01-01'),
};
const mockCourse = {
  id: 3,
  departmentId: 2,
  academicYear: 2,
  name: 'Data Structures',
  createdAt: new Date('2026-01-01'),
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createStream', () => {
  it('throws STREAM_ALREADY_EXISTS when the name is taken, and never writes an audit log', async () => {
    vi.mocked(catalogRepository.findStreamByName).mockResolvedValue(mockStream);

    await expect(catalogService.createStream('Engineering', 1)).rejects.toThrow(BadRequestError);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('creates the stream and writes an AdminActionLog entry (FR-2.4)', async () => {
    vi.mocked(catalogRepository.findStreamByName).mockResolvedValue(null);
    vi.mocked(catalogRepository.createStream).mockResolvedValue(mockStream);

    await catalogService.createStream('Engineering', 99);

    expect(writeAuditLog).toHaveBeenCalledWith(99, 'create', 'Stream', 1);
  });
});

describe('updateStream', () => {
  it('throws STREAM_NOT_FOUND when the target stream does not exist', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(null);

    await expect(catalogService.updateStream(999, 'New Name', 1)).rejects.toThrow(NotFoundError);
  });

  it('does NOT throw ALREADY_EXISTS when the "duplicate" found is the stream being updated itself', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(mockStream);
    // findStreamByName finds mockStream itself (id: 1) — renaming to the
    // same name it already has, or a no-op rename, must not self-conflict.
    vi.mocked(catalogRepository.findStreamByName).mockResolvedValue(mockStream);
    vi.mocked(catalogRepository.updateStream).mockResolvedValue(mockStream);

    await expect(catalogService.updateStream(1, 'Engineering', 1)).resolves.toBeDefined();
  });

  it('throws ALREADY_EXISTS when a DIFFERENT stream already has the target name', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(mockStream);
    vi.mocked(catalogRepository.findStreamByName).mockResolvedValue({
      ...mockStream,
      id: 2, // a different stream owns this name
    });

    await expect(catalogService.updateStream(1, 'Applied Science', 1)).rejects.toThrow(
      BadRequestError,
    );
  });
});

describe('createDepartment', () => {
  it('throws STREAM_NOT_FOUND when the parent stream does not exist', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(null);

    await expect(catalogService.createDepartment(999, 'CS', 1)).rejects.toThrow(NotFoundError);
  });

  it('throws DEPARTMENT_ALREADY_EXISTS for a duplicate name within the same stream', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(mockStream);
    vi.mocked(catalogRepository.findDepartmentByStreamAndName).mockResolvedValue(mockDepartment);

    await expect(catalogService.createDepartment(1, 'Software Engineering', 1)).rejects.toThrow(
      BadRequestError,
    );
  });

  it('creates the department and logs the action', async () => {
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(mockStream);
    vi.mocked(catalogRepository.findDepartmentByStreamAndName).mockResolvedValue(null);
    vi.mocked(catalogRepository.createDepartment).mockResolvedValue(mockDepartment);

    await catalogService.createDepartment(1, 'Software Engineering', 99);

    expect(writeAuditLog).toHaveBeenCalledWith(99, 'create', 'Department', 2);
  });
});

describe('updateDepartment', () => {
  it('throws DEPARTMENT_NOT_FOUND when the target does not exist', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(null);

    await expect(catalogService.updateDepartment(999, { name: 'X' }, 1)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('throws STREAM_NOT_FOUND when reassigning to a nonexistent stream', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(mockDepartment);
    vi.mocked(catalogRepository.findStreamById).mockResolvedValue(null);

    await expect(catalogService.updateDepartment(2, { streamId: 999 }, 1)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('merges current + incoming fields to check duplicates correctly when only one field changes', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(mockDepartment);
    vi.mocked(catalogRepository.findDepartmentByStreamAndName).mockResolvedValue(null);
    vi.mocked(catalogRepository.updateDepartment).mockResolvedValue({
      ...mockDepartment,
      name: 'Renamed',
    });

    await catalogService.updateDepartment(2, { name: 'Renamed' }, 1);

    // Must check against the CURRENT streamId (1), not undefined, since
    // only name was supplied in this update.
    expect(catalogRepository.findDepartmentByStreamAndName).toHaveBeenCalledWith(1, 'Renamed');
  });
});

describe('createCourse', () => {
  it('throws DEPARTMENT_NOT_FOUND when the parent department does not exist', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(null);

    await expect(
      catalogService.createCourse({ departmentId: 999, academicYear: 2, name: 'X' }, 1),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws COURSE_ALREADY_EXISTS for a duplicate (department, year, name)', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(mockDepartment);
    vi.mocked(catalogRepository.findCourseByDeptYearName).mockResolvedValue(mockCourse);

    await expect(
      catalogService.createCourse({ departmentId: 2, academicYear: 2, name: 'Data Structures' }, 1),
    ).rejects.toThrow(BadRequestError);
  });

  it('creates the course and logs the action', async () => {
    vi.mocked(catalogRepository.findDepartmentById).mockResolvedValue(mockDepartment);
    vi.mocked(catalogRepository.findCourseByDeptYearName).mockResolvedValue(null);
    vi.mocked(catalogRepository.createCourse).mockResolvedValue(mockCourse);

    await catalogService.createCourse(
      { departmentId: 2, academicYear: 2, name: 'Data Structures' },
      99,
    );

    expect(writeAuditLog).toHaveBeenCalledWith(99, 'create', 'Course', 3);
  });
});

describe('getCourses', () => {
  it('maps streamId/departmentId/academicYear filters through to the repository and builds the pagination envelope', async () => {
    vi.mocked(catalogRepository.findCourses).mockResolvedValue({
      courses: [mockCourse],
      total: 47,
    });

    const result = await catalogService.getCourses({ departmentId: 2 }, { page: 1, limit: 20 });

    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 47, total_pages: 3 });
    expect(result.courses).toHaveLength(1);
  });
});
