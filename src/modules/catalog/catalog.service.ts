import { createHash } from 'node:crypto';
import type { Resource, ResourceCategory } from '@prisma/client';
import {
  ALLOWED_FILE_MIME_TYPE,
  FREE_SAMPLE_LIMIT_PER_COURSE_CATEGORY,
} from '../../config/constants';
import { env } from '../../config/env';
import { writeAuditLog } from '../../infrastructure/audit/audit-log';
import * as r2Client from '../../infrastructure/storage/r2-client';
import { BadRequestError, NotFoundError } from '../../shared/errors/app-errors';
import {
  buildPaginationEnvelope,
  type PaginationEnvelope,
  type PageParams,
} from '../../shared/utils/paginate';
import { generateObjectKey } from '../../shared/utils/generate-object-key';
import * as deviceService from '../device/device.service';
import * as usersService from '../users/users.service';
import { decideAccess } from './access-policy';
import * as catalogRepository from './catalog.repository';
import type {
  CourseFilters,
  CreateResourceInput,
  PublicCourse,
  PublicDepartment,
  PublicResource,
  PublicStream,
  SearchResult,
  StudentResourceView,
} from './catalog.types';

// ---- Streams ----

export const getStreams = async (): Promise<PublicStream[]> => {
  const streams = await catalogRepository.findAllStreams();
  return streams.map((s) => ({ id: s.id, name: s.name, createdAt: s.createdAt }));
};

// FR-2.4 — every admin CRUD action recorded in AdminActionLog.
// actionType/targetType strings are free-form (schema.prisma: "grows
// over time," not an enum) — 'create'/'update' plus the entity name,
// consistent naming across every function below.
export const createStream = async (name: string, adminId: number): Promise<PublicStream> => {
  const existing = await catalogRepository.findStreamByName(name);
  if (existing) {
    throw new BadRequestError('STREAM_ALREADY_EXISTS', 'A stream with this name already exists');
  }
  const stream = await catalogRepository.createStream(name);
  await writeAuditLog(adminId, 'create', 'Stream', stream.id);
  return { id: stream.id, name: stream.name, createdAt: stream.createdAt };
};

export const updateStream = async (
  id: number,
  name: string,
  adminId: number,
): Promise<PublicStream> => {
  const current = await catalogRepository.findStreamById(id);
  if (!current) throw new NotFoundError('Stream not found', 'STREAM_NOT_FOUND');

  const existing = await catalogRepository.findStreamByName(name);
  if (existing && existing.id !== id) {
    throw new BadRequestError('STREAM_ALREADY_EXISTS', 'A stream with this name already exists');
  }

  const stream = await catalogRepository.updateStream(id, name);
  await writeAuditLog(adminId, 'update', 'Stream', stream.id);
  return { id: stream.id, name: stream.name, createdAt: stream.createdAt };
};

// ---- Departments ----

export const getDepartments = async (streamId: number): Promise<PublicDepartment[]> => {
  const departments = await catalogRepository.findDepartmentsByStream(streamId);
  return departments.map((d) => ({
    id: d.id,
    streamId: d.streamId,
    name: d.name,
    createdAt: d.createdAt,
  }));
};

export const createDepartment = async (
  streamId: number,
  name: string,
  adminId: number,
): Promise<PublicDepartment> => {
  const stream = await catalogRepository.findStreamById(streamId);
  if (!stream) throw new NotFoundError('Stream not found', 'STREAM_NOT_FOUND');

  const existing = await catalogRepository.findDepartmentByStreamAndName(streamId, name);
  if (existing) {
    throw new BadRequestError(
      'DEPARTMENT_ALREADY_EXISTS',
      'A department with this name already exists in this stream',
    );
  }

  const department = await catalogRepository.createDepartment(streamId, name);
  await writeAuditLog(adminId, 'create', 'Department', department.id);
  return {
    id: department.id,
    streamId: department.streamId,
    name: department.name,
    createdAt: department.createdAt,
  };
};

