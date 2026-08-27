import { Router } from 'express';
import { requireAdmin } from '../../shared/middleware/require-admin';
import { requireAuth } from '../../shared/middleware/require-auth';
import { upload, validateFileSignature } from '../../shared/middleware/upload';
import { asyncHandler } from '../../shared/utils/async-handler';
import * as catalogController from './catalog.controller';

export const catalogRouter = Router();

// ---- Student browse ----
catalogRouter.get('/streams', requireAuth, asyncHandler(catalogController.getStreams));
catalogRouter.get('/departments', requireAuth, asyncHandler(catalogController.getDepartments));
catalogRouter.get('/courses', requireAuth, asyncHandler(catalogController.getCourses));
// The single most important endpoint in the app (SRS's own framing) —
// browse AND download combined into one response via locked/file_url.
catalogRouter.get(
  '/courses/:id/resources',
  requireAuth,
  asyncHandler(catalogController.getResources),
);
catalogRouter.get('/search', requireAuth, asyncHandler(catalogController.search));

// ---- Admin CRUD ----
catalogRouter.post('/admin/streams', requireAuth, requireAdmin, asyncHandler(catalogController.createStream));
catalogRouter.put(
  '/admin/streams/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.updateStream),
);
catalogRouter.delete(
  '/admin/streams/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.deleteStream),
);

catalogRouter.post(
  '/admin/departments',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.createDepartment),
);
catalogRouter.put(
  '/admin/departments/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.updateDepartment),
);
catalogRouter.delete(
  '/admin/departments/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.deleteDepartment),
);

catalogRouter.post('/admin/courses', requireAuth, requireAdmin, asyncHandler(catalogController.createCourse));
catalogRouter.put(
  '/admin/courses/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.updateCourse),
);
catalogRouter.delete(
  '/admin/courses/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.deleteCourse),
);

// upload.single('file') runs first (multer buffers the file, enforces
// the 2MB cap), then validateFileSignature (checks actual magic bytes,
// not the client-declared Content-Type) — both before the controller
// ever sees the request. Same two-middleware chain on create and
// update, since both accept an optional/required file.
catalogRouter.post(
  '/admin/resources',
  requireAuth,
  requireAdmin,
  upload.single('file'),
  validateFileSignature,
  asyncHandler(catalogController.createResource),
);
catalogRouter.put(
  '/admin/resources/:id',
  requireAuth,
  requireAdmin,
  upload.single('file'),
  validateFileSignature,
  asyncHandler(catalogController.updateResource),
);
catalogRouter.delete(
  '/admin/resources/:id',
  requireAuth,
  requireAdmin,
  asyncHandler(catalogController.deleteResource),
);