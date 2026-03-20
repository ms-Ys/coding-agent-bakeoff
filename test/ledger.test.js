const test = require("node:test");
const assert = require("node:assert/strict");

const { rebuildLedger } = require("../src/ledger");

test("rebuildLedger applies simple ordered ledger events", () => {
  const result = rebuildLedger([
    {
      id: "evt-1",
      kind: "credit",
      currency: "USD",
      amount: 1500,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-2",
      kind: "charge",
      currency: "USD",
      amount: 400,
      occurredAt: "2026-03-01T10:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-3",
      kind: "refund",
      currency: "USD",
      amount: 100,
      occurredAt: "2026-03-01T11:00:00Z",
      sequence: 1,
    },
  ]);

  assert.deepEqual(result.balanceByCurrency, {
    USD: 1200,
  });
  assert.equal(result.entries.length, 3);
  assert.equal(result.auditTrail.length, 3);
});

test("rebuildLedger sorts events by occurredAt", () => {
  const result = rebuildLedger([
    {
      id: "evt-2",
      kind: "charge",
      currency: "USD",
      amount: 200,
      occurredAt: "2026-03-01T11:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-1",
      kind: "credit",
      currency: "USD",
      amount: 500,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
    },
  ]);

  assert.deepEqual(result.entries.map((entry) => entry.id), ["evt-1", "evt-2"]);
  assert.equal(result.balanceByCurrency.USD, 300);
});

test("rebuildLedger tracks balances independently per currency", () => {
  const result = rebuildLedger([
    {
      id: "evt-usd-1",
      kind: "credit",
      currency: "USD",
      amount: 800,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
    },
    {
      id: "evt-eur-1",
      kind: "credit",
      currency: "EUR",
      amount: 300,
      occurredAt: "2026-03-01T09:30:00Z",
      sequence: 1,
    },
    {
      id: "evt-usd-2",
      kind: "charge",
      currency: "USD",
      amount: 150,
      occurredAt: "2026-03-01T10:00:00Z",
      sequence: 1,
    },
  ]);

  assert.deepEqual(result.balanceByCurrency, {
    EUR: 300,
    USD: 650,
  });
});
