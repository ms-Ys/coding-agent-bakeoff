function parseLocalTime(localTime) {
  const [hourText, minuteText] = localTime.split(":");
  return {
    hour: Number(hourText),
    minute: Number(minuteText),
  };
}

function daysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function shiftToNextBusinessDayUtc(date) {
  const shifted = new Date(date);

  while (shifted.getUTCDay() === 0 || shifted.getUTCDay() === 6) {
    shifted.setUTCDate(shifted.getUTCDate() + 1);
  }

  return shifted;
}

function getNextBillingDate(subscription, afterIso = subscription.lastBilledAt) {
  const after = new Date(afterIso);
  const months = subscription.intervalMonths ?? 1;
  const anchorDay = subscription.anchorDay ?? after.getUTCDate();
  const timezone = subscription.timezone ?? "UTC";
  const weekendPolicy = subscription.weekendPolicy ?? "none";
  const { hour, minute } = parseLocalTime(subscription.localTime ?? "09:00");

  // Current implementation is intentionally naive:
  // it uses UTC calendar math and then applies weekend adjustment in UTC,
  // which is known to be wrong for timezone-based billing.
  const candidate = new Date(after);
  candidate.setUTCMonth(candidate.getUTCMonth() + months);
  candidate.setUTCDate(
    Math.min(anchorDay, daysInUtcMonth(candidate.getUTCFullYear(), candidate.getUTCMonth())),
  );
  candidate.setUTCHours(hour, minute, 0, 0);

  if (candidate <= after) {
    candidate.setUTCMonth(candidate.getUTCMonth() + months);
    candidate.setUTCDate(
      Math.min(anchorDay, daysInUtcMonth(candidate.getUTCFullYear(), candidate.getUTCMonth())),
    );
  }

  if (weekendPolicy === "next-business-day" && timezone) {
    return shiftToNextBusinessDayUtc(candidate).toISOString();
  }

  return candidate.toISOString();
}

function getUpcomingBillingDates(subscription, count, afterIso = subscription.lastBilledAt) {
  const results = [];
  let cursor = afterIso;

  for (let index = 0; index < count; index += 1) {
    cursor = getNextBillingDate(subscription, cursor);
    results.push(cursor);
  }

  return results;
}

module.exports = {
  daysInUtcMonth,
  getNextBillingDate,
  getUpcomingBillingDates,
  parseLocalTime,
  shiftToNextBusinessDayUtc,
};
