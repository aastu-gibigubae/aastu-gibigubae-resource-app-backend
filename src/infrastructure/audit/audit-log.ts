import type { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma-client';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// AdminActionLog is written directly by whichever module's repository
// performs the logged action (DB doc §22 — no separate infra
// abstraction owns the table). This one function lives here because
// premium, catalog, and device all call it and none of them "own" it.
//
// Accepts an optional transaction client so a call can participate in
// the same atomic transaction as the action it's logging — e.g.
// grant-premium (FR-4.3) needs the subscription flip, the
// PaymentSubmission row, the DeviceRecord, the Notification, and this
// log entry to all succeed or fail together (SRS §6.3). Every
// repository function in this project threads `tx` through the same
// way (architecture doc, Flow 2) — defaults to the regular client when
// called outside a transaction.
export const writeAuditLog = (
  adminId: number,
  actionType: string,
  targetType: string,
  targetId: number,
  tx: PrismaOrTx = prisma,
): Promise<{ id: number }> =>
  tx.adminActionLog.create({
    data: { adminId, actionType, targetType, targetId },
    select: { id: true },
  });
