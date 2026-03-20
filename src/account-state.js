function compareEvents(left, right) {
  const timeDiff = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  const leftSequence = left.sequence ?? 0;
  const rightSequence = right.sequence ?? 0;

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return (left.inputIndex ?? 0) - (right.inputIndex ?? 0);
}

function cloneBalances(balancesByAccountCurrency) {
  return JSON.parse(JSON.stringify(balancesByAccountCurrency));
}

function ensureAccountCurrency(state, accountId, currency) {
  if (!state.balancesByAccountCurrency[accountId]) {
    state.balancesByAccountCurrency[accountId] = {};
  }

  if (state.balancesByAccountCurrency[accountId][currency] === undefined) {
    state.balancesByAccountCurrency[accountId][currency] = 0;
  }
}

function addDelta(state, accountId, currency, delta) {
  ensureAccountCurrency(state, accountId, currency);
  state.balancesByAccountCurrency[accountId][currency] += delta;
}

function getSignedDelta(event) {
  switch (event.kind) {
    case "deposit":
      return event.amount;
    case "withdrawal":
    case "fee":
      return -event.amount;
    default:
      return 0;
  }
}

function rebuildAccountState({ events, snapshots = [], asOf = null }) {
  const cutoff = asOf ? new Date(asOf).getTime() : Number.POSITIVE_INFINITY;
  const sortedEvents = events
    .map((event, inputIndex) => ({ ...event, inputIndex }))
    .sort(compareEvents)
    .filter((event) => new Date(event.occurredAt).getTime() <= cutoff);

  const state = {
    balancesByAccountCurrency: {},
    pendingTransfers: [],
    invalidatedSnapshots: [],
    auditTrail: [],
    invariants: {
      totalByCurrency: {},
      unmatchedTransferIds: [],
    },
  };

  const seenIdempotencyKeys = new Set();
  const pendingTransfers = new Map();

  for (const event of sortedEvents) {
    if (event.idempotencyKey && seenIdempotencyKeys.has(event.idempotencyKey)) {
      state.auditTrail.push({
        eventId: event.id,
        action: "skipped",
        reason: "duplicate_idempotency",
      });
      continue;
    }

    if (event.idempotencyKey) {
      seenIdempotencyKeys.add(event.idempotencyKey);
    }

    if (event.kind === "transfer_debit") {
      addDelta(state, event.accountId, event.currency, -event.amount);
      pendingTransfers.set(event.transferId, {
        transferId: event.transferId,
        currency: event.currency,
        amount: event.amount,
        missing: "credit",
      });
      state.auditTrail.push({
        eventId: event.id,
        action: "applied",
        reason: "transfer_pending",
      });
      continue;
    }

    if (event.kind === "transfer_credit") {
      addDelta(state, event.accountId, event.currency, event.amount);
      pendingTransfers.delete(event.transferId);
      state.auditTrail.push({
        eventId: event.id,
        action: "applied",
        reason: "applied",
      });
      continue;
    }

    if (event.kind === "correction" || event.kind === "reversal") {
      state.auditTrail.push({
        eventId: event.id,
        action: "skipped",
        reason: "unsupported_retroactive",
      });
      continue;
    }

    addDelta(state, event.accountId, event.currency, getSignedDelta(event));
    state.auditTrail.push({
      eventId: event.id,
      action: "applied",
      reason: "applied",
    });
  }

  state.pendingTransfers = Array.from(pendingTransfers.values()).sort((left, right) =>
    left.transferId.localeCompare(right.transferId),
  );
  state.invariants.unmatchedTransferIds = state.pendingTransfers.map((item) => item.transferId);

  for (const [accountId, balances] of Object.entries(state.balancesByAccountCurrency)) {
    for (const [currency, amount] of Object.entries(balances)) {
      state.invariants.totalByCurrency[currency] =
        (state.invariants.totalByCurrency[currency] ?? 0) + amount;
    }
  }

  for (const snapshot of snapshots) {
    if (snapshot.asOf && new Date(snapshot.asOf).getTime() <= cutoff) {
      if (sortedEvents.some((event) => event.kind === "correction" || event.kind === "reversal")) {
        state.invalidatedSnapshots.push(snapshot.snapshotId);
      }
    }
  }

  return state;
}

function applyEventsIncrementally(previousState, newEvents) {
  const nextState = {
    balancesByAccountCurrency: cloneBalances(previousState.balancesByAccountCurrency),
    pendingTransfers: [...previousState.pendingTransfers],
    invalidatedSnapshots: [...previousState.invalidatedSnapshots],
    auditTrail: [...previousState.auditTrail],
    invariants: {
      totalByCurrency: { ...previousState.invariants.totalByCurrency },
      unmatchedTransferIds: [...previousState.invariants.unmatchedTransferIds],
    },
  };

  const pendingTransfers = new Map(
    nextState.pendingTransfers.map((item) => [item.transferId, item]),
  );

  for (const event of newEvents) {
    if (event.kind === "transfer_debit") {
      addDelta(nextState, event.accountId, event.currency, -event.amount);
      pendingTransfers.set(event.transferId, {
        transferId: event.transferId,
        currency: event.currency,
        amount: event.amount,
        missing: "credit",
      });
      nextState.auditTrail.push({
        eventId: event.id,
        action: "applied",
        reason: "transfer_pending",
      });
      nextState.invariants.totalByCurrency[event.currency] =
        (nextState.invariants.totalByCurrency[event.currency] ?? 0) - event.amount;
      continue;
    }

    if (event.kind === "transfer_credit") {
      addDelta(nextState, event.accountId, event.currency, event.amount);
      pendingTransfers.delete(event.transferId);
      nextState.auditTrail.push({
        eventId: event.id,
        action: "applied",
        reason: "applied",
      });
      nextState.invariants.totalByCurrency[event.currency] =
        (nextState.invariants.totalByCurrency[event.currency] ?? 0) + event.amount;
      continue;
    }

    if (event.kind === "correction" || event.kind === "reversal") {
      nextState.auditTrail.push({
        eventId: event.id,
        action: "skipped",
        reason: "unsupported_retroactive",
      });
      continue;
    }

    const delta = getSignedDelta(event);
    addDelta(nextState, event.accountId, event.currency, delta);
    nextState.auditTrail.push({
      eventId: event.id,
      action: "applied",
      reason: "applied",
    });
    nextState.invariants.totalByCurrency[event.currency] =
      (nextState.invariants.totalByCurrency[event.currency] ?? 0) + delta;
  }

  nextState.pendingTransfers = Array.from(pendingTransfers.values()).sort((left, right) =>
    left.transferId.localeCompare(right.transferId),
  );
  nextState.invariants.unmatchedTransferIds = nextState.pendingTransfers.map((item) => item.transferId);

  return nextState;
}

module.exports = {
  applyEventsIncrementally,
  compareEvents,
  rebuildAccountState,
};
