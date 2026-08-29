import type {
  Course,
  Department,
  Prisma,
  Resource,
  ResourceCategory,
  Stream,
} from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';
import { toSkipTake, type PageParams } from '../../shared/utils/paginate';
import type { CourseFilters, CreateResourceInput } from './catalog.types';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// ---- Streams ----

export const findAllStreams = (tx: PrismaOrTx = prisma): Promise<Stream[]> =>
  tx.stream.findMany({ orderBy: { name: 'asc' } });

export const findStreamById = (id: number, tx: PrismaOrTx = prisma): Promise<Stream | null> =>
  tx.stream.findUnique({ where: { id } });

// For the STREAM_ALREADY_EXISTS check — pre-checking before insert
// rather than catching Prisma's P2002, matching the pattern already
// established in auth.service (findByEmail/findByPhone before create).
export const findStreamByName = (name: string, tx: PrismaOrTx = prisma): Promise<Stream | null> =>
  tx.stream.findUnique({ where: { name } });

export const createStream = (name: string, tx: PrismaOrTx = prisma): Promise<Stream> =>
  tx.stream.create({ data: { name } });

export const updateStream = (id: number, name: string, tx: PrismaOrTx = prisma): Promise<Stream> =>
  tx.stream.update({ where: { id }, data: { name } });

// ---- Departments ----

export const findDepartmentsByStream = (
  streamId: number,
  tx: PrismaOrTx = prisma,
): Promise<Department[]> =>
  tx.department.findMany({ where: { streamId }, orderBy: { name: 'asc' } });

export const findDepartmentById = (
  id: number,
  tx: PrismaOrTx = prisma,
): Promise<Department | null> => tx.department.findUnique({ where: { id } });

// For DEPARTMENT_ALREADY_EXISTS — matches the DB's composite unique on
// (stream_id, name).
export const findDepartmentByStreamAndName = (
  streamId: number,
  name: string,
  tx: PrismaOrTx = prisma,
): Promise<Department | null> =>
  tx.department.findUnique({ where: { streamId_name: { streamId, name } } });

export const createDepartment = (
  streamId: number,
  name: string,
  tx: PrismaOrTx = prisma,
): Promise<Department> => tx.department.create({ data: { streamId, name } });

export const updateDepartment = (
  id: number,
  data: { streamId?: number; name?: string },
  tx: PrismaOrTx = prisma,
): Promise<Department> => tx.department.update({ where: { id }, data });

// ---- Courses ----

export const findCourses = async (
  filters: CourseFilters,
  pagination: PageParams,
  tx: PrismaOrTx = prisma,
): Promise<{ courses: Course[]; total: number }> => {
  const where: Prisma.CourseWhereInput = {
    ...(filters.departmentId === undefined ? {} : { departmentId: filters.departmentId }),
    ...(filters.academicYear === undefined ? {} : { academicYear: filters.academicYear }),
    // streamId isn't a direct Course column (deliberately, per
    // schema.prisma's own comment — Department already implies Stream,
    // storing both risks silent disagreement) — filtering by it means
    // filtering by the parent Department's streamId instead.
    ...(filters.streamId === undefined ? {} : { department: { streamId: filters.streamId } }),
  };

  const [courses, total] = await Promise.all([
    tx.course.findMany({ where, ...toSkipTake(pagination), orderBy: { name: 'asc' } }),
    tx.course.count({ where }),
  ]);

  return { courses, total };
};

export const findCourseById = (id: number, tx: PrismaOrTx = prisma): Promise<Course | null> =>
  tx.course.findUnique({ where: { id } });

// For COURSE_ALREADY_EXISTS — matches the DB's composite unique on
// (department_id, academic_year, name).
export const findCourseByDeptYearName = (
  departmentId: number,
  academicYear: number,
  name: string,
  tx: PrismaOrTx = prisma,
): Promise<Course | null> =>
  tx.course.findUnique({
    where: { departmentId_academicYear_name: { departmentId, academicYear, name } },
  });

export const createCourse = (
  data: { departmentId: number; academicYear: number; name: string },
  tx: PrismaOrTx = prisma,
): Promise<Course> => tx.course.create({ data });