export const updateDepartment = async (
  id: number,
  data: { streamId?: number; name?: string },
  adminId: number,
): Promise<PublicDepartment> => {
  const current = await catalogRepository.findDepartmentById(id);
  if (!current) throw new NotFoundError('Department not found', 'DEPARTMENT_NOT_FOUND');

  if (data.streamId !== undefined) {
    const stream = await catalogRepository.findStreamById(data.streamId);
    if (!stream) throw new NotFoundError('Stream not found', 'STREAM_NOT_FOUND');
  }

  // Merge current + incoming to know the final (streamId, name) pair for
  // the duplicate check, since either field alone might be unchanged.
  const finalStreamId = data.streamId ?? current.streamId;
  const finalName = data.name ?? current.name;
  const existing = await catalogRepository.findDepartmentByStreamAndName(finalStreamId, finalName);
  if (existing && existing.id !== id) {
    throw new BadRequestError(
      'DEPARTMENT_ALREADY_EXISTS',
      'A department with this name already exists in this stream',
    );
  }

  const department = await catalogRepository.updateDepartment(id, data);
  await writeAuditLog(adminId, 'update', 'Department', department.id);
  return {
    id: department.id,
    streamId: department.streamId,
    name: department.name,
    createdAt: department.createdAt,
  };
};

// ---- Courses ----

export const getCourses = async (
  filters: CourseFilters,
  pagination: PageParams,
): Promise<{ courses: PublicCourse[]; pagination: PaginationEnvelope }> => {
  const { courses, total } = await catalogRepository.findCourses(filters, pagination);
  return {
    courses: courses.map((c) => ({
      id: c.id,
      departmentId: c.departmentId,
      academicYear: c.academicYear,
      name: c.name,
      createdAt: c.createdAt,
    })),
    pagination: buildPaginationEnvelope(pagination, total),
  };
};

export const createCourse = async (
  data: {
    departmentId: number;
    academicYear: number;
    name: string;
  },
  adminId: number,
): Promise<PublicCourse> => {
  const department = await catalogRepository.findDepartmentById(data.departmentId);
  if (!department) throw new NotFoundError('Department not found', 'DEPARTMENT_NOT_FOUND');

  const existing = await catalogRepository.findCourseByDeptYearName(
    data.departmentId,
    data.academicYear,
    data.name,
  );
  if (existing) {
    throw new BadRequestError(
      'COURSE_ALREADY_EXISTS',
      'A course with this name already exists for this department and year',
    );
  }

  const course = await catalogRepository.createCourse(data);
  await writeAuditLog(adminId, 'create', 'Course', course.id);
  return {
    id: course.id,
    departmentId: course.departmentId,
    academicYear: course.academicYear,
    name: course.name,
    createdAt: course.createdAt,
  };
};

export const updateCourse = async (
  id: number,
  data: { departmentId?: number; academicYear?: number; name?: string },
  adminId: number,
): Promise<PublicCourse> => {
  const current = await catalogRepository.findCourseById(id);
  if (!current) throw new NotFoundError('Course not found', 'COURSE_NOT_FOUND');

  if (data.departmentId !== undefined) {
    const department = await catalogRepository.findDepartmentById(data.departmentId);
    if (!department) throw new NotFoundError('Department not found', 'DEPARTMENT_NOT_FOUND');
  }

  const finalDepartmentId = data.departmentId ?? current.departmentId;
  const finalAcademicYear = data.academicYear ?? current.academicYear;
  const finalName = data.name ?? current.name;
  const existing = await catalogRepository.findCourseByDeptYearName(
    finalDepartmentId,
    finalAcademicYear,
    finalName,
  );
  if (existing && existing.id !== id) {
    throw new BadRequestError(
      'COURSE_ALREADY_EXISTS',
      'A course with this name already exists for this department and year',
    );
  }

  const course = await catalogRepository.updateCourse(id, data);
  await writeAuditLog(adminId, 'update', 'Course', course.id);
  return {
    id: course.id,
    departmentId: course.departmentId,
    academicYear: course.academicYear,
    name: course.name,
    createdAt: course.createdAt,
  };
};

// ---- Cascade delete (Streams/Departments/Courses -> Resources) ----
// Sequential, not batched with Promise.all — deliberately simple over
// throughput-optimal, matching the architecture doc's own framing of
// this app's actual scale ("1-2 admins, occasional files," not a
// high-volume system). Sequential also means each deletion gets its
// own AdminActionLog entry in a traceable order, which a batched
// approach would muddy for no real benefit at this volume.

