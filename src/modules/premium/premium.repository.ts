import type { PaymentSubmission, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// Architecture doc: premium "owns... the PaymentSubmission bookkeeping
// table." Just one function — this record is admin-created, after the
// fact, purely for after-the-fact traceability (SRS: "unlike the prior
// version, this record is created by the Admin... not a student-
// submitted record"). status is hardcoded to 'approved', never passed
// in — the schema keeps the full PaymentStatus enum "for future
// flexibility," but v1 only ever writes this one value (schema.prisma's
// own comment on the field).
export const createBookkeepingRecord = (
  userId: number,
  note: string | undefined,
  reviewedByAdminId: number,
  tx: PrismaOrTx = prisma,
): Promise<PaymentSubmission> =>
  tx.paymentSubmission.create({
    data: {
      userId,
      status: 'approved',
      reviewedByAdminId,
      reviewedAt: new Date(),
      // note is `string | null` in Prisma's generated input type (a
      // nullable schema field), not `string | undefined` —
      // exactOptionalPropertyTypes rejects passing undefined directly
      // into it. Same fix pattern as jwt.ts/auth.service.ts: omit the
      // key entirely when there's no note, rather than pass an
      // explicit undefined.
      ...(note === undefined ? {} : { note }),
    },
  });