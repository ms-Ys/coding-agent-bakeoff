const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applySettlementEventsIncrementally,
  rebuildSettlementState,
} = require("../src/settlement-state");

test("rebuildSettlementState handles a complete transfer pair", () => {
  const state = rebuildSettlementState({
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
      {
        id: "evt-2",
        kind: "transfer_credit",
        transferId: "tx-1",
        accountId: "acct-b",
        currency: "USD",
        amount: 250,
        occurredAt: "2026-03-01T09:05:00Z",
        sequence: 1,
      },
    ],
  });

  assert.deepEqual(state.balancesByAccountCurrency, {
    "acct-a": { USD: -250 },
    "acct-b": { USD: 250 },
  });
  assert.deepEqual(state.pendingTransfers, []);
  assert.deepEqual(state.settledTransfers, [
    {
      transferId: "tx-1",
      currency: "USD",
      amount: 250,
      sourceAccountId: "acct-a",
      destinationAccountId: "acct-b",
    },
  ]);
});

test("rebuildSettlementState keeps unmatched halves pending", () => {
  const state = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_credit",
        transferId: "tx-9",
        accountId: "acct-z",
        currency: "USD",
        amount: 30,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
    ],
  });

  assert.deepEqual(state.pendingTransfers, [
    {
      transferId: "tx-9",
      currency: "USD",
      amount: 30,
      destinationAccountId: "acct-z",
      missing: "debit",
    },
  ]);
  assert.deepEqual(state.settledTransfers, []);
});

test("applySettlementEventsIncrementally settles a previously pending transfer", () => {
  const base = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-2",
        accountId: "acct-a",
        currency: "USD",
        amount: 90,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
    ],
  });

  const next = applySettlementEventsIncrementally(base, [
    {
      id: "evt-2",
      kind: "transfer_credit",
      transferId: "tx-2",
      accountId: "acct-b",
      currency: "USD",
      amount: 90,
      occurredAt: "2026-03-01T09:05:00Z",
      sequence: 1,
    },
  ]);

  assert.deepEqual(next.pendingTransfers, []);
  assert.deepEqual(next.settledTransfers, [
    {
      transferId: "tx-2",
      currency: "USD",
      amount: 90,
      sourceAccountId: "acct-a",
      destinationAccountId: "acct-b",
    },
  ]);
  assert.deepEqual(next.balancesByAccountCurrency, {
    "acct-a": { USD: -90 },
    "acct-b": { USD: 90 },
  });
});

// --- Task G: transfer_rebind and credit_redirect tests ---

test("transfer_rebind retargets a debit to a new transferId", () => {
  const state = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-1",
        accountId: "acct-a",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
      {
        id: "evt-2",
        kind: "transfer_credit",
        transferId: "tx-2",
        accountId: "acct-b",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-01T09:01:00Z",
        sequence: 1,
      },
      {
        id: "evt-3",
        kind: "transfer_rebind",
        targetEventId: "evt-1",
        newTransferId: "tx-2",
        occurredAt: "2026-03-01T09:02:00Z",
        sequence: 1,
      },
    ],
  });

  // After rebind, evt-1 is effectively on tx-2, pairing with evt-2
  assert.deepEqual(state.settledTransfers, [
    {
      transferId: "tx-2",
      currency: "USD",
      amount: 100,
      sourceAccountId: "acct-a",
      destinationAccountId: "acct-b",
    },
  ]);
  assert.deepEqual(state.pendingTransfers, []);
  assert.deepEqual(state.balancesByAccountCurrency, {
    "acct-a": { USD: -100 },
    "acct-b": { USD: 100 },
  });

  // Audit trail
  const rebindAudit = state.auditTrail.find((a) => a.eventId === "evt-3");
  assert.equal(rebindAudit.action, "applied");
  assert.equal(rebindAudit.reason, "rebind_applied");

  // Base events reflect final settled status
  const evt1Audit = state.auditTrail.find((a) => a.eventId === "evt-1");
  assert.equal(evt1Audit.reason, "settled");
  const evt2Audit = state.auditTrail.find((a) => a.eventId === "evt-2");
  assert.equal(evt2Audit.reason, "settled");
});

test("credit_redirect retargets a credit to a new account", () => {
  const state = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-1",
        accountId: "acct-a",
        currency: "USD",
        amount: 200,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
      {
        id: "evt-2",
        kind: "transfer_credit",
        transferId: "tx-1",
        accountId: "acct-b",
        currency: "USD",
        amount: 200,
        occurredAt: "2026-03-01T09:01:00Z",
        sequence: 1,
      },
      {
        id: "evt-3",
        kind: "credit_redirect",
        targetEventId: "evt-2",
        newAccountId: "acct-c",
        occurredAt: "2026-03-01T09:02:00Z",
        sequence: 1,
      },
    ],
  });

  // Credit now goes to acct-c instead of acct-b
  assert.deepEqual(state.settledTransfers, [
    {
      transferId: "tx-1",
      currency: "USD",
      amount: 200,
      sourceAccountId: "acct-a",
      destinationAccountId: "acct-c",
    },
  ]);
  assert.deepEqual(state.balancesByAccountCurrency, {
    "acct-a": { USD: -200 },
    "acct-c": { USD: 200 },
  });

  const redirectAudit = state.auditTrail.find((a) => a.eventId === "evt-3");
  assert.equal(redirectAudit.action, "applied");
  assert.equal(redirectAudit.reason, "redirect_applied");
});

