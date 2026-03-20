const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyEventsIncrementally,
  rebuildAccountState,
} = require("../src/account-state");

test("rebuildAccountState handles simple ordered deposits and withdrawals", () => {
  const state = rebuildAccountState({
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
        kind: "withdrawal",
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
});

test("rebuildAccountState handles a complete transfer pair", () => {
  const state = rebuildAccountState({
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
});

test("applyEventsIncrementally extends a simple append-only state", () => {
  const base = rebuildAccountState({
    events: [
      {
        id: "evt-1",
        kind: "deposit",
        accountId: "acct-1",
        currency: "USD",
        amount: 1000,
        occurredAt: "2026-03-01T09:00:00Z",
        sequence: 1,
      },
    ],
  });

  const next = applyEventsIncrementally(base, [
    {
      id: "evt-2",
      kind: "fee",
      accountId: "acct-1",
      currency: "USD",
      amount: 50,
      occurredAt: "2026-03-01T10:00:00Z",
      sequence: 1,
    },
  ]);

  assert.deepEqual(next.balancesByAccountCurrency, {
    "acct-1": { USD: 950 },
  });
});
