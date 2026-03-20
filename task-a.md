# Task A: Existing Bug Fix

## Background

For category-limited coupons, eligibility should be based on the subtotal of
the eligible items, not the subtotal of the full order.

## Goal

Fix the checkout pricing bug so a coupon is applied only when the eligible
items subtotal satisfies `minimumSubtotal`.

## Requirements

- identify the root cause
- keep the change minimal
- preserve the existing behavior for coupons without category limits
- make the tests pass

## Expected Flow

- read the relevant code
- run the tests
- fix the bug
- update or add tests if needed
- report what changed
