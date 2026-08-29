import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma-client';
import { runSubscriptionExpiryJob } from '../../src/jobs/subscription-expiry.job';
import { addDays } from '../../src/shared/utils/date-math';

// Real Prisma writes against a real, separate TEST database — see
// .env.test.example and the DB doc's own testing strategy: "Test
// database: a separate Neon branch or separate project — never run
// tests against real data." Every test in tests/unit/ mocks the
// repository layer instead; this is the one place in the codebase that
// deliberately doesn't, because the thing actually worth verifying
// here — does the daily sweep really flip subscriptionStatus and
// really create Notification rows, against the real schema, real
// constraints, real Prisma client — can't be confirmed any other way.
// Run via `npm run test:integration`, never as part of plain `npm test`.

const TEST_EMAIL_PREFIX = 'integration-test-subscription-expiry';
const createdUserIds: number[] = [];

// A monotonic counter, not Date.now()-derived — the original attempt
// sliced the leading (slowest-changing) digits of a millisecond
// timestamp, so every user created within the same test run collided
// on the same phone number. A per-process counter guarantees
// uniqueness on every single call, regardless of timing.
let testUserCounter = 0;

const createTestUser = async (overrides: {
  subscriptionStatus: 'active' | 'expired' | 'none';
  subscriptionExpiryDate: Date;
}) => {
  testUserCounter += 1;
  const uniqueSuffix = `${Date.now()}${testUserCounter}`;
  const user = await prisma.user.create({
    data: {
      name: 'Integration Test Student',
      email: `${TEST_EMAIL_PREFIX}-${uniqueSuffix}@example.com`,
      phone: `+2519${uniqueSuffix.slice(-9)}`,
      passwordHash: 'not-a-real-hash-this-is-test-fixture-data',
      role: 'student',
      subscriptionStatus: overrides.subscriptionStatus,
      subscriptionExpiryDate: overrides.subscriptionExpiryDate,
      activationStatus: 'activated',
    },
  });
  createdUserIds.push(user.id);
  return user;
};

afterAll(async () => {
  // Clean up every row this file created, regardless of which
  // assertions above passed or failed — the test database is shared
  // across runs, so nothing from this file should ever be left behind.
  await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.$disconnect();
});

describe('runSubscriptionExpiryJob (real database)', () => {
  it('flips a genuinely overdue active subscription to expired, with no notification for the expiry itself', async () => {
    const overdue = await createTestUser({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: addDays(new Date(), -1), // yesterday
    });

    await runSubscriptionExpiryJob();

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: overdue.id } });
    expect(reloaded.subscriptionStatus).toBe('expired');

    // FR-7.1's notification types have no "just expired" variant —
    // confirm none was created.
    const notifications = await prisma.notification.findMany({ where: { userId: overdue.id } });
    expect(notifications).toHaveLength(0);
  });

  it('creates exactly one subscription_expiring notification for a user entering the 7-day window, and does not duplicate it on an immediate second run', async () => {
    // 7.5 days out, not exactly 7 — lands comfortably in the middle of
    // the job's single 24h trigger window rather than right on its
    // edge. The job computes its own `now` a few milliseconds after
    // this line runs; at exactly 7 days that gap alone can push this
    // fixture just outside the window (a real, first-hand example of
    // this happening — not a hypothetical). Not a production concern:
    // FR-7.1 itself specifies "~7 days out," approximate by design.
    const expiringSoon = await createTestUser({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: new Date(Date.now() + 7.5 * 24 * 60 * 60 * 1000),
    });

    await runSubscriptionExpiryJob();

    const afterFirstRun = await prisma.notification.findMany({
      where: { userId: expiringSoon.id, type: 'subscription_expiring' },
    });
    expect(afterFirstRun).toHaveLength(1);

    // Run again immediately — the duplicate guard
    // (notifications.repository.hasRecentNotificationOfType) should
    // prevent a second notification within the same day, the real
    // scenario this guards against (a crash-restart re-running the job).
    await runSubscriptionExpiryJob();

    const afterSecondRun = await prisma.notification.findMany({
      where: { userId: expiringSoon.id, type: 'subscription_expiring' },
    });
    expect(afterSecondRun).toHaveLength(1);
  });

  it('does not touch a subscription that still has 30 days left', async () => {
    const farFuture = await createTestUser({
      subscriptionStatus: 'active',
      subscriptionExpiryDate: addDays(new Date(), 30),
    });

    await runSubscriptionExpiryJob();

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: farFuture.id } });
    expect(reloaded.subscriptionStatus).toBe('active');

    const notifications = await prisma.notification.findMany({
      where: { userId: farFuture.id, type: 'subscription_expiring' },
    });
    expect(notifications).toHaveLength(0);
  });
});
