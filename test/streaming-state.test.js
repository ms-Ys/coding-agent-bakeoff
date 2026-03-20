const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyStreamingEventsIncrementally,
  rebuildStreamingState,
} = require("../src/streaming-state");

test("rebuildStreamingState handles deposits and fees", () => {
  const state = rebuildStreamingState({
    events: [
      {
        id: "evt-1",
        kind: "deposit",
        accountId: "acct-1",
        currency: "USD",
        amount: 1200,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
      {
        id: "evt-2",
        kind: "fee",
        accountId: "acct-1",
        currency: "USD",
        amount: 300,
        occurredAt: "2026-03-01T10:00:00Z",
        sequence: 1,
      },
    ],
  });

  assert.deepEqual(state.balancesByAccountCurrency, {
    "acct-1": { USD: 900 },
  });
  assert.deepEqual(state.pendingTransfers, []);
  assert.deepEqual(state.stats, {
    appliedEvents: 2,
    duplicateEvents: 0,
    settledTransfers: 0,
  });
});

test("rebuildStreamingState tracks a pending transfer", () => {
  const state = rebuildStreamingState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-1",
        accountId: "acct-a",
        currency: "USD",
        amount: 250,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
    ],
  });

  assert.deepEqual(state.pendingTransfers, [
    {
      transferId: "tx-1",
      currency: "USD",
      amount: 250,
      sourceAccountId: "acct-a",
      missing: "credit",
    },
  ]);
  assert.equal(state.stats.settledTransfers, 0);
});

test("applyStreamingEventsIncrementally extends a simple append-only state", () => {
  const base = rebuildStreamingState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-2",
        accountId: "acct-a",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
    ],
  });

  const next = applyStreamingEventsIncrementally(base, [
    {
      id: "evt-2",
      kind: "transfer_credit",
      transferId: "tx-2",
      accountId: "acct-b",
      currency: "USD",
      amount: 100,
      occurredAt: "2026-03-01T09:05:00Z",
      sequence: 1,
    },
  ]);

  assert.deepEqual(next.pendingTransfers, []);
  assert.deepEqual(next.balancesByAccountCurrency, {
    "acct-a": { USD: -100 },
    "acct-b": { USD: 100 },
  });
  assert.equal(next.stats.settledTransfers, 1);
});

test("incremental state survives JSON round-trip", () => {
  const base = rebuildStreamingState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-3",
        accountId: "acct-a",
        currency: "USD",
        amount: 200,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
    ],
  });

  // Simulate Redis storage: serialize then deserialize
  const restored = JSON.parse(JSON.stringify(base));

  const next = applyStreamingEventsIncrementally(restored, [
    {
      id: "evt-2",
      kind: "transfer_credit",
      transferId: "tx-3",
      accountId: "acct-b",
      currency: "USD",
      amount: 200,
      occurredAt: "2026-03-01T09:05:00Z",
      sequence: 1,
    },
  ]);

  assert.deepEqual(next.pendingTransfers, []);
  assert.deepEqual(next.balancesByAccountCurrency, {
    "acct-a": { USD: -200 },
    "acct-b": { USD: 200 },
  });
  assert.equal(next.stats.settledTransfers, 1);
  assert.equal(next.stats.appliedEvents, 2);
});

test("rebuild and incremental produce equivalent public state", () => {
  const allEvents = [
    {
      id: "evt-1",
      kind: "deposit",
      accountId: "acct-1",
      currency: "USD",
      amount: 1000,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-2",
      kind: "fee",
      accountId: "acct-1",
      currency: "USD",
      amount: 50,
      occurredAt: "2026-03-01T10:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-3",
      kind: "transfer_debit",
      transferId: "tx-1",
      accountId: "acct-1",
      currency: "USD",
      amount: 300,
      occurredAt: "2026-03-01T11:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-4",
      kind: "transfer_credit",
      transferId: "tx-1",
      accountId: "acct-2",
      currency: "USD",
      amount: 300,
      occurredAt: "2026-03-01T11:01:00Z",
      sequence: 1,
    },
  ];

  const fullRebuild = rebuildStreamingState({ events: allEvents });

  const base = rebuildStreamingState({ events: allEvents.slice(0, 2) });
  const serialized = JSON.parse(JSON.stringify(base));
  const incremental = applyStreamingEventsIncrementally(serialized, allEvents.slice(2));

  assert.deepEqual(incremental.balancesByAccountCurrency, fullRebuild.balancesByAccountCurrency);
  assert.deepEqual(incremental.pendingTransfers, fullRebuild.pendingTransfers);
  assert.deepEqual(incremental.cursor, fullRebuild.cursor);
  assert.deepEqual(incremental.stats, fullRebuild.stats);
});

test("idempotency dedup survives JSON round-trip", () => {
  const base = rebuildStreamingState({
    events: [
      {
        id: "evt-1",
        kind: "deposit",
        accountId: "acct-1",
        currency: "USD",
        amount: 500,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
        idempotencyKey: "key-1",
      },
    ],
  });

  const restored = JSON.parse(JSON.stringify(base));

  const next = applyStreamingEventsIncrementally(restored, [
    {
      id: "evt-2",
      kind: "deposit",
      accountId: "acct-1",
      currency: "USD",
      amount: 500,
      occurredAt: "2026-03-01T10:00:00Z",
      sequence: 1,
      idempotencyKey: "key-1",
    },
  ]);

  assert.deepEqual(next.balancesByAccountCurrency, {
    "acct-1": { USD: 500 },
  });
  assert.equal(next.stats.appliedEvents, 1);
  assert.equal(next.stats.duplicateEvents, 1);
});

test("asOf excludes future events", () => {
  const state = rebuildStreamingState({
    events: [
      {
        id: "evt-1",
        kind: "deposit",
        accountId: "acct-1",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
      {
        id: "evt-2",
        kind: "deposit",
        accountId: "acct-1",
        currency: "USD",
        amount: 200,
        occurredAt: "2026-03-02T09:00:00Z",
        sequence: 1,
      },
    ],
    asOf: "2026-03-01T12:00:00Z",
  });

  assert.deepEqual(state.balancesByAccountCurrency, {
    "acct-1": { USD: 100 },
  });
  assert.equal(state.stats.appliedEvents, 1);
});

test("state does not store raw event history", () => {
  const events = [];
  for (let i = 0; i < 100; i++) {
    events.push({
      id: `evt-${i}`,
      kind: "deposit",
      accountId: "acct-1",
      currency: "USD",
      amount: 10,
      occurredAt: `2026-03-01T09:${String(i).padStart(2, "0")}:00Z`,
      sequence: i,
    });
  }

  const state = rebuildStreamingState({ events });
  const serialized = JSON.stringify(state);

  // Should not contain event IDs in the serialized state (no raw event log)
  assert.ok(!serialized.includes("evt-50"), "state should not contain raw event history");
  // Serialized state should be compact - well under 100 events worth of data
  assert.ok(serialized.length < 5000, `serialized state too large: ${serialized.length}`);
});
