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

function sortAndFilterEvents(events, asOf) {
  const cutoff = asOf ? new Date(asOf).getTime() : Number.POSITIVE_INFINITY;

  return events
    .map((event, inputIndex) => ({ ...event, inputIndex }))
    .sort(compareEvents)
    .filter((event) => new Date(event.occurredAt).getTime() <= cutoff);
}

function createEmptyState() {
  return {
    balancesByAccountCurrency: {},
    pendingTransfers: [],
    auditTrail: [],
    invariants: {
      unmatchedTransferIds: [],
    },
  };
}

function rebuildAccountState({ events, asOf = null }) {
  const sortedEvents = sortAndFilterEvents(events, asOf);
  const state = createEmptyState();
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

  return state;
}

function applyEventsIncrementally(previousState, newEvents) {
  const nextState = {
    balancesByAccountCurrency: cloneBalances(previousState.balancesByAccountCurrency),
    pendingTransfers: [...previousState.pendingTransfers],
    auditTrail: [...previousState.auditTrail],
    invariants: {
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

    addDelta(nextState, event.accountId, event.currency, getSignedDelta(event));
    nextState.auditTrail.push({
      eventId: event.id,
      action: "applied",
      reason: "applied",
    });
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
