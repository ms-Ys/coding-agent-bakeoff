const path = require("node:path");
const assert = require("node:assert/strict");

function loadAccountState(repoDir) {
  const modulePath = path.join(repoDir, "src", "account-state-f.js");
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function stripState(state) {
  return {
    balancesByAccountCurrency: state.balancesByAccountCurrency,
    pendingTransfers: state.pendingTransfers,
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
    console.error("Usage: node task-f-check.js <repo-dir>");
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
      kind: "withdrawal",
      accountId: "acct-a",
      currency: "USD",
      amount: 300,
      occurredAt: "2026-03-01T09:05:00Z",
      sequence: 1,
      idempotencyKey: "wd-1",
    },
    {
      id: "evt-3",
      kind: "correction",
      accountId: "acct-a",
      currency: "USD",
      targetEventId: "evt-2",
      correctedAmount: 450,
      occurredAt: "2026-03-01T09:06:00Z",
      sequence: 1,
    },
    {
      id: "evt-4",
      kind: "reversal",
      accountId: "acct-a",
      currency: "USD",
      targetEventId: "evt-2",
      occurredAt: "2026-03-01T09:07:00Z",
      sequence: 1,
    },
    {
      id: "evt-5",
      kind: "deposit",
      accountId: "acct-a",
      currency: "USD",
      amount: 1000,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 2,
      idempotencyKey: "dep-1",
    },
    {
      id: "evt-6",
      kind: "transfer_debit",
      accountId: "acct-a",
      transferId: "tx-1",
      currency: "USD",
      amount: 200,
      occurredAt: "2026-03-01T09:10:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-debit",
    },
    {
      id: "evt-7",
      kind: "transfer_credit",
      accountId: "acct-b",
      transferId: "tx-1",
      currency: "USD",
      amount: 200,
      occurredAt: "2026-03-01T09:11:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-credit",
    },
    {
      id: "evt-8",
      kind: "fee",
      accountId: "acct-b",
      currency: "USD",
      amount: 20,
      occurredAt: "2026-03-01T09:12:00Z",
      sequence: 1,
      idempotencyKey: "fee-1",
    },
    {
      id: "evt-9",
      kind: "transfer_debit",
      accountId: "acct-b",
      transferId: "tx-2",
      currency: "USD",
      amount: 40,
      occurredAt: "2026-03-01T09:13:00Z",
      sequence: 1,
      idempotencyKey: "tx-2-debit",
    },
    {
      id: "evt-10",
      kind: "reversal",
      accountId: "acct-a",
      currency: "USD",
      targetEventId: "evt-missing",
      occurredAt: "2026-03-01T09:14:00Z",
      sequence: 1,
    },
    {
      id: "evt-11",
      kind: "correction",
      accountId: "acct-a",
      currency: "USD",
      targetEventId: "evt-2",
      correctedAmount: 200,
      occurredAt: "2026-03-01T09:15:00Z",
      sequence: 1,
    },
  ];

  const fullState = rebuildAccountState({
    events,
    asOf: "2026-03-01T09:45:00Z",
  });

  assert.deepEqual(fullState.balancesByAccountCurrency, {
    "acct-a": { USD: 800 },
    "acct-b": { USD: 140 },
  });
  assert.deepEqual(fullState.pendingTransfers, [
    {
      transferId: "tx-2",
      currency: "USD",
      amount: 40,
      missing: "credit",
    },
  ]);
  assert.deepEqual(fullState.invariants.unmatchedTransferIds, ["tx-2"]);

  const incrementalBase = rebuildAccountState({
    events: events.slice(0, 7),
    asOf: "2026-03-01T09:11:00Z",
  });
  const incrementalState = applyEventsIncrementally(incrementalBase, events.slice(7));
  assert.deepEqual(stripState(incrementalState), stripState(fullState));

  const asOfState = rebuildAccountState({
    events,
    asOf: "2026-03-01T09:12:30Z",
  });

  assert.deepEqual(asOfState.balancesByAccountCurrency, {
    "acct-a": { USD: 800 },
    "acct-b": { USD: 180 },
  });
  assert.deepEqual(asOfState.pendingTransfers, []);

  console.log("task-f-check: OK");
}

main();
