const path = require("node:path");
const assert = require("node:assert/strict");

function loadLedger(repoDir) {
  const ledgerPath = path.join(repoDir, "src", "ledger.js");
  delete require.cache[require.resolve(ledgerPath)];
  return require(ledgerPath);
}

function main() {
  const repoDir = process.argv[2];

  if (!repoDir) {
    console.error("Usage: node task-d-check.js <repo-dir>");
    process.exit(1);
  }

  const { rebuildLedger } = loadLedger(repoDir);

  const events = [
    {
      id: "evt-credit-1",
      kind: "credit",
      currency: "USD",
      amount: 1000,
      occurredAt: "2026-03-01T09:00:00Z",
      sequence: 1,
      idempotencyKey: "credit-1",
    },
    {
      id: "evt-charge-dup-late",
      kind: "charge",
      currency: "USD",
      amount: 450,
      occurredAt: "2026-03-01T10:00:00Z",
      sequence: 4,
      idempotencyKey: "charge-dup",
    },
    {
      id: "evt-charge-dup-early",
      kind: "charge",
      currency: "USD",
      amount: 450,
      occurredAt: "2026-03-01T10:00:00Z",
      sequence: 2,
      idempotencyKey: "charge-dup",
    },
    {
      id: "evt-refund-1",
      kind: "refund",
      currency: "USD",
      amount: 200,
      occurredAt: "2026-03-01T11:00:00Z",
      sequence: 1,
      idempotencyKey: "refund-1",
    },
    {
      id: "evt-reversal-refund",
      kind: "reversal",
      currency: "USD",
      amount: 0,
      occurredAt: "2026-03-01T12:00:00Z",
      sequence: 1,
      reverses: "evt-refund-1",
    },
    {
      id: "evt-chargeback-1",
      kind: "chargeback",
      currency: "USD",
      amount: 250,
      occurredAt: "2026-03-01T13:00:00Z",
      sequence: 1,
      idempotencyKey: "chargeback-1",
    },
    {
      id: "evt-unknown-reversal",
      kind: "reversal",
      currency: "USD",
      amount: 0,
      occurredAt: "2026-03-01T14:00:00Z",
      sequence: 1,
      reverses: "evt-missing",
    },
    {
      id: "evt-eur-credit",
      kind: "credit",
      currency: "EUR",
      amount: 300,
      occurredAt: "2026-03-01T09:30:00Z",
      sequence: 1,
      idempotencyKey: "eur-credit-1",
    },
    {
      id: "evt-eur-charge",
      kind: "charge",
      currency: "EUR",
      amount: 125,
      occurredAt: "2026-03-01T10:30:00Z",
      sequence: 1,
      idempotencyKey: "eur-charge-1",
    },
  ];

  const result = rebuildLedger(events);

  assert.deepEqual(result.balanceByCurrency, {
    EUR: 175,
    USD: 300,
  });

  assert.deepEqual(result.entries.map((entry) => ({
    id: entry.id,
    delta: entry.delta,
    balanceAfter: entry.balanceAfter,
  })), [
    { id: "evt-credit-1", delta: 1000, balanceAfter: 1000 },
    { id: "evt-eur-credit", delta: 300, balanceAfter: 300 },
    { id: "evt-charge-dup-early", delta: -450, balanceAfter: 550 },
    { id: "evt-eur-charge", delta: -125, balanceAfter: 175 },
    { id: "evt-refund-1", delta: 200, balanceAfter: 750 },
    { id: "evt-reversal-refund", delta: -200, balanceAfter: 550 },
    { id: "evt-chargeback-1", delta: -250, balanceAfter: 300 },
  ]);

  assert.deepEqual(result.auditTrail.map((entry) => ({
    id: entry.id,
    action: entry.action,
    reason: entry.reason,
  })), [
    { id: "evt-credit-1", action: "applied", reason: "applied" },
    { id: "evt-eur-credit", action: "applied", reason: "applied" },
    { id: "evt-charge-dup-early", action: "applied", reason: "applied" },
    { id: "evt-charge-dup-late", action: "skipped", reason: "duplicate_idempotency" },
    { id: "evt-eur-charge", action: "applied", reason: "applied" },
    { id: "evt-refund-1", action: "applied", reason: "applied" },
    { id: "evt-reversal-refund", action: "applied", reason: "reversal_applied" },
    { id: "evt-chargeback-1", action: "applied", reason: "applied" },
    { id: "evt-unknown-reversal", action: "skipped", reason: "unknown_reversal_target" },
  ]);

  console.log("task-d-check: OK");
}

main();
