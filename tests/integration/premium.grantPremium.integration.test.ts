import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import { grantPremium } from '../../src/modules/premium/premium.service';

// Real Prisma writes against a real, separate TEST database — same
// rationale as subscription-expiry.job.integration.test.ts. The one
// thing genuinely worth proving here that no mocked unit test can:
// does prisma.$transaction actually roll back every write when a step
// partway through throws? premium.service.test.ts (unit) already
// proves the five steps are CALLED in the right order with a fake tx —
// it can't prove Postgres genuinely undoes steps 1-2 when step 3
// fails, since its fake $transaction never touches a real database.
//
// Run via `npm run test:integration`, never as part of plain `npm test`.

const TEST_EMAIL_PREFIX = 'integration-test-grant-premium';
let userCounter = 0;

const createdUserIds: number[] = [];

const createTestUser = async (overrides: {
  role: 'student' | 'admin';
  lastDeviceFingerprint?: string;
}) => {
  userCounter += 1;
  const suffix = `${Date.now()}${userCounter}`;
  const user = await prisma.user.create({
    data: {
      name: `Integration Test ${overrides.role === 'admin' ? 'Admin' : 'Student'}`,
      email: `${TEST_EMAIL_PREFIX}-${suffix}@example.com`,
      phone: `+2519${suffix.slice(-9)}`,
      passwordHash: 'not-a-real-hash-this-is-test-fixture-data',
      role: overrides.role,
      ...(overrides.lastDeviceFingerprint === undefined
        ? {}
        : { lastDeviceFingerprint: overrides.lastDeviceFingerprint }),
    },
  });
  createdUserIds.push(user.id);
  return user;
};

// FK chain matters for cleanup: PaymentSubmission, DeviceRecord, and
// AdminActionLog all use onDelete: Restrict against User — deleting a
// User while any of those rows still reference it fails at the
// database level. Delete children before parents, every time.
afterAll(async () => {
  await prisma.adminActionLog.deleteMany({ where: { adminId: { in: createdUserIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.deviceRecord.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.paymentSubmission.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('grantPremium (real database, real transaction)', () => {
  it('writes to all four tables (User, PaymentSubmission, DeviceRecord, Notification) plus AdminActionLog, atomically', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const student = await createTestUser({ role: 'student', lastDeviceFingerprint: 'fp_test_device_1' });

    const result = await grantPremium(admin.id, student.id, 'Paid via Telebirr, confirmed on Telegram');

    const reloadedUser = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(reloadedUser.subscriptionStatus).toBe('active');
    expect(reloadedUser.activationStatus).toBe('activated');
    expect(reloadedUser.subscriptionExpiryDate).not.toBeNull();

    const payment = await prisma.paymentSubmission.findFirst({ where: { userId: student.id } });
    expect(payment?.status).toBe('approved');
    expect(payment?.reviewedByAdminId).toBe(admin.id);
    expect(payment?.note).toBe('Paid via Telebirr, confirmed on Telegram');

    const device = await prisma.deviceRecord.findFirst({ where: { userId: student.id } });
    expect(device?.status).toBe('active');
    expect(device?.deviceFingerprint).toBe('fp_test_device_1');
    expect(device?.id).toBe(result.deviceId);

    const notification = await prisma.notification.findFirst({
      where: { userId: student.id, type: 'premium_approved' },
    });
    expect(notification).not.toBeNull();

    const auditEntry = await prisma.adminActionLog.findFirst({
      where: { adminId: admin.id, actionType: 'grant_premium', targetId: student.id },
    });
    expect(auditEntry).not.toBeNull();
  });

  it('rolls back every write when the student has no lastDeviceFingerprint (NO_DEVICE_ON_FILE) — proves real atomicity, not just call order', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const student = await createTestUser({ role: 'student' });

    await expect(grantPremium(admin.id, student.id, undefined)).rejects.toMatchObject({ code: 'NO_DEVICE_ON_FILE' });

    const reloadedUser = await prisma.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(reloadedUser.subscriptionStatus).toBe('none');
    expect(reloadedUser.activationStatus).toBe('pending');

    const payment = await prisma.paymentSubmission.findFirst({ where: { userId: student.id } });
    expect(payment).toBeNull();

    const notification = await prisma.notification.findFirst({ where: { userId: student.id } });
    expect(notification).toBeNull();

    const auditEntry = await prisma.adminActionLog.findFirst({ where: { targetId: student.id } });
    expect(auditEntry).toBeNull();
  });

  it('rolls back every write when the student already has an active device (DEVICE_ALREADY_ACTIVE) — a second real call against an already-granted student', async () => {
    const admin = await createTestUser({ role: 'admin' });
    const student = await createTestUser({ role: 'student', lastDeviceFingerprint: 'fp_test_device_2' });

    await grantPremium(admin.id, student.id, undefined);

    const paymentCountAfterFirstCall = await prisma.paymentSubmission.count({
      where: { userId: student.id },
    });
    const expiryAfterFirstCall = (
      await prisma.user.findUniqueOrThrow({ where: { id: student.id } })
    ).subscriptionExpiryDate;

    await expect(grantPremium(admin.id, student.id, undefined)).rejects.toMatchObject({ code: 'DEVICE_ALREADY_ACTIVE' });

    const paymentCountAfterSecondCall = await prisma.paymentSubmission.count({
      where: { userId: student.id },
    });
    expect(paymentCountAfterSecondCall).toBe(paymentCountAfterFirstCall);

    const expiryAfterSecondCall = (
      await prisma.user.findUniqueOrThrow({ where: { id: student.id } })
    ).subscriptionExpiryDate;
    expect(expiryAfterSecondCall?.getTime()).toBe(expiryAfterFirstCall?.getTime());

    const deviceCount = await prisma.deviceRecord.count({ where: { userId: student.id } });
    expect(deviceCount).toBe(1);
  });
});