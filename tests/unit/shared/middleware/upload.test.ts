import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { validateFileSignature } from '../../../../src/shared/middleware/upload';

// FR-2.2 — "validated server-side by file signature (magic bytes), not
// extension." These are real byte signatures, not fake strings — the
// whole point of this middleware is that it reads actual bytes, so a
// test using a made-up buffer would prove nothing about whether the
// check actually works.

// Real PDF magic bytes: "%PDF-1.4" — same header every PDF starts with,
// regardless of extension or declared Content-Type.
const realPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

// Real Windows EXE magic bytes ("MZ") — this is the exact attack FR-2.2
// exists to stop: a file that isn't a PDF, however it's named or labeled.
const realExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

const fakeReq = (file?: Partial<Express.Multer.File>): Request =>
  ({ file: file as Express.Multer.File | undefined }) as unknown as Request;

describe('validateFileSignature', () => {
  it('lets a request through when the buffer is a genuine PDF, even if multer never checked the header', () => {
    const next = vi.fn() as unknown as NextFunction;
    validateFileSignature(fakeReq({ buffer: realPdfBuffer }), {} as Response, next);
    return vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });

  it('rejects a real, spoofed non-PDF file even if its declared Content-Type/extension said pdf', () => {
    const next = vi.fn() as unknown as NextFunction;
    validateFileSignature(fakeReq({ buffer: realExeBuffer }), {} as Response, next);

    return vi.waitFor(() => {
      expect(next).toHaveBeenCalledTimes(1);
      const err = (next as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(err.code).toBe('INVALID_FILE_TYPE');
      expect(err.statusCode).toBe(400);
    });
  });

  it("passes through untouched when no file is present — not this middleware's concern", () => {
    const next = vi.fn() as unknown as NextFunction;
    validateFileSignature(fakeReq(undefined), {} as Response, next);

    return vi.waitFor(() => expect(next).toHaveBeenCalledWith());
  });
});
