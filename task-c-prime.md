# Task C': Incremental Replay Consistency

## 背景

これは `Task C` の派生版です。

この課題では snapshot invalidation は扱いません。代わりに、次の点を主題にします。

- deterministic replay
- 過去イベントへの `correction`
- `reversal`
- pending transfer の管理
- full rebuild と incremental replay の完全一致

## ゴール

次の2つを実装してください。

- `rebuildAccountState({ events, asOf })`
- `applyEventsIncrementally(previousState, newEvents)`

同じ effective event stream を表している場合、この2つは同じ public state を返す必要があります。

## イベント形式

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

## ルール

- Deterministic な sort order:
  1. `occurredAt` ascending
  2. `sequence` ascending when both sides have one
  3. original input order as final tie-break
- 同じ `idempotencyKey` を持つ event は、sort 後に最初の1件だけ適用する
- Signed delta は次の通り:
  - `deposit` は残高を増やす
  - `withdrawal` と `fee` は残高を減らす
  - `transfer_debit` は送金元アカウントを減らす
  - `transfer_credit` は送金先アカウントを増やす
- `pendingTransfers` には、`asOf` 時点で片側しか存在しない transfer を含める
- `correction` は参照先の non-transfer event の effective amount を過去にさかのぼって変更する
- `reversal` は参照先の non-transfer event の current effective delta を反転する
- unknown target に対する `correction` / `reversal` は skip する
- すでに reversed 済みの target に対する `correction` は skip する
- すでに reversed 済みの target に対する `reversal` は skip する
- `asOf` より未来の event は無視する

## 返り値

```js
{
  balancesByAccountCurrency,
  pendingTransfers,
  auditTrail,
  invariants
}
```

## Audit ルール

- 対象 event ごとに audit record をちょうど1件返す
- `action` は `applied` または `skipped`
- `reason` は次のいずれか:
  - `applied`
  - `duplicate_idempotency`
  - `transfer_pending`
  - `correction_applied`
  - `reversal_applied`
  - `unknown_target`
  - `already_reversed`

## Incremental consistency

`applyEventsIncrementally(previousState, newEvents)` は、full effective event stream
を最初から replay した場合と同じ public state を返す必要があります。

## 要件

- 既存テストを通す
- テストを追加または更新する
- テストスイートを実行する
- 最後に変更内容と結果を報告する
