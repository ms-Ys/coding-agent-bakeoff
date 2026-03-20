# Task C: 難問版 Ledger Replay

## 背景

現在の account-state replay は、単純な append-only event stream しか扱えません。
実際の運用では、次のような要素が混ざります。

- 重複した idempotency key
- out-of-order delivery
- ペアで届く transfer event
- 過去イベントへの `correction`
- `reversal`
- 履歴時点を切る `asOf` query
- replay 高速化のための optional snapshot

さらに、ストリーミング用途に向けて incremental update も必要です。

## ゴール

次の2つを実装してください。

- `rebuildAccountState({ events, snapshots, asOf })`
- `applyEventsIncrementally(previousState, newEvents)`

同じ effective event stream を表している場合、この2つは等価な結果を返す必要があります。

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
- 同じ `idempotencyKey` を持つ event は、sort 後に最初の1件だけ適用し、それ以降は skip する
- Signed delta は次の通り:
  - `deposit` は残高を増やす
  - `withdrawal` と `fee` は残高を減らす
  - `transfer_debit` は送金元アカウントを減らす
  - `transfer_credit` は送金先アカウントを増やす
- `pendingTransfers` には、`asOf` 時点で片側しか存在しない transfer group を含める
- `correction` は参照先 event の effective amount を過去にさかのぼって変更する
- `reversal` は参照先 event の current effective delta を反転する
- unknown target に対する `reversal` は skip する
- すでに reversed 済みの target に対する `reversal` は skip する
- unknown target に対する `correction` は skip する
- すでに reversed 済みの target に対する `correction` は skip する
- `asOf` より未来の event はすべて無視する

## Snapshot

snapshot は任意の入力です。

```js
{
  snapshotId: "snap-1",
  asOf: "2026-03-01T10:00:00Z"
}
```

replay で snapshot を使っても使わなくても構いません。  
ただし `invalidatedSnapshots` には、後から `correction` または `reversal`
で意味が変わったイベントより後の snapshot を含めてください。

## 返り値

```js
{
  balancesByAccountCurrency,
  pendingTransfers,
  invalidatedSnapshots,
  auditTrail,
  invariants
}
```

## Audit ルール

- 対象になった各 event について audit record をちょうど1件返す
- `action` は `applied` または `skipped`
- `reason` には理由を入れる:
  - `applied`
  - `duplicate_idempotency`
  - `transfer_pending`
  - `correction_applied`
  - `reversal_applied`
  - `unknown_target`
  - `already_reversed`

## Incremental mode

`applyEventsIncrementally(previousState, newEvents)` は、full effective event stream
を最初から replay した場合と同じ final state を返す必要があります。

## 要件

- 既存テストを通す
- テストを追加または更新する
- テストスイートを実行する
- 最後に変更内容と結果を報告する
