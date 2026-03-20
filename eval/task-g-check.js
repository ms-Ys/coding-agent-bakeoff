const path = require("node:path");
const assert = require("node:assert/strict");

function loadSettlementState(repoDir) {
  const modulePath = path.join(repoDir, "src", "settlement-state.js");
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function stripState(state) {
  return {
    balancesByAccountCurrency: state.balancesByAccountCurrency,
    pendingTransfers: state.pendingTransfers,
    settledTransfers: state.settledTransfers,
    auditTrail: state.auditTrail.map((entry) => ({
      eventId: entry.eventId,
      action: entry.action,
      reason: entry.reason,
    })),
    invariants: state.invariants,
  };
}

function main() {
  const repoDir = process.argv[2];
  if (!repoDir) {
    console.error("Usage: node task-g-check.js <repo-dir>");
    process.exit(1);
  }

  const {
    rebuildSettlementState,
    applySettlementEventsIncrementally,
  } = loadSettlementState(repoDir);

  const events = [
    {
      id: "evt-1",
      kind: "transfer_debit",
      transferId: "tx-1",
      accountId: "acct-a",
      currency: "USD",
      amount: 100,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-debit",
    },
    {
      id: "evt-2",
      kind: "transfer_credit",
      transferId: "tx-1",
      accountId: "acct-b",
      currency: "USD",
      amount: 100,
      occurredAt: "2026-03-01T09:01:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-credit",
    },
    {
      id: "evt-3",
      kind: "transfer_debit",
      transferId: "tx-2",
      accountId: "acct-c",
      currency: "USD",
      amount: 40,
      occurredAt: "2026-03-01T09:02:00Z",
      sequence: 1,
      idempotencyKey: "tx-2-debit",
    },
    {
      id: "evt-4",
      kind: "transfer_credit",
      transferId: "tx-3",
      accountId: "acct-d",
      currency: "USD",
      amount: 40,
      occurredAt: "2026-03-01T09:03:00Z",
      sequence: 1,
      idempotencyKey: "tx-3-credit",
    },
    {
      id: "evt-5",
      kind: "transfer_rebind",
      targetEventId: "evt-4",
      newTransferId: "tx-2",
      occurredAt: "2026-03-01T09:04:00Z",
      sequence: 1,
    },
    {
      id: "evt-6",
      kind: "credit_redirect",
      targetEventId: "evt-2",
      newAccountId: "acct-x",
      occurredAt: "2026-03-01T09:05:00Z",
      sequence: 1,
    },
    {
      id: "evt-7",
      kind: "transfer_rebind",
      targetEventId: "evt-4",
      newTransferId: "tx-4",
      occurredAt: "2026-03-01T09:06:00Z",
      sequence: 1,
    },
    {
      id: "evt-8",
      kind: "transfer_rebind",
      targetEventId: "evt-4",
      newTransferId: "tx-2",
      occurredAt: "2026-03-01T09:07:00Z",
      sequence: 1,
    },
    {
      id: "evt-9",
      kind: "credit_redirect",
      targetEventId: "evt-3",
      newAccountId: "acct-z",
      occurredAt: "2026-03-01T09:08:00Z",
      sequence: 1,
    },
    {
      id: "evt-10",
      kind: "transfer_rebind",
      targetEventId: "evt-missing",
      newTransferId: "tx-9",
      occurredAt: "2026-03-01T09:09:00Z",
      sequence: 1,
    },
    {
      id: "evt-11",
      kind: "transfer_rebind",
      targetEventId: "evt-4",
      newTransferId: "tx-2",
      occurredAt: "2026-03-01T09:07:30Z",
      sequence: 1,
      idempotencyKey: "rebind-final",
    },
    {
      id: "evt-12",
      kind: "transfer_rebind",
      targetEventId: "evt-4",
      newTransferId: "tx-5",
      occurredAt: "2026-03-01T09:07:31Z",
      sequence: 1,
      idempotencyKey: "rebind-final",
    },
  ];

  const fullState = rebuildSettlementState({
    events,
    asOf: "2026-03-01T09:10:00Z",
  });

  assert.deepEqual(fullState.balancesByAccountCurrency, {
    "acct-a": { USD: -100 },
    "acct-c": { USD: -40 },
    "acct-d": { USD: 40 },
    "acct-x": { USD: 100 },
  });
  assert.deepEqual(fullState.pendingTransfers, []);
  assert.deepEqual(fullState.settledTransfers, [
    {
      transferId: "tx-1",
      currency: "USD",
      amount: 100,
      sourceAccountId: "acct-a",
      destinationAccountId: "acct-x",
    },
    {
      transferId: "tx-2",
      currency: "USD",
      amount: 40,
      sourceAccountId: "acct-c",
      destinationAccountId: "acct-d",
    },
  ]);
  assert.deepEqual(fullState.auditTrail, [
    { eventId: "evt-1", action: "applied", reason: "settled" },
    { eventId: "evt-2", action: "applied", reason: "settled" },
    { eventId: "evt-3", action: "applied", reason: "settled" },
    { eventId: "evt-4", action: "applied", reason: "settled" },
    { eventId: "evt-5", action: "applied", reason: "rebind_applied" },
    { eventId: "evt-6", action: "applied", reason: "redirect_applied" },
    { eventId: "evt-7", action: "applied", reason: "rebind_applied" },
    { eventId: "evt-8", action: "applied", reason: "rebind_applied" },
    { eventId: "evt-11", action: "applied", reason: "rebind_applied" },
    { eventId: "evt-12", action: "skipped", reason: "duplicate_idempotency" },
    { eventId: "evt-9", action: "skipped", reason: "invalid_target_kind" },
    { eventId: "evt-10", action: "skipped", reason: "unknown_target" },
  ]);
  assert.deepEqual(fullState.invariants, {
    pendingTransferIds: [],
    settledTransferIds: ["tx-1", "tx-2"],
  });

  const incrementalBase = rebuildSettlementState({
    events: events.slice(0, 4),
    asOf: "2026-03-01T09:03:30Z",
  });
  const incrementalState = applySettlementEventsIncrementally(incrementalBase, events.slice(4));
  assert.deepEqual(stripState(incrementalState), stripState(fullState));

  const asOfState = rebuildSettlementState({
    events,
    asOf: "2026-03-01T09:06:30Z",
  });

  assert.deepEqual(asOfState.pendingTransfers, [
    {
      transferId: "tx-2",
      currency: "USD",
      amount: 40,
      sourceAccountId: "acct-c",
      missing: "credit",
    },
    {
      transferId: "tx-4",
      currency: "USD",
      amount: 40,
      destinationAccountId: "acct-d",
      missing: "debit",
    },
  ]);
  assert.deepEqual(asOfState.settledTransfers, [
    {
      transferId: "tx-1",
      currency: "USD",
      amount: 100,
      sourceAccountId: "acct-a",
      destinationAccountId: "acct-x",
    },
  ]);
  assert.deepEqual(
    asOfState.auditTrail.map((entry) => ({
      eventId: entry.eventId,
      action: entry.action,
      reason: entry.reason,
    })),
    [
      { eventId: "evt-1", action: "applied", reason: "settled" },
      { eventId: "evt-2", action: "applied", reason: "settled" },
      { eventId: "evt-3", action: "applied", reason: "pending" },
      { eventId: "evt-4", action: "applied", reason: "pending" },
      { eventId: "evt-5", action: "applied", reason: "rebind_applied" },
      { eventId: "evt-6", action: "applied", reason: "redirect_applied" },
      { eventId: "evt-7", action: "applied", reason: "rebind_applied" },
    ],
  );

  console.log("task-g-check: OK");
}

main();
