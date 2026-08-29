import type { ResourceCategory } from '@prisma/client';

export interface PublicStream {
  id: number;
  name: string;
  createdAt: Date;
}

export interface PublicDepartment {
  id: number;
  streamId: number;
  name: string;
  createdAt: Date;
}

export interface PublicCourse {
  id: number;
  departmentId: number;
  academicYear: number;
  name: string;
  createdAt: Date;
}

export interface CourseFilters {
  streamId?: number;
  departmentId?: number;
  academicYear?: number;
}

// Matches SRS §8.5's four documented response shapes for
// GET /courses/:id/resources exactly:
//   free sample                         -> unlocked, no reasonCode
//   not premium/activated                -> locked, reasonCode: premium_required
//   premium+activated, device mismatch   -> locked, reasonCode: device_mismatch
//   premium+activated, device matches    -> unlocked, no reasonCode
// A single shape rather than two separate types — locked is the field
// callers switch on; fileUrl/fileSizeBytes/checksum are simply absent
// (not null) when locked, matching the SRS's own explicit note:
// "file_url is absent entirely when locked — not null, not empty."
export interface StudentResourceView {
  id: number;
  title: string;
  description: string | null;
  category: ResourceCategory;
  isFreeSample: boolean;
  locked: boolean;
  reasonCode?: 'premium_required' | 'device_mismatch';
  message?: string;
  fileUrl?: string;
  fileSizeBytes?: number;
  checksum?: string;
}

// The full admin-facing shape — everything, no locking logic, since
// admins always see everything they manage.
export interface PublicResource {
  id: number;
  courseId: number;
  category: ResourceCategory;
  title: string;
  description: string | null;
  fileUrl: string;
  fileSizeBytes: number;
  checksum: string;
  isFreeSample: boolean;
  uploadedByAdminId: number;
  createdAt: Date;
}

export interface CreateResourceInput {
  courseId: number;
  category: ResourceCategory;
  title: string;
  description?: string;
  isFreeSample: boolean;
  file: Buffer;
  originalFileName: string;
}

export interface SearchResult {
  type: 'course' | 'resource';
  id: number;
  name?: string; // courses
  title?: string; // resources
  locked?: boolean; // resources only
}
