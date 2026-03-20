const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getNextBillingDate,
  getUpcomingBillingDates,
} = require("../src/billing");

test("getNextBillingDate keeps simple UTC monthly schedules working", () => {
  const subscription = {
    timezone: "UTC",
    anchorDay: 15,
    localTime: "09:00",
    intervalMonths: 1,
    weekendPolicy: "none",
    lastBilledAt: "2026-01-15T09:00:00.000Z",
  };

  assert.equal(
    getNextBillingDate(subscription),
    "2026-02-15T09:00:00.000Z",
  );
});

test("getNextBillingDate handles another simple UTC monthly schedule", () => {
  const subscription = {
    timezone: "UTC",
    anchorDay: 28,
    localTime: "09:00",
    intervalMonths: 1,
    weekendPolicy: "none",
    lastBilledAt: "2026-01-28T09:00:00.000Z",
  };

  assert.equal(
    getNextBillingDate(subscription),
    "2026-02-28T09:00:00.000Z",
  );
});

test("getUpcomingBillingDates returns repeated monthly UTC dates", () => {
  const subscription = {
    timezone: "UTC",
    anchorDay: 10,
    localTime: "12:15",
    intervalMonths: 1,
    weekendPolicy: "none",
    lastBilledAt: "2026-01-10T12:15:00.000Z",
  };

  assert.deepEqual(getUpcomingBillingDates(subscription, 3), [
    "2026-02-10T12:15:00.000Z",
    "2026-03-10T12:15:00.000Z",
    "2026-04-10T12:15:00.000Z",
  ]);
});
