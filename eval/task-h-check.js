const path = require("node:path");
const assert = require("node:assert/strict");

function loadStreamingState(repoDir) {
  const modulePath = path.join(repoDir, "src", "streaming-state.js");
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function stripState(state) {
  return {
    balancesByAccountCurrency: state.balancesByAccountCurrency,
    pendingTransfers: state.pendingTransfers,
    cursor: state.cursor,
    stats: state.stats,
  };
}

function generateCompactLoad() {
  const events = [];

  for (let i = 0; i < 1200; i += 1) {
    events.push({
      id: `dep-${i}`,
      kind: "deposit",
      accountId: "acct-a",
      currency: "USD",
      amount: 1,
      occurredAt: `2026-03-01T09:${String(Math.floor(i / 20)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z`,
      sequence: 1,
      idempotencyKey: `d${i}`,
    });
  }

  return events;
}

function main() {
  const repoDir = process.argv[2];
  if (!repoDir) {
    console.error("Usage: node task-h-check.js <repo-dir>");
    process.exit(1);
  }

  const {
    rebuildStreamingState,
    applyStreamingEventsIncrementally,
  } = loadStreamingState(repoDir);

  const baseEvents = [
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
      transferId: "tx-1",
      accountId: "acct-a",
      currency: "USD",
      amount: 120,
      occurredAt: "2026-03-01T09:01:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-debit",
    },
    {
      id: "evt-3",
      kind: "fee",
      accountId: "acct-a",
      currency: "USD",
      amount: 20,
      occurredAt: "2026-03-01T09:02:00Z",
      sequence: 1,
      idempotencyKey: "fee-1",
    },
  ];

  const newEvents = [
    {
      id: "evt-4",
      kind: "transfer_credit",
      transferId: "tx-1",
      accountId: "acct-b",
      currency: "USD",
      amount: 120,
      occurredAt: "2026-03-01T09:03:00Z",
      sequence: 1,
      idempotencyKey: "tx-1-credit",
    },
    {
      id: "evt-5",
      kind: "deposit",
      accountId: "acct-a",
      currency: "USD",
      amount: 1000,
      occurredAt: "2026-03-01T09:03:30Z",
      sequence: 1,
      idempotencyKey: "dep-1",
    },
    {
      id: "evt-6",
      kind: "transfer_debit",
      transferId: "tx-2",
      accountId: "acct-b",
      currency: "USD",
      amount: 40,
      occurredAt: "2026-03-01T09:04:00Z",
      sequence: 1,
      idempotencyKey: "tx-2-debit",
    },
    {
      id: "evt-7",
      kind: "transfer_credit",
      transferId: "tx-2",
      accountId: "acct-c",
      currency: "USD",
      amount: 40,
      occurredAt: "2026-03-01T09:05:00Z",
      sequence: 1,
      idempotencyKey: "tx-2-credit",
    },
    {
      id: "evt-8",
      kind: "fee",
      accountId: "acct-b",
      currency: "USD",
      amount: 5,
      occurredAt: "2026-03-01T09:06:00Z",
      sequence: 1,
      idempotencyKey: "fee-2",
    },
  ];

  const fullState = rebuildStreamingState({
    events: [...baseEvents, ...newEvents],
    asOf: "2026-03-01T09:07:00Z",
  });

  assert.deepEqual(stripState(fullState), {
    balancesByAccountCurrency: {
      "acct-a": { USD: 860 },
      "acct-b": { USD: 75 },
      "acct-c": { USD: 40 },
    },
    pendingTransfers: [],
    cursor: {
      occurredAt: "2026-03-01T09:06:00Z",
      sequence: 1,
      eventId: "evt-8",
    },
    stats: {
      appliedEvents: 7,
      duplicateEvents: 1,
      settledTransfers: 2,
    },
  });

  const baseState = rebuildStreamingState({
    events: baseEvents,
    asOf: "2026-03-01T09:02:30Z",
  });
  const serialized = JSON.stringify(baseState);
  const restoredBase = JSON.parse(serialized);
  const incrementalState = applyStreamingEventsIncrementally(restoredBase, newEvents);

  assert.deepEqual(stripState(incrementalState), stripState(fullState));

  const compactState = rebuildStreamingState({
    events: generateCompactLoad(),
    asOf: "2026-03-01T10:59:59Z",
  });
  const serializedCompact = JSON.stringify(compactState);

  assert.ok(
    serializedCompact.length <= 25000,
    `serialized state too large: ${serializedCompact.length}`,
  );

  console.log("task-h-check: OK");
}

main();
