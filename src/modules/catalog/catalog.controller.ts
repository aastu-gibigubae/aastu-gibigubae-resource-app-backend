import type { Request, Response } from 'express';
import { BadRequestError } from '../../shared/errors/app-errors';
import { idParamSchema } from '../../shared/validation/common.schemas';
import * as catalogService from './catalog.service';
import type { PublicCourse, PublicDepartment, PublicResource, PublicStream } from './catalog.types';
import {
  courseCreateSchema,
  courseQuerySchema,
  courseUpdateSchema,
  departmentCreateSchema,
  departmentQuerySchema,
  departmentUpdateSchema,
  resourceCreateSchema,
  resourceQuerySchema,
  resourceUpdateSchema,
  searchQuerySchema,
  streamSchema,
} from './catalog.validation';

// ---- Streams ----

// SRS §8.5: { "streams": [ { "id": ..., "name": ... } ] }
export const getStreams = async (_req: Request, res: Response): Promise<void> => {
  const streams = await catalogService.getStreams();
  res.status(200).json({ streams: streams.map((s) => ({ id: s.id, name: s.name })) });
};

const streamResponse = (stream: PublicStream) => ({
  id: stream.id,
  name: stream.name,
  created_at: stream.createdAt,
});

export const createStream = async (req: Request, res: Response): Promise<void> => {
  const { name } = streamSchema.parse(req.body);
  const stream = await catalogService.createStream(name, req.user!.id);
  res.status(201).json(streamResponse(stream));
};

export const updateStream = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const { name } = streamSchema.parse(req.body);
  const stream = await catalogService.updateStream(id, name, req.user!.id);
  res.status(200).json({ id: stream.id, name: stream.name });
};

// ---- Departments ----

// SRS §8.5: { "departments": [ { "id": ..., "stream_id": ..., "name": ... } ] }
export const getDepartments = async (req: Request, res: Response): Promise<void> => {
  const { stream_id } = departmentQuerySchema.parse(req.query);
  const departments = await catalogService.getDepartments(stream_id);
  res.status(200).json({
    departments: departments.map((d) => ({ id: d.id, stream_id: d.streamId, name: d.name })),
  });
};

const departmentResponse = (department: PublicDepartment) => ({
  id: department.id,
  stream_id: department.streamId,
  name: department.name,
  created_at: department.createdAt,
});

export const createDepartment = async (req: Request, res: Response): Promise<void> => {
  const { name, stream_id } = departmentCreateSchema.parse(req.body);
  const department = await catalogService.createDepartment(stream_id, name, req.user!.id);
  res.status(201).json(departmentResponse(department));
};

export const updateDepartment = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = departmentUpdateSchema.parse(req.body);
  const department = await catalogService.updateDepartment(
    id,
    {
      ...(input.stream_id === undefined ? {} : { streamId: input.stream_id }),
      ...(input.name === undefined ? {} : { name: input.name }),
    },
    req.user!.id,
  );
  res
    .status(200)
    .json({ id: department.id, stream_id: department.streamId, name: department.name });
};

// ---- Courses ----

// SRS §8.5: { "courses": [...], "pagination": {...} }
export const getCourses = async (req: Request, res: Response): Promise<void> => {
  const query = courseQuerySchema.parse(req.query);
  const result = await catalogService.getCourses(
    {
      ...(query.stream_id === undefined ? {} : { streamId: query.stream_id }),
      ...(query.department_id === undefined ? {} : { departmentId: query.department_id }),
      ...(query.year === undefined ? {} : { academicYear: query.year }),
    },
    { page: query.page, limit: query.limit },
  );
  res.status(200).json({
    courses: result.courses.map((c) => ({
      id: c.id,
      name: c.name,
      academic_year: c.academicYear,
      department_id: c.departmentId,
    })),
    pagination: result.pagination,
  });
};

const courseResponse = (course: PublicCourse) => ({
  id: course.id,
  department_id: course.departmentId,
  academic_year: course.academicYear,
  name: course.name,
  created_at: course.createdAt,
});

export const createCourse = async (req: Request, res: Response): Promise<void> => {
  const input = courseCreateSchema.parse(req.body);
  const course = await catalogService.createCourse(
    {
      departmentId: input.department_id,
      academicYear: input.academic_year,
      name: input.name,
    },
    req.user!.id,
  );
  res.status(201).json(courseResponse(course));
};