export const updateCourse = (
  id: number,
  data: { departmentId?: number; academicYear?: number; name?: string },
  tx: PrismaOrTx = prisma,
): Promise<Course> => tx.course.update({ where: { id }, data });

// For DEPARTMENT/STREAM cascade-delete — need every Course under a
// Department, to then walk each Course's Resources.
export const findCoursesByDepartment = (
  departmentId: number,
  tx: PrismaOrTx = prisma,
): Promise<Course[]> => tx.course.findMany({ where: { departmentId } });

// ---- Cascade-delete raw removals (Streams/Departments/Courses) ----
// Hard deletes — no soft-delete field on these three tables
// (schema.prisma comment: "hard delete, RESTRICT — no deleted_at").
// Only safe to call once every descendant Resource is already gone,
// which catalog.service orchestrates before ever calling these.

export const deleteStreamRow = (id: number, tx: PrismaOrTx = prisma): Promise<Stream> =>
  tx.stream.delete({ where: { id } });

export const deleteDepartmentRow = (id: number, tx: PrismaOrTx = prisma): Promise<Department> =>
  tx.department.delete({ where: { id } });

export const deleteCourseRow = (id: number, tx: PrismaOrTx = prisma): Promise<Course> =>
  tx.course.delete({ where: { id } });

// ---- Resources ----

export const findResourcesByCourseAndCategory = async (
  courseId: number,
  category: ResourceCategory,
  pagination: PageParams,
  tx: PrismaOrTx = prisma,
): Promise<{ resources: Resource[]; total: number }> => {
  const where: Prisma.ResourceWhereInput = { courseId, category, deletedAt: null };
  const [resources, total] = await Promise.all([
    tx.resource.findMany({ where, ...toSkipTake(pagination), orderBy: { createdAt: 'desc' } }),
    tx.resource.count({ where }),
  ]);
  return { resources, total };
};

export const findResourceById = (id: number, tx: PrismaOrTx = prisma): Promise<Resource | null> =>
  tx.resource.findFirst({ where: { id, deletedAt: null } });

// For cascade-delete only — every resource under a course, regardless
// of category, so the service can walk and delete each one before the
// course itself can be removed.
export const findResourcesByCourse = (
  courseId: number,
  tx: PrismaOrTx = prisma,
): Promise<Resource[]> => tx.resource.findMany({ where: { courseId, deletedAt: null } });

// FR-2.5 — max 2 free samples per (course, category).
export const countFreeSamples = (
  courseId: number,
  category: ResourceCategory,
  tx: PrismaOrTx = prisma,
): Promise<number> =>
  tx.resource.count({ where: { courseId, category, isFreeSample: true, deletedAt: null } });

export const createResource = (
  data: Omit<CreateResourceInput, 'file' | 'originalFileName' | 'description'> & {
    description: string | null;
    fileUrl: string;
    fileSizeBytes: number;
    checksum: string;
    uploadedByAdminId: number;
  },
  tx: PrismaOrTx = prisma,
): Promise<Resource> => tx.resource.create({ data });

export const updateResource = (
  id: number,
  data: Partial<{
    title: string;
    description: string | null;
    category: ResourceCategory;
    isFreeSample: boolean;
    fileUrl: string;
    fileSizeBytes: number;
    checksum: string;
  }>,
  tx: PrismaOrTx = prisma,
): Promise<Resource> => tx.resource.update({ where: { id }, data });

// Soft delete — Resource has deletedAt (DB doc sec 13). The row is
// hidden from every student-facing query immediately (browse and
// search both filter deletedAt: null), but the row itself persists.
// R2 object deletion is a separate step catalog.service orchestrates
// right after this, per the SRS's exact ordering: DB row first, then R2.
export const deleteResource = (id: number, tx: PrismaOrTx = prisma): Promise<Resource> =>
  tx.resource.update({ where: { id }, data: { deletedAt: new Date() } });

// ---- Search (FR-3.4: course and resource titles only) ----

export const searchCourses = (query: string, tx: PrismaOrTx = prisma): Promise<Course[]> =>
  tx.course.findMany({ where: { name: { contains: query, mode: 'insensitive' } } });

export const searchResources = (query: string, tx: PrismaOrTx = prisma): Promise<Resource[]> =>
  tx.resource.findMany({
    where: { title: { contains: query, mode: 'insensitive' }, deletedAt: null },
  });