const deleteAllResourcesForCourse = async (courseId: number, adminId: number): Promise<void> => {
  const resources = await catalogRepository.findResourcesByCourse(courseId);
  for (const resource of resources) {
    await deleteResource(resource.id, adminId);
  }
};

export const deleteCourse = async (id: number, adminId: number): Promise<void> => {
  const course = await catalogRepository.findCourseById(id);
  if (!course) throw new NotFoundError('Course not found', 'COURSE_NOT_FOUND');

  await deleteAllResourcesForCourse(id, adminId);
  await catalogRepository.deleteCourseRow(id);
  await writeAuditLog(adminId, 'delete', 'Course', id);
};

export const deleteDepartment = async (id: number, adminId: number): Promise<void> => {
  const department = await catalogRepository.findDepartmentById(id);
  if (!department) throw new NotFoundError('Department not found', 'DEPARTMENT_NOT_FOUND');

  const courses = await catalogRepository.findCoursesByDepartment(id);
  for (const course of courses) {
    await deleteAllResourcesForCourse(course.id, adminId);
    await catalogRepository.deleteCourseRow(course.id);
    await writeAuditLog(adminId, 'delete', 'Course', course.id);
  }

  await catalogRepository.deleteDepartmentRow(id);
  await writeAuditLog(adminId, 'delete', 'Department', id);
};

export const deleteStream = async (id: number, adminId: number): Promise<void> => {
  const stream = await catalogRepository.findStreamById(id);
  if (!stream) throw new NotFoundError('Stream not found', 'STREAM_NOT_FOUND');

  const departments = await catalogRepository.findDepartmentsByStream(id);
  for (const department of departments) {
    const courses = await catalogRepository.findCoursesByDepartment(department.id);
    for (const course of courses) {
      await deleteAllResourcesForCourse(course.id, adminId);
      await catalogRepository.deleteCourseRow(course.id);
      await writeAuditLog(adminId, 'delete', 'Course', course.id);
    }
    await catalogRepository.deleteDepartmentRow(department.id);
    await writeAuditLog(adminId, 'delete', 'Department', department.id);
  }

  await catalogRepository.deleteStreamRow(id);
  await writeAuditLog(adminId, 'delete', 'Stream', id);
};

// ---- Resources ----

const toPublicResource = (resource: Resource): PublicResource => ({
  id: resource.id,
  courseId: resource.courseId,
  category: resource.category,
  title: resource.title,
  description: resource.description,
  fileUrl: resource.fileUrl,
  fileSizeBytes: resource.fileSizeBytes,
  checksum: resource.checksum,
  isFreeSample: resource.isFreeSample,
  uploadedByAdminId: resource.uploadedByAdminId,
  createdAt: resource.createdAt,
});

// R2's public URL is stored in full on the row (fileUrl), but only the
// key portion is needed to delete or replace the object — this strips
// the known R2_PUBLIC_URL prefix back off.
const extractKeyFromUrl = (fileUrl: string): string => fileUrl.slice(env.R2_PUBLIC_URL.length + 1);

