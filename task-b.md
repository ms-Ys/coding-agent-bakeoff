# Task B: 小機能追加

## 背景

売上レポートに次の機能追加が必要です。

- `categoryFilter`: when present, only matching item categories should be
  included in the totals

さらに次の指標も追加する必要があります。

- `discountedRevenue`: the amount of discounts attributable to the included
  items

## ルール

- 機能追加先は `buildRevenueReport(orders, options = {})`
- `categoryFilter` はカテゴリ名の配列
- filter がある場合、売上やカテゴリ内訳には一致する line item だけを含める
- `totalOrders` と `paidOrders` は、一致する line item を1件以上持つ注文だけ数える
- 割引額は、対象 line item の gross subtotal 比率で按分する
- `discountedRevenue` は常に返す。filter が無い場合は、有料注文全体の割引合計と一致する
- `categoryFilter` を省略した場合は既存挙動を維持する

## 要件

- 機能を実装する
- テストを追加または更新する
- 既存テストを通す
- 最後に変更内容とトレードオフを報告する
