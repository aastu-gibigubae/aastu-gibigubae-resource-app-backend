import type { DeviceRecord, Prisma } from '@prisma/client';
import { prisma } from '../../infrastructure/database/prisma-client';

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

// Named exactly as architecture doc Flow 1 calls it:
// device.repository.findActiveDeviceRecord(userId) — also the query
// the DB doc notes the partial unique index (one_active_device_per_user)
// exists to make fast, since it's checked on every resource unlock and
// every heartbeat call, not just occasionally.
export const findActiveDeviceRecord = (
  userId: number,
  tx: PrismaOrTx = prisma,
): Promise<DeviceRecord | null> =>
  tx.deviceRecord.findFirst({ where: { userId, status: 'active' } });

// Always inserts a new row — never reuses or updates an existing one.
// DeviceRecord tracks activation *history* (SRS: "unlike
// User.last_device_fingerprint, which only ever holds the single most
// recent login") — revoking a device never deletes its row, it only
// flips status, so the full history of every device ever bound to an
// account stays queryable later if needed.
export const create = (
  userId: number,
  deviceFingerprint: string,
  activatedByAdminId: number,
  tx: PrismaOrTx = prisma,
): Promise<DeviceRecord> =>
  tx.deviceRecord.create({
    data: {
      userId,
      deviceFingerprint,
      activatedByAdminId,
      activatedAt: new Date(),
    },
  });

export const revoke = (
  deviceRecordId: number,
  revokedByAdminId: number,
  tx: PrismaOrTx = prisma,
): Promise<DeviceRecord> =>
  tx.deviceRecord.update({
    where: { id: deviceRecordId },
    data: {
      status: 'revoked',
      revokedAt: new Date(),
      revokedByAdminId,
    },
  });