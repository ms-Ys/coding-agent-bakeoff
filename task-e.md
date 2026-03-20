# Task E: JSON-safe Compact Streaming Replay

## Background

The replay engine is being moved to a streaming consumer. Incremental state is
stored in Redis as JSON between batches, so the next batch cannot rely on
hidden in-memory metadata or raw event history.

The previous implementation also let state grow too large over time.

## Goal

Implement both:

- `rebuildStreamingState({ events, asOf })`
- `applyStreamingEventsIncrementally(previousState, newEvents)`

Both functions must return the same public state when they represent the same
effective event stream.

## Event Shape

```js
{
  id: "evt-123",
  kind: "deposit" | "fee" | "transfer_debit" | "transfer_credit",
  transferId: "tx-1",
  accountId: "acct-1",
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
- `asOf` excludes all future events
- if multiple events share the same `idempotencyKey`, only the first sorted one
  is applied across the entire stream
- signed deltas:
  - `deposit` increases balance
  - `fee` decreases balance
  - `transfer_debit` decreases the source account balance
  - `transfer_credit` increases the destination account balance
- `pendingTransfers` must include transfers where only one half is present by
  `asOf`
- a transfer is considered settled when one debit and one credit share the same
  `transferId`

## Return Shape

```js
{
  balancesByAccountCurrency,
  pendingTransfers,
  cursor,
  stats
}
```

## Incremental Constraints

- `newEvents` in incremental mode are append-only and sort strictly after the
  previous cursor
- callers may serialize state with `JSON.stringify` and restore it with
  `JSON.parse` before calling `applyStreamingEventsIncrementally`
- any additional internal fields must survive a JSON round-trip
- do not store the full raw event history in state
- hidden checks enforce compact serialized state

## Requirements

- implement the feature
- add or update tests if needed
- keep existing tests passing
- report what changed and the final test result
