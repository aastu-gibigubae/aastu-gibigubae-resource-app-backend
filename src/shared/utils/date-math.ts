// Deferred all the way back to Phase 0/1 planning — flagged then as
// "needed by premium and device, build when the first real consumer
// needs it." Device ended up not needing it after all (the 7-day
// reverification window was decided to live entirely client-side, see
// device.service.ts's checkHeartbeat comment). premium is the first
// genuine consumer: FR-4.3's 12-month subscription expiry.
//
// A pure function, no I/O, no dependency on anything else in the app —
// same reasoning as access-policy.ts being its own file: cheap to unit
// test exhaustively, and safe to reuse anywhere else a "N months from
// now" calculation shows up later.

// Adds `months` calendar months to `date`. Uses JS Date's own overflow
// handling (setMonth rolling into the next year is correct and
// automatic) rather than hand-rolling month/year arithmetic.
//
// One edge case worth knowing: setMonth's day-of-month overflow
// behavior. Jan 31 + 1 month lands on Mar 3 (or Mar 2 in a leap year),
// not Feb 28/29 — JS clamps the month first, then re-adds the leftover
// days, it doesn't clamp the day itself. Not a practical concern for a
// 12-month subscription expiry (grant-premium runs on whatever day an
// admin happens to click it, not specifically on the 31st), but worth
// noting rather than silently assuming "add 12 months" is always exact.
export const addMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
};

// Second real consumer of this file — jobs/subscription-expiry.job.ts
// uses this to compute the 7-day-out warning window
// (SUBSCRIPTION_EXPIRY_WARNING_DAYS). setDate has no day-of-month
// overflow surprises the way setMonth does — adding days always rolls
// forward cleanly into the next month/year.
export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};
