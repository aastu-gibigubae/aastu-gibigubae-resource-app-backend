import cron from 'node-cron';
import app from './app';
import { runSubscriptionExpiryJob } from './jobs/subscription-expiry.job';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Daily at midnight server time — FR-7.3's "scheduled daily job."
// Logged as a plain console summary, same precedent as
// device.service.ts's checkHeartbeat (FR-5.4): this is an automated
// system process, not an admin action, so it doesn't go through
// writeAuditLog/AdminActionLog.
cron.schedule('0 0 * * *', () => {
  runSubscriptionExpiryJob()
    .then(({ expiredCount, notifiedCount }) => {
      console.log(
        `[subscription-expiry job] expired ${expiredCount} subscription(s), sent ${notifiedCount} expiry-warning notification(s)`,
      );
    })
    .catch((err: unknown) => {
      console.error('[subscription-expiry job] failed', err);
    });
});