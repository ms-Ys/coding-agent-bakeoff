const test = require("node:test");
const assert = require("node:assert/strict");

const { createOrderSummary } = require("../src/checkout");

test("applies loyalty discount before final total", () => {
  const order = {
    items: [
      { sku: "kbd", category: "electronics", unitPrice: 120, quantity: 1 },
      { sku: "book-1", category: "books", unitPrice: 25, quantity: 2 },
    ],
  };

  const summary = createOrderSummary(order, null, "silver");

  assert.deepEqual(summary, {
    subtotal: 170,
    loyaltyDiscount: 8.5,
    couponDiscount: 0,
    total: 161.5,
  });
});

test("applies percent coupon to eligible categories", () => {
  const order = {
    items: [
      { sku: "mouse", category: "electronics", unitPrice: 80, quantity: 1 },
      { sku: "book-2", category: "books", unitPrice: 20, quantity: 3 },
    ],
  };

  const coupon = {
    code: "BOOK20",
    type: "percent",
    amount: 20,
    minimumSubtotal: 50,
    eligibleCategories: ["books"],
  };

  const summary = createOrderSummary(order, coupon, "none");

  assert.equal(summary.couponDiscount, 12);
  assert.equal(summary.total, 128);
});
