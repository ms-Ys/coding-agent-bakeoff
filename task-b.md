# Task B: Small Feature Addition

## Background

The revenue report needs one new filter and one new metric.

- `categoryFilter`: when present, only matching item categories should be
  included in the totals
- `discountedRevenue`: the amount of discounts attributable to the included
  items

## Rules

- implement the change in `buildRevenueReport(orders, options = {})`
- `categoryFilter` is an array of category names
- when the filter is present, totals and category breakdowns should include only
  matching line items
- `totalOrders` and `paidOrders` should count only orders that contain at least
  one matching line item
- discounts should be prorated by gross subtotal share across the included line
  items
- `discountedRevenue` must always be returned; when no filter is provided, it
  should equal the full discount total across paid orders
- omitting `categoryFilter` must preserve the existing behavior

## Requirements

- implement the feature
- add or update tests
- keep existing tests passing
- report the change and any tradeoffs at the end
