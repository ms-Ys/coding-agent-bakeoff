const path = require("node:path");
const assert = require("node:assert/strict");

function loadAccountState(repoDir) {
  const modulePath = path.join(repoDir, "src", "account-state.js");
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function stripState(state) {
  return {
    balancesByAccountCurrency: state.balancesByAccountCurrency,
    pendingTransfers: state.pendingTransfers,
    invalidatedSnapshots: state.invalidatedSnapshots,
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
    console.error("Usage: node task-e-check.js <repo-dir>");
    process.exit(1);
  }

  const {
    rebuildAccountState,
    applyEventsIncrementally,
  } = loadAccountState(repoDir);

  const events = [
    {
      id: "evt-1",
      kind: "deposit",
      accountId: "acct-a",
      currency: "USD",
      amount: 1000,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
      idempotencyKey: "dep-1",
    },
    {
      id: "evt-2",
      kind: "transfer_debit",
      accountId: "acct-a",
      transferId: "tx-1",
      currency: "USD",
      amount: 300,
      occurredAt: "2026-03-01T09:05:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-debit",
    },
    {
      id: "evt-3",
      kind: "transfer_credit",
      accountId: "acct-b",
      transferId: "tx-1",
      currency: "USD",
      amount: 300,
      occurredAt: "2026-03-01T09:10:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-credit",
    },
    {
      id: "evt-4",
      kind: "fee",
      accountId: "acct-a",
      currency: "USD",
      amount: 25,
      occurredAt: "2026-03-01T09:15:00Z",
      sequence: 1,
      idempotencyKey: "fee-1",
    },
    {
      id: "evt-5",
      kind: "withdrawal",
      accountId: "acct-b",
      currency: "USD",
      amount: 50,
      occurredAt: "2026-03-01T09:20:00Z",
      sequence: 1,
      idempotencyKey: "wd-1",
    },
    {
      id: "evt-6",
      kind: "deposit",
      accountId: "acct-a",
      currency: "USD",
      amount: 1000,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 2,
      idempotencyKey: "dep-1",
    },
    {
      id: "evt-7",
      kind: "correction",
      targetEventId: "evt-5",
      correctedAmount: 80,
      accountId: "acct-b",
      currency: "USD",
      occurredAt: "2026-03-01T09:25:00Z",
      sequence: 1,
    },
    {
      id: "evt-8",
      kind: "reversal",
      targetEventId: "evt-4",
      accountId: "acct-a",
      currency: "USD",
      occurredAt: "2026-03-01T09:30:00Z",
      sequence: 1,
    },
    {
      id: "evt-9",
      kind: "transfer_debit",
      accountId: "acct-b",
      transferId: "tx-2",
      currency: "EUR",
      amount: 40,
      occurredAt: "2026-03-01T09:35:00Z",
      sequence: 1,
      idempotencyKey: "tx-2-debit",
    },
    {
      id: "evt-10",
      kind: "reversal",
      targetEventId: "evt-missing",
      accountId: "acct-a",
      currency: "USD",
      occurredAt: "2026-03-01T09:40:00Z",
      sequence: 1,
    },
  ];

  const snapshots = [
    {
      snapshotId: "snap-early",
      asOf: "2026-03-01T09:18:00Z",
    },
    {
      snapshotId: "snap-late",
      asOf: "2026-03-01T09:32:00Z",
    },
  ];

  const fullState = rebuildAccountState({
    events,
    snapshots,
    asOf: "2026-03-01T09:45:00Z",
  });

  assert.deepEqual(fullState.balancesByAccountCurrency, {
    "acct-a": { USD: 700 },
    "acct-b": { EUR: -40, USD: 220 },
  });
  assert.deepEqual(fullState.pendingTransfers, [
    {
      transferId: "tx-2",
      currency: "EUR",
      amount: 40,
      missing: "credit",
    },
  ]);
  assert.deepEqual(fullState.invalidatedSnapshots, ["snap-late"]);
  assert.deepEqual(fullState.invariants.unmatchedTransferIds, ["tx-2"]);

  const incrementalBase = rebuildAccountState({
    events: events.slice(0, 5),
    snapshots,
    asOf: "2026-03-01T09:21:00Z",
  });
  const incrementalState = applyEventsIncrementally(incrementalBase, events.slice(5));

  assert.deepEqual(stripState(incrementalState), stripState(fullState));

  const asOfState = rebuildAccountState({
    events,
    snapshots,
    asOf: "2026-03-01T09:21:00Z",
  });

  assert.deepEqual(asOfState.balancesByAccountCurrency, {
    "acct-a": { USD: 675 },
    "acct-b": { USD: 250 },
  });
  assert.deepEqual(asOfState.pendingTransfers, []);

  console.log("task-e-check: OK");
}

main();
