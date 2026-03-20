function compareEvents(left, right) {
  const timeDiff = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  const leftSequence = left.sequence ?? 0;
  const rightSequence = right.sequence ?? 0;

  return leftSequence - rightSequence;
}

function getSignedDelta(event) {
  switch (event.kind) {
    case "credit":
    case "refund":
      return event.amount;
    case "charge":
    case "chargeback":
      return -event.amount;
    case "reversal":
      return 0;
    default:
      return 0;
  }
}

function rebuildLedger(events) {
  const orderedEvents = [...events].sort(compareEvents);
  const balanceByCurrency = {};
  const entries = [];
  const auditTrail = [];

  for (const event of orderedEvents) {
    const delta = getSignedDelta(event);
    const currency = event.currency;

    balanceByCurrency[currency] = (balanceByCurrency[currency] ?? 0) + delta;

    const entry = {
      id: event.id,
      kind: event.kind,
      currency,
      delta,
      balanceAfter: balanceByCurrency[currency],
    };

    entries.push(entry);
    auditTrail.push({
      id: event.id,
      action: "applied",
      reason: "applied",
      currency,
      delta,
      balanceAfter: balanceByCurrency[currency],
    });
  }

  return {
    balanceByCurrency,
    entries,
    auditTrail,
  };
}

module.exports = {
  compareEvents,
  getSignedDelta,
  rebuildLedger,
};
