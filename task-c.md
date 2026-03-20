# Task C: Hard Ledger Replay

## Background

The current account-state replay logic only supports simple append-only event
streams. Real workloads now include:

- duplicate idempotency keys
- out-of-order delivery
- paired transfer events
- retroactive `correction`
- `reversal`
- historical `asOf` queries
- optional snapshots for replay acceleration

An incremental update path is also required for streaming systems.

## Goal

Implement both:

- `rebuildAccountState({ events, snapshots, asOf })`
- `applyEventsIncrementally(previousState, newEvents)`

Both functions must produce equivalent results when they represent the same
effective event stream.

## Event Shape

```js
{
  id: "evt-123",
  kind: "deposit" | "withdrawal" | "fee" | "transfer_debit" | "transfer_credit" | "correction" | "reversal",
  accountId: "acct-1",
  transferId: "tx-1",
  currency: "USD",
  amount: 500,
  correctedAmount: 700,
  targetEventId: "evt-100",
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
  - `deposit` increases balance
  - `withdrawal` and `fee` decrease balance
  - `transfer_debit` decreases the source account balance
  - `transfer_credit` increases the destination account balance
- `pendingTransfers` must include transfer groups where only one half is
  present by `asOf`
- `correction` changes the effective amount of the referenced event
  retroactively
- `reversal` negates the current effective delta of the referenced event
- `reversal` of an unknown target must be skipped
- `reversal` of an already reversed target must be skipped
- `correction` of an unknown target must be skipped
- `correction` of an already reversed target must be skipped
- `asOf` excludes all future events

## Snapshot

Snapshots are optional input objects.

```js
{
  snapshotId: "snap-1",
  asOf: "2026-03-01T10:00:00Z"
}
```

You may use snapshots or ignore them for replay. However,
`invalidatedSnapshots` must include any snapshot that falls after an event later
modified by `correction` or `reversal`.

## Return Shape

```js
{
  balancesByAccountCurrency,
  pendingTransfers,
  invalidatedSnapshots,
  auditTrail,
  invariants
}
```

## Audit Rules

- every considered event must produce exactly one audit record
- `action` is `applied` or `skipped`
- `reason` must be one of:
  - `applied`
  - `duplicate_idempotency`
  - `transfer_pending`
  - `correction_applied`
  - `reversal_applied`
  - `unknown_target`
  - `already_reversed`

## Incremental Mode

`applyEventsIncrementally(previousState, newEvents)` must return the same final
state as replaying the full effective event stream from scratch.

## Requirements

- keep existing tests passing
- add or update tests
- run the test suite
- report what changed and the final result