test("transfer_rebind skips unknown target", () => {
  const state = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_rebind",
        targetEventId: "evt-nonexistent",
        newTransferId: "tx-2",
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
    ],
  });

  assert.deepEqual(state.auditTrail, [
    { eventId: "evt-1", action: "skipped", reason: "unknown_target" },
  ]);
});

test("credit_redirect skips when target is a debit (invalid_target_kind)", () => {
  const state = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-1",
        accountId: "acct-a",
        currency: "USD",
        amount: 50,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
      {
        id: "evt-2",
        kind: "credit_redirect",
        targetEventId: "evt-1",
        newAccountId: "acct-c",
        occurredAt: "2026-03-01T09:01:00Z",
        sequence: 1,
      },
    ],
  });

  const audit = state.auditTrail.find((a) => a.eventId === "evt-2");
  assert.equal(audit.action, "skipped");
  assert.equal(audit.reason, "invalid_target_kind");
});

test("idempotencyKey deduplication skips later events", () => {
  const state = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-1",
        accountId: "acct-a",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
        idempotencyKey: "key-1",
      },
      {
        id: "evt-2",
        kind: "transfer_debit",
        transferId: "tx-1",
        accountId: "acct-a",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-01T09:01:00Z",
        sequence: 1,
        idempotencyKey: "key-1",
      },
    ],
  });

  assert.equal(state.auditTrail.length, 2);
  assert.equal(state.auditTrail[0].action, "applied");
  assert.equal(state.auditTrail[1].action, "skipped");
  assert.equal(state.auditTrail[1].reason, "duplicate_idempotency");
});

test("asOf excludes future events", () => {
  const state = rebuildSettlementState({
    events: [
      {
        id: "evt-1",
        kind: "transfer_debit",
        transferId: "tx-1",
        accountId: "acct-a",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
      {
        id: "evt-2",
        kind: "transfer_credit",
        transferId: "tx-1",
        accountId: "acct-b",
        currency: "USD",
        amount: 100,
        occurredAt: "2026-03-05T09:00:00Z",
        sequence: 1,
      },
    ],
    asOf: "2026-03-02T00:00:00Z",
  });

  // Only debit visible, credit is in the future
  assert.deepEqual(state.pendingTransfers, [
    {
      transferId: "tx-1",
      currency: "USD",
      amount: 100,
      sourceAccountId: "acct-a",
      missing: "credit",
    },
  ]);
  assert.deepEqual(state.settledTransfers, []);
});

test("incremental consistency: rebuild vs incremental produce same public state", () => {
  const allEvents = [
    {
      id: "evt-1",
      kind: "transfer_debit",
      transferId: "tx-1",
      accountId: "acct-a",
      currency: "USD",
      amount: 500,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-2",
      kind: "transfer_credit",
      transferId: "tx-old",
      accountId: "acct-b",
      currency: "USD",
      amount: 500,
      occurredAt: "2026-03-01T09:01:00Z",
      sequence: 1,
    },
    {
      id: "evt-3",
      kind: "transfer_rebind",
      targetEventId: "evt-2",
      newTransferId: "tx-1",
      occurredAt: "2026-03-01T09:02:00Z",
      sequence: 1,
    },
  ];

  const firstBatch = allEvents.slice(0, 2);
  const secondBatch = allEvents.slice(2);

  const fromScratch = rebuildSettlementState({ events: allEvents });
  const base = rebuildSettlementState({ events: firstBatch });
  const incremental = applySettlementEventsIncrementally(base, secondBatch);

  assert.deepEqual(incremental.balancesByAccountCurrency, fromScratch.balancesByAccountCurrency);
  assert.deepEqual(incremental.pendingTransfers, fromScratch.pendingTransfers);
  assert.deepEqual(incremental.settledTransfers, fromScratch.settledTransfers);
  assert.deepEqual(incremental.invariants, fromScratch.invariants);
  assert.deepEqual(incremental.auditTrail, fromScratch.auditTrail);
});

test("incremental consistency with credit_redirect", () => {
  const allEvents = [
    {
      id: "evt-1",
      kind: "transfer_debit",
      transferId: "tx-1",
      accountId: "acct-a",
      currency: "EUR",
      amount: 300,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-2",
      kind: "transfer_credit",
      transferId: "tx-1",
      accountId: "acct-b",
      currency: "EUR",
      amount: 300,
      occurredAt: "2026-03-01T09:01:00Z",
      sequence: 1,
    },
    {
      id: "evt-3",
      kind: "credit_redirect",
      targetEventId: "evt-2",
      newAccountId: "acct-c",
      occurredAt: "2026-03-01T09:02:00Z",
      sequence: 1,
    },
  ];

  const fromScratch = rebuildSettlementState({ events: allEvents });
  const base = rebuildSettlementState({ events: allEvents.slice(0, 2) });
  const incremental = applySettlementEventsIncrementally(base, allEvents.slice(2));

  assert.deepEqual(incremental.balancesByAccountCurrency, fromScratch.balancesByAccountCurrency);
  assert.deepEqual(incremental.pendingTransfers, fromScratch.pendingTransfers);
  assert.deepEqual(incremental.settledTransfers, fromScratch.settledTransfers);
  assert.deepEqual(incremental.invariants, fromScratch.invariants);
});
