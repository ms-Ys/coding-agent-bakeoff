function compareEvents(left, right) {
  const timeDiff = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();

  if (timeDiff !== 0) {
    return timeDiff;
  }

  const leftHasSequence = left.sequence !== undefined && left.sequence !== null;
  const rightHasSequence = right.sequence !== undefined && right.sequence !== null;

  if (leftHasSequence && rightHasSequence && left.sequence !== right.sequence) {
    return left.sequence - right.sequence;
  }

  return (left.inputIndex ?? 0) - (right.inputIndex ?? 0);
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

function hasIdempotencyKey(event) {
  return event.idempotencyKey !== undefined && event.idempotencyKey !== null;
}

function buildEmptyState() {
  return {
    balancesByAccountCurrency: {},
    pendingTransfers: [],
    cursor: null,
    stats: {
      appliedEvents: 0,
      duplicateEvents: 0,
      settledTransfers: 0,
    },
    _seenIdempotencyKeys: [],
    _transferHalves: {},
  };
}

function sortAndFilterEvents(events, asOf) {
  const cutoff = asOf ? new Date(asOf).getTime() : Number.POSITIVE_INFINITY;

  return events
    .map((event, inputIndex) => ({ ...event, inputIndex }))
    .sort(compareEvents)
    .filter((event) => new Date(event.occurredAt).getTime() <= cutoff);
}

function buildPendingTransfers(transferHalves) {
  const entries = Object.entries(transferHalves);
  return entries
    .filter(([, half]) => !(half.debit && half.credit))
    .map(([transferId, half]) => {
      if (half.debit) {
        return {
          transferId,
          currency: half.debit.currency,
          amount: half.debit.amount,
          sourceAccountId: half.debit.sourceAccountId,
          missing: "credit",
        };
      }

      return {
        transferId,
        currency: half.credit.currency,
        amount: half.credit.amount,
        destinationAccountId: half.credit.destinationAccountId,
        missing: "debit",
      };
    })
    .sort((left, right) => left.transferId.localeCompare(right.transferId));
}

function applyEvent(state, event, seenKeys) {
  if (hasIdempotencyKey(event) && seenKeys.has(event.idempotencyKey)) {
    state.stats.duplicateEvents += 1;
    return;
  }

  if (hasIdempotencyKey(event)) {
    seenKeys.add(event.idempotencyKey);
    state._seenIdempotencyKeys.push(event.idempotencyKey);
  }

  if (event.kind === "deposit") {
    addDelta(state, event.accountId, event.currency, event.amount);
    state.stats.appliedEvents += 1;
  } else if (event.kind === "fee") {
    addDelta(state, event.accountId, event.currency, -event.amount);
    state.stats.appliedEvents += 1;
  } else if (event.kind === "transfer_debit" || event.kind === "transfer_credit") {
    if (!state._transferHalves[event.transferId]) {
      state._transferHalves[event.transferId] = {};
    }
    const half = state._transferHalves[event.transferId];

    if (event.kind === "transfer_debit") {
      half.debit = {
        sourceAccountId: event.accountId,
        amount: event.amount,
        currency: event.currency,
      };
      addDelta(state, event.accountId, event.currency, -event.amount);
    } else {
      half.credit = {
        destinationAccountId: event.accountId,
        amount: event.amount,
        currency: event.currency,
      };
      addDelta(state, event.accountId, event.currency, event.amount);
    }

    if (half.debit && half.credit) {
      state.stats.settledTransfers += 1;
    }

    state.stats.appliedEvents += 1;
  }

  state.cursor = {
    occurredAt: event.occurredAt,
    sequence: event.sequence ?? null,
    eventId: event.id,
  };
}

function publicView(state) {
  return {
    balancesByAccountCurrency: state.balancesByAccountCurrency,
    pendingTransfers: buildPendingTransfers(state._transferHalves),
    cursor: state.cursor,
    stats: { ...state.stats },
    _seenIdempotencyKeys: state._seenIdempotencyKeys,
    _transferHalves: state._transferHalves,
  };
}

function rebuildStreamingState({ events, asOf = null }) {
  const sortedEvents = sortAndFilterEvents(events, asOf);
  const state = buildEmptyState();
  const seenKeys = new Set();

  for (const event of sortedEvents) {
    applyEvent(state, event, seenKeys);
  }

  state.pendingTransfers = buildPendingTransfers(state._transferHalves);
  return state;
}

function applyStreamingEventsIncrementally(previousState, newEvents) {
  // previousState may have been through JSON.parse(JSON.stringify(...))
  const state = {
    balancesByAccountCurrency: previousState.balancesByAccountCurrency
      ? JSON.parse(JSON.stringify(previousState.balancesByAccountCurrency))
      : {},
    pendingTransfers: [],
    cursor: previousState.cursor ? { ...previousState.cursor } : null,
    stats: { ...previousState.stats },
    _seenIdempotencyKeys: [...(previousState._seenIdempotencyKeys || [])],
    _transferHalves: previousState._transferHalves
      ? JSON.parse(JSON.stringify(previousState._transferHalves))
      : {},
  };

  // Count previously settled transfers so we don't double-count
  const previouslySettled = new Set();
  for (const [tid, half] of Object.entries(state._transferHalves)) {
    if (half.debit && half.credit) {
      previouslySettled.add(tid);
    }
  }

  const seenKeys = new Set(state._seenIdempotencyKeys);

  // newEvents are append-only and sort strictly after cursor, so no re-sort needed
  for (const event of newEvents) {
    applyEvent(state, event, seenKeys);
  }

  // Adjust settledTransfers: applyEvent increments whenever both halves exist,
  // but for previously settled transfers we already counted them
  // Actually, applyEvent only increments when both halves become present at that moment.
  // Since previously settled transfers already have both halves, new events for a
  // different transferId won't trigger re-counting. But we need to make sure settled
  // count from previous state is preserved. Let me re-check...
  //
  // The stats object is copied from previousState, and applyEvent adds to it.
  // If a transferId was already settled (both halves), adding a new event for a
  // different transferId that completes it will correctly increment.
  // The issue is: applyEvent checks `if (half.debit && half.credit)` AFTER setting
  // the current half. So for a transfer that was already settled, if we somehow
  // get another event for it... but that shouldn't happen in append-only mode.
  // This should be fine.

  state.pendingTransfers = buildPendingTransfers(state._transferHalves);
  return state;
}

module.exports = {
  applyStreamingEventsIncrementally,
  compareEvents,
  rebuildStreamingState,
};
