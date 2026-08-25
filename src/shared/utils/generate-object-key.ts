import { randomUUID } from 'node:crypto';

// FR-2.2a — every uploaded file gets a random, unguessable R2 object
// key, never one derived from the title/course/category. This is the
// *only* mitigation v1 has against unauthorized access (Section 6.5):
// URLs are permanent and unsigned, so the sole thing preventing someone
// from guessing a private file's URL is that the key itself is
// unguessable. A predictable key (e.g. "calculus-101-midterm.pdf")
// would defeat that instantly.
//
// Deliberately domain-agnostic — same reasoning as r2-client.ts. This
// function doesn't know or care what a "Resource" is; it just returns
// a random path segment. The caller (catalog.service, once it exists)
// decides the folder prefix.
//
// extension is passed in without its leading dot (e.g. "pdf", not
// ".pdf") — kept as a plain required string rather than defaulted,
// since a missing extension almost certainly means the caller forgot
// to derive it from the validated file type, not that it's optional.
export const generateObjectKey = (prefix: string, extension: string): string =>
  `${prefix}/${randomUUID()}.${extension}`;