export const updateCourse = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = courseUpdateSchema.parse(req.body);
  const course = await catalogService.updateCourse(
    id,
    {
      ...(input.department_id === undefined ? {} : { departmentId: input.department_id }),
      ...(input.academic_year === undefined ? {} : { academicYear: input.academic_year }),
      ...(input.name === undefined ? {} : { name: input.name }),
    },
    req.user!.id,
  );
  res.status(200).json({
    id: course.id,
    department_id: course.departmentId,
    academic_year: course.academicYear,
    name: course.name,
  });
};

// ---- DELETE (Streams/Departments/Courses — Stage 2, cascade bottoms
// out at Resource deletion below) ----

export const deleteStream = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await catalogService.deleteStream(id, req.user!.id);
  res.status(204).send();
};

export const deleteDepartment = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await catalogService.deleteDepartment(id, req.user!.id);
  res.status(204).send();
};

export const deleteCourse = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await catalogService.deleteCourse(id, req.user!.id);
  res.status(204).send();
};

// ---- Resources ----

// SRS §8.5's exact create/update response shape:
// { id, title, is_free_sample, created_at } — deliberately minimal,
// not the full resource object.
const resourceResponse = (resource: PublicResource) => ({
  id: resource.id,
  title: resource.title,
  is_free_sample: resource.isFreeSample,
  created_at: resource.createdAt,
});

export const createResource = async (req: Request, res: Response): Promise<void> => {
  const input = resourceCreateSchema.parse(req.body);

  // req.file is set by multer's upload.single('file') middleware,
  // mounted before this controller in catalog.routes.ts. CreateResourceInput
  // requires a real Buffer, not optional — so this check has to happen
  // here, before ever calling the service.
  if (!req.file) {
    throw new BadRequestError('FILE_REQUIRED', 'A file is required');
  }

  const resource = await catalogService.createResource(
    {
      courseId: input.course_id,
      category: input.category,
      title: input.title,
      ...(input.description === undefined ? {} : { description: input.description }),
      isFreeSample: input.is_free_sample,
      file: req.file.buffer,
      originalFileName: req.file.originalname,
    },
    req.user!.id,
  );

  res.status(201).json(resourceResponse(resource));
};

export const updateResource = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  const input = resourceUpdateSchema.parse(req.body);

  const resource = await catalogService.updateResource(
    id,
    {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.category === undefined ? {} : { category: input.category }),
      ...(input.is_free_sample === undefined ? {} : { isFreeSample: input.is_free_sample }),
      ...(req.file === undefined ? {} : { file: req.file.buffer }),
    },
    req.user!.id,
  );

  res.status(200).json(resourceResponse(resource));
};

export const deleteResource = async (req: Request, res: Response): Promise<void> => {
  const { id } = idParamSchema.parse(req.params);
  await catalogService.deleteResource(id, req.user!.id);
  res.status(204).send();
};

// SRS §8.5's exact response shapes for GET /courses/:id/resources —
// four documented cases (free sample / premium_required /
// device_mismatch / unlocked), all produced by the same mapping here
// since catalog.service already decided locked/reasonCode/message per
// resource.
export const getResources = async (req: Request, res: Response): Promise<void> => {
  const { id: courseId } = idParamSchema.parse(req.params);
  const query = resourceQuerySchema.parse(req.query);

  const result = await catalogService.getResourcesForStudent(
    req.user!.id,
    courseId,
    query.category,
    req.deviceFingerprint,
    { page: query.page, limit: query.limit },
  );

  res.status(200).json({
    resources: result.resources.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      is_free_sample: r.isFreeSample,
      locked: r.locked,
      ...(r.reasonCode === undefined ? {} : { reason_code: r.reasonCode }),
      ...(r.message === undefined ? {} : { message: r.message }),
      ...(r.fileUrl === undefined
        ? {}
        : { file_url: r.fileUrl, file_size_bytes: r.fileSizeBytes, checksum: r.checksum }),
    })),
    pagination: result.pagination,
  });
};

// SRS §8.5: { "results": [ { "type": "course", ... } | { "type": "resource", ... } ] }
export const search = async (req: Request, res: Response): Promise<void> => {
  const { q } = searchQuerySchema.parse(req.query);
  const results = await catalogService.search(q, req.user!.id, req.deviceFingerprint);

  res.status(200).json({
    results: results.map((r) =>
      r.type === 'course'
        ? { type: 'course', id: r.id, name: r.name }
        : { type: 'resource', id: r.id, title: r.title, locked: r.locked },
    ),
  });
};