export const createResource = async (
  input: CreateResourceInput,
  adminId: number,
): Promise<PublicResource> => {
  const course = await catalogRepository.findCourseById(input.courseId);
  if (!course) throw new NotFoundError('Course not found', 'COURSE_NOT_FOUND');

  // FR-2.5 — checked BEFORE uploading anything to R2. No point
  // buffering a 2MB upload to Cloudflare only to reject it a moment
  // later; the limit is knowable from the database alone.
  if (input.isFreeSample) {
    const freeSampleCount = await catalogRepository.countFreeSamples(
      input.courseId,
      input.category,
    );
    if (freeSampleCount >= FREE_SAMPLE_LIMIT_PER_COURSE_CATEGORY) {
      throw new BadRequestError(
        'FREE_SAMPLE_LIMIT_REACHED',
        `Only ${FREE_SAMPLE_LIMIT_PER_COURSE_CATEGORY} free samples are allowed per course and category`,
      );
    }
  }

  // R2 upload FIRST, DB insert second (DB doc sec 15) — a DB failure
  // after a successful upload only leaves a harmless orphaned file; the
  // reverse order risks a DB row surviving with no real file behind it,
  // a visible broken link to students.
  const checksum = `sha256:${createHash('sha256').update(input.file).digest('hex')}`;
  const key = generateObjectKey('resources', 'pdf');
  await r2Client.upload(input.file, key, ALLOWED_FILE_MIME_TYPE);
  const fileUrl = r2Client.buildUrl(key);

  const resource = await catalogRepository.createResource({
    courseId: input.courseId,
    category: input.category,
    title: input.title,
    description: input.description ?? null,
    isFreeSample: input.isFreeSample,
    fileUrl,
    fileSizeBytes: input.file.length,
    checksum,
    uploadedByAdminId: adminId,
  });

  await writeAuditLog(adminId, 'create', 'Resource', resource.id);
  return toPublicResource(resource);
};

export const updateResource = async (
  id: number,
  data: {
    title?: string;
    description?: string;
    category?: ResourceCategory;
    isFreeSample?: boolean;
    file?: Buffer;
  },
  adminId: number,
): Promise<PublicResource> => {
  const current = await catalogRepository.findResourceById(id);
  if (!current) throw new NotFoundError('Resource not found', 'RESOURCE_NOT_FOUND');

  // Not explicitly spelled out in the SRS (which only says "replace its
  // file" as a purpose, without detailing the mechanics) — my own
  // extension of the same create-then-cleanup ordering used elsewhere:
  // upload the new file first, update the DB row second, and only then
  // best-effort delete the OLD R2 object. If the old-object cleanup
  // fails, it's caught and logged the same way resource deletion
  // handles an R2 failure — an orphaned old file is low-severity, and
  // by this point the resource already correctly points at the new one.
  let fileFields: { fileUrl: string; fileSizeBytes: number; checksum: string } | undefined;
  let oldKeyToCleanUp: string | undefined;

  if (data.file) {
    const checksum = `sha256:${createHash('sha256').update(data.file).digest('hex')}`;
    const key = generateObjectKey('resources', 'pdf');
    await r2Client.upload(data.file, key, ALLOWED_FILE_MIME_TYPE);
    fileFields = { fileUrl: r2Client.buildUrl(key), fileSizeBytes: data.file.length, checksum };
    oldKeyToCleanUp = extractKeyFromUrl(current.fileUrl);
  }

  const resource = await catalogRepository.updateResource(id, {
    ...(data.title === undefined ? {} : { title: data.title }),
    ...(data.description === undefined ? {} : { description: data.description }),
    ...(data.category === undefined ? {} : { category: data.category }),
    ...(data.isFreeSample === undefined ? {} : { isFreeSample: data.isFreeSample }),
    ...(fileFields ?? {}),
  });

  await writeAuditLog(adminId, 'update', 'Resource', resource.id);

  if (oldKeyToCleanUp) {
    try {
      await r2Client.deleteObject(oldKeyToCleanUp);
    } catch (err) {
      console.error('[catalog] Failed to delete replaced R2 object for resource', id, err);
    }
  }

  return toPublicResource(resource);
};

export const deleteResource = async (id: number, adminId: number): Promise<void> => {
  const resource = await catalogRepository.findResourceById(id);
  if (!resource) throw new NotFoundError('Resource not found', 'RESOURCE_NOT_FOUND');

  // DB row deleted (soft) FIRST, then R2 — SRS's exact stated ordering.
  await catalogRepository.deleteResource(id);
  await writeAuditLog(adminId, 'delete', 'Resource', id);

  try {
    await r2Client.deleteObject(extractKeyFromUrl(resource.fileUrl));
  } catch (err) {
    // Caught and logged, not retried, not rolled back — an orphaned R2
    // file is low-severity (invisible, cleanable later); the DB row is
    // already gone either way, so there's no broken-link risk regardless.
    console.error('[catalog] Failed to delete R2 object for resource', id, err);
  }
};

