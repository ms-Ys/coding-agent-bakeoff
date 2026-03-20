# Task D: Retroactive Transfer Rebinding

## Background

The settlement engine previously assumed append-only transfer streams. In real
operations, retroactive maintenance events can appear later:

- rebinding an existing transfer half to a different `transferId`
- redirecting a `transfer_credit` to a different destination account

An incremental update path is also required for streaming consumers.

## Goal

Implement both:

- `rebuildSettlementState({ events, asOf })`
- `applySettlementEventsIncrementally(previousState, newEvents)`

Both functions must return the same public state when they represent the same
effective event stream.

## Event Shape

```js
{
  id: "evt-123",
  kind: "transfer_debit" | "transfer_credit" | "transfer_rebind" | "credit_redirect",
  transferId: "tx-1",
  accountId: "acct-1",
  targetEventId: "evt-100",
  newTransferId: "tx-2",
  newAccountId: "acct-9",
  currency: "USD",
  amount: 500,
  occurredAt: "2026-03-01T09:00:00Z",
  sequence: 2,
  idempotencyKey: "abc-123"
}
```

## Rules

- deterministic sort order:
  1. `occurredAt` ascending
  2. `sequence` ascending when both sides have one
  3. original input order as the final tie-break
- if multiple events share the same `idempotencyKey`, only the first sorted one
  is applied and the rest are skipped
- signed deltas:
  - `transfer_debit` decreases the source account balance
  - `transfer_credit` increases the destination account balance
- a transfer is considered settled when one debit and one credit share the same
  effective `transferId`
- `pendingTransfers` must include transfer groups where only one half is
  present by `asOf`
- `settledTransfers` must include transfer groups where both halves are present
  by `asOf`
- `transfer_rebind` changes the effective `transferId` of an existing transfer
  half
- `credit_redirect` changes the destination `accountId` of an existing
  `transfer_credit`
- `transfer_rebind` is valid only for `transfer_debit` or `transfer_credit`
- `credit_redirect` is valid only for `transfer_credit`
- unknown targets must be skipped
- invalid target kinds must be skipped
- `asOf` excludes all future events

## Return Shape

```js
{
  balancesByAccountCurrency,
  pendingTransfers,
  settledTransfers,
  auditTrail,
  invariants
}
```

## Requirements

- implement the feature
- add or update tests if needed
- keep existing tests passing
- report what changed and the final test result
