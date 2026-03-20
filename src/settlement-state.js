const EVENT_LOG = Symbol("EVENT_LOG");

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

function sortAndFilterEvents(events, asOf) {
  const cutoff = asOf ? new Date(asOf).getTime() : Number.POSITIVE_INFINITY;

  return events
    .map((event, inputIndex) => ({ ...event, inputIndex }))
    .sort(compareEvents)
    .filter((event) => new Date(event.occurredAt).getTime() <= cutoff);
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

function createEmptyState() {
  return {
    balancesByAccountCurrency: {},
    pendingTransfers: [],
    settledTransfers: [],
    auditTrail: [],
    invariants: {
      pendingTransferIds: [],
      settledTransferIds: [],
    },
  };
}

function buildPendingTransfers(groups) {
  return Array.from(groups.values())
    .filter((group) => !(group.debit && group.credit))
    .map((group) => {
      if (group.debit) {
        return {
          transferId: group.transferId,
          currency: group.debit.currency,
          amount: group.debit.amount,
          sourceAccountId: group.debit.accountId,
          missing: "credit",
        };
      }

      return {
        transferId: group.transferId,
        currency: group.credit.currency,
        amount: group.credit.amount,
        destinationAccountId: group.credit.accountId,
        missing: "debit",
      };
    })
    .sort((left, right) => left.transferId.localeCompare(right.transferId));
}

function buildSettledTransfers(groups) {
  return Array.from(groups.values())
    .filter((group) => group.debit && group.credit)
    .map((group) => ({
      transferId: group.transferId,
      currency: group.debit.currency,
      amount: group.debit.amount,
      sourceAccountId: group.debit.accountId,
      destinationAccountId: group.credit.accountId,
    }))
    .sort((left, right) => left.transferId.localeCompare(right.transferId));
}

function finalizeState(state, groups) {
  state.pendingTransfers = buildPendingTransfers(groups);
  state.settledTransfers = buildSettledTransfers(groups);
  state.invariants.pendingTransferIds = state.pendingTransfers.map((item) => item.transferId);
  state.invariants.settledTransferIds = state.settledTransfers.map((item) => item.transferId);
}

function rebuildSettlementState({ events, asOf = null }) {
  const sortedEvents = sortAndFilterEvents(events, asOf);
  const state = createEmptyState();
  const seenIdempotencyKeys = new Set();
  const groups = new Map();

  // Track each considered event with its audit info
  const considered = [];

  for (const event of sortedEvents) {
    if (event.idempotencyKey && seenIdempotencyKeys.has(event.idempotencyKey)) {
      considered.push({ event, action: "skipped", reason: "duplicate_idempotency", final: true });
      continue;
    }
    if (event.idempotencyKey) {
      seenIdempotencyKeys.add(event.idempotencyKey);
    }
    considered.push({ event, action: null, reason: null, final: false });
  }

  // Build map of base events (debit/credit) that passed dedup
  const eventMap = new Map();
  for (const entry of considered) {
    if (entry.final) continue;
    const kind = entry.event.kind;
    if (kind === "transfer_debit" || kind === "transfer_credit") {
      eventMap.set(entry.event.id, entry.event);
    }
  }

  // Collect modifications from rebind/redirect events
  const modifications = new Map();

  for (const entry of considered) {
    if (entry.final) continue;
    const event = entry.event;

    if (event.kind === "transfer_rebind") {
      const target = eventMap.get(event.targetEventId);
      if (!target) {
        entry.action = "skipped";
        entry.reason = "unknown_target";
      } else if (target.kind !== "transfer_debit" && target.kind !== "transfer_credit") {
        entry.action = "skipped";
        entry.reason = "invalid_target_kind";
      } else {
        const mod = modifications.get(event.targetEventId) || {};
        mod.transferId = event.newTransferId;
        modifications.set(event.targetEventId, mod);
        entry.action = "applied";
        entry.reason = "rebind_applied";
      }
      entry.final = true;
    } else if (event.kind === "credit_redirect") {
      const target = eventMap.get(event.targetEventId);
      if (!target) {
        entry.action = "skipped";
        entry.reason = "unknown_target";
      } else if (target.kind !== "transfer_credit") {
        entry.action = "skipped";
        entry.reason = "invalid_target_kind";
      } else {
        const mod = modifications.get(event.targetEventId) || {};
        mod.accountId = event.newAccountId;
        modifications.set(event.targetEventId, mod);
        entry.action = "applied";
        entry.reason = "redirect_applied";
      }
      entry.final = true;
    }
  }

  // Apply base transfer events with effective values
  for (const entry of considered) {
    if (entry.final) continue;
    const event = entry.event;

    if (event.kind === "transfer_debit" || event.kind === "transfer_credit") {
      const mod = modifications.get(event.id) || {};
      const effectiveTransferId = mod.transferId ?? event.transferId;
      const effectiveAccountId = mod.accountId ?? event.accountId;

      const group = groups.get(effectiveTransferId) ?? { transferId: effectiveTransferId };

      if (event.kind === "transfer_debit") {
        group.debit = {
          accountId: effectiveAccountId,
          amount: event.amount,
          currency: event.currency,
        };
        addDelta(state, effectiveAccountId, event.currency, -event.amount);
      } else {
        group.credit = {
          accountId: effectiveAccountId,
          amount: event.amount,
          currency: event.currency,
        };
        addDelta(state, effectiveAccountId, event.currency, event.amount);
      }

      groups.set(effectiveTransferId, group);
      entry.action = "applied";
      // reason will be set after all events processed
    } else {
      entry.action = "skipped";
      entry.reason = "unknown_target";
    }
    entry.final = true;
  }

  // Determine final audit reasons for base events based on group state
  for (const entry of considered) {
    if (entry.reason !== null) continue;
    const event = entry.event;
    const mod = modifications.get(event.id) || {};
    const effectiveTransferId = mod.transferId ?? event.transferId;
    const group = groups.get(effectiveTransferId);
    entry.reason = (group && group.debit && group.credit) ? "settled" : "pending";
  }

  // Build audit trail in sorted event order
  for (const entry of considered) {
    state.auditTrail.push({
      eventId: entry.event.id,
      action: entry.action,
      reason: entry.reason,
    });
  }

  finalizeState(state, groups);

  // Store event log for incremental use
  Object.defineProperty(state, EVENT_LOG, {
    value: events,
    enumerable: false,
  });

  return state;
}

function applySettlementEventsIncrementally(previousState, newEvents) {
  const allEvents = [...(previousState[EVENT_LOG] || []), ...newEvents];
  return rebuildSettlementState({ events: allEvents });
}

module.exports = {
  applySettlementEventsIncrementally,
  compareEvents,
  rebuildSettlementState,
};