// Named and ordered exactly as architecture doc Flow 1 calls it:
// catalog.service.getResourcesForStudent(userId, courseId, category, deviceFingerprint).
export const getResourcesForStudent = async (
  userId: number,
  courseId: number,
  category: ResourceCategory,
  deviceFingerprint: string | undefined,
  pagination: PageParams,
): Promise<{ resources: StudentResourceView[]; pagination: PaginationEnvelope }> => {
  const course = await catalogRepository.findCourseById(courseId);
  if (!course) throw new NotFoundError('Course not found', 'COURSE_NOT_FOUND');

  const { resources, total } = await catalogRepository.findResourcesByCourseAndCategory(
    courseId,
    category,
    pagination,
  );

  // Computed once per request, not once per resource in the list below
  // — neither fact depends on which resource is being evaluated, only
  // on who's asking and from which device.
  const subscriptionStatus = await usersService.getSubscriptionStatus(userId);
  const deviceValid = deviceFingerprint
    ? await deviceService.isDeviceValid(userId, deviceFingerprint)
    : false;

  const resourceViews: StudentResourceView[] = resources.map((resource) => {
    const decision = decideAccess({
      isFreeSample: resource.isFreeSample,
      deviceValid,
      subscriptionStatus: subscriptionStatus?.subscriptionStatus ?? 'none',
      activationStatus: subscriptionStatus?.activationStatus ?? 'pending',
    });

    return {
      id: resource.id,
      title: resource.title,
      description: resource.description,
      category: resource.category,
      isFreeSample: resource.isFreeSample,
      locked: decision.locked,
      ...(decision.reasonCode === undefined ? {} : { reasonCode: decision.reasonCode }),
      ...(decision.message === undefined ? {} : { message: decision.message }),
      // file_url absent entirely when locked — not null, not empty
      // (SRS's own explicit note) — the conditional spread achieves
      // exactly that: the key doesn't exist on the object at all.
      ...(decision.locked
        ? {}
        : {
            fileUrl: resource.fileUrl,
            fileSizeBytes: resource.fileSizeBytes,
            checksum: resource.checksum,
          }),
    };
  });

  return { resources: resourceViews, pagination: buildPaginationEnvelope(pagination, total) };
};

// FR-3.4 — course and resource titles only. "Same locking rules apply
// to results as the browse endpoint" (SRS's own wording for
// GET /search) — a locked resource still appears, just without
// fileUrl/fileSizeBytes/checksum implied by its locked: true.
export const search = async (
  query: string,
  userId: number,
  deviceFingerprint: string | undefined,
): Promise<SearchResult[]> => {
  const [courses, resources] = await Promise.all([
    catalogRepository.searchCourses(query),
    catalogRepository.searchResources(query),
  ]);

  const courseResults: SearchResult[] = courses.map((c) => ({
    type: 'course',
    id: c.id,
    name: c.name,
  }));

  const subscriptionStatus = await usersService.getSubscriptionStatus(userId);
  const deviceValid = deviceFingerprint
    ? await deviceService.isDeviceValid(userId, deviceFingerprint)
    : false;

  const resourceResults: SearchResult[] = resources.map((resource) => {
    const decision = decideAccess({
      isFreeSample: resource.isFreeSample,
      deviceValid,
      subscriptionStatus: subscriptionStatus?.subscriptionStatus ?? 'none',
      activationStatus: subscriptionStatus?.activationStatus ?? 'pending',
    });
    return { type: 'resource', id: resource.id, title: resource.title, locked: decision.locked };
  });

  return [...courseResults, ...resourceResults];
};

// For modules/issues/ — the architecture doc is explicit that issues
// "reads (not writes) catalog's resource existence via catalog.service,
// not its repository." A plain boolean, deliberately not the full
// PublicResource shape — issues only ever needs to know "does this
// resource exist" (to 404 before creating a report), it has no
// business seeing file URLs, checksums, or any other resource detail.
// Doesn't filter on anything beyond findResourceById's own
// deletedAt: null (a report against a since-deleted resource correctly
// 404s the same as one that never existed).
export const resourceExists = async (resourceId: number): Promise<boolean> => {
  const resource = await catalogRepository.findResourceById(resourceId);
  return resource !== null;
};
