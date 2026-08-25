import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import { ALLOWED_FILE_MIME_TYPE, MAX_FILE_SIZE_BYTES } from '../../config/constants';
import { BadRequestError } from '../errors/app-errors';

// memoryStorage, not diskStorage — the file never needs to touch this
// server's disk at all; it goes buffer-in-memory -> r2-client.upload()
// directly. Safe at this size cap (2MB, FR-2.2) — this would be the
// wrong choice at real video/large-file sizes, but isn't at this one.
//
// limits.fileSize is multer's own enforcement, checked as bytes stream
// in — it rejects an oversized file before it's fully buffered, not
// after. This is the fast, cheap check; the expensive one (magic
// bytes) only runs on files that already passed this.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

// FR-2.2 — "validated server-side by file signature (magic bytes), not
// extension." multer's own file filter only sees the client-declared
// Content-Type header, which is trivially spoofable (rename a .exe,
// set the header to application/pdf, multer never notices). This
// middleware runs *after* upload.single(...) has already buffered the
// file, and inspects the actual bytes.
//
// file-type is ESM-only as of the installed version — this project is
// CommonJS ("type": "commonjs" in package.json, "module": "nodenext" in
// tsconfig). A static `import { fileTypeFromBuffer } from 'file-type'`
// would compile to a `require()` call and throw ERR_REQUIRE_ESM at
// runtime. A dynamic `await import('file-type')` sidesteps this
// entirely — Node's dynamic import always goes through the ESM loader
// regardless of the calling module's own type, so this works
// unmodified even though every other import in this file is static.
export const validateFileSignature = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // No file at all is not this middleware's concern — that's a
    // validation-layer decision (is the field required for this
    // route?), not a file-signature one. Let it through; whatever
    // required the file in the first place will reject its absence.
    if (!req.file) {
      next();
      return;
    }

    const { fileTypeFromBuffer } = await import('file-type');
    const detected = await fileTypeFromBuffer(req.file.buffer);

    if (!detected || detected.mime !== ALLOWED_FILE_MIME_TYPE) {
      throw new BadRequestError(
        'INVALID_FILE_TYPE',
        'Only PDF files are allowed',
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};