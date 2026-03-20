const path = require("node:path");
const assert = require("node:assert/strict");

function loadBilling(repoDir) {
  const billingPath = path.join(repoDir, "src", "billing.js");
  delete require.cache[require.resolve(billingPath)];
  return require(billingPath);
}

function main() {
  const repoDir = process.argv[2];

  if (!repoDir) {
    console.error("Usage: node task-c-check.js <repo-dir>");
    process.exit(1);
  }

  const { getNextBillingDate, getUpcomingBillingDates } = loadBilling(repoDir);

  const laDstSubscription = {
    timezone: "America/Los_Angeles",
    anchorDay: 10,
    localTime: "09:30",
    intervalMonths: 1,
    weekendPolicy: "none",
    lastBilledAt: "2026-02-10T17:30:00.000Z",
  };

  assert.equal(
    getNextBillingDate(laDstSubscription),
    "2026-03-10T16:30:00.000Z",
  );

  const newYorkMonthEndSubscription = {
    timezone: "America/New_York",
    anchorDay: 31,
    localTime: "09:00",
    intervalMonths: 1,
    weekendPolicy: "next-business-day",
    lastBilledAt: "2026-04-30T13:00:00.000Z",
  };

  assert.deepEqual(getUpcomingBillingDates(newYorkMonthEndSubscription, 3), [
    "2026-06-01T13:00:00.000Z",
    "2026-06-30T13:00:00.000Z",
    "2026-07-31T13:00:00.000Z",
  ]);

  const tokyoWeekendSubscription = {
    timezone: "Asia/Tokyo",
    anchorDay: 1,
    localTime: "00:30",
    intervalMonths: 1,
    weekendPolicy: "next-business-day",
    lastBilledAt: "2026-06-30T15:30:00.000Z",
  };

  assert.equal(
    getNextBillingDate(tokyoWeekendSubscription),
    "2026-08-02T15:30:00.000Z",
  );

  console.log("task-c-check: OK");
}

main();
