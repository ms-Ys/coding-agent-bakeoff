const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRevenueReport } = require("../src/reporting");

const ORDERS = [
  {
    id: "o-100",
    createdAt: "2026-03-01T09:00:00Z",
    status: "paid",
    discounts: 14,
    items: [
      { sku: "kbd", category: "electronics", unitPrice: 100, quantity: 1 },
      { sku: "book-1", category: "books", unitPrice: 20, quantity: 2 },
    ],
  },
  {
    id: "o-101",
    createdAt: "2026-03-05T12:00:00Z",
    status: "refunded",
    discounts: 0,
    items: [
      { sku: "mug", category: "lifestyle", unitPrice: 15, quantity: 2 },
    ],
  },
  {
    id: "o-102",
    createdAt: "2026-03-09T18:30:00Z",
    status: "paid",
    discounts: 10,
    items: [
      { sku: "book-2", category: "books", unitPrice: 30, quantity: 1 },
      { sku: "pen", category: "stationery", unitPrice: 5, quantity: 4 },
    ],
  },
];

test("buildRevenueReport aggregates paid and refunded orders", () => {
  const report = buildRevenueReport(ORDERS);

  assert.deepEqual(report, {
    totalOrders: 3,
    paidOrders: 2,
    grossRevenue: 190,
    refundedRevenue: 30,
    netRevenue: 136,
    categoryBreakdown: {
      electronics: 1,
      books: 3,
      stationery: 4,
    },
  });
});

test("buildRevenueReport respects date filters", () => {
  const report = buildRevenueReport(ORDERS, {
    from: "2026-03-02T00:00:00Z",
    to: "2026-03-08T23:59:59Z",
  });

  assert.deepEqual(report, {
    totalOrders: 1,
    paidOrders: 0,
    grossRevenue: 0,
    refundedRevenue: 30,
    netRevenue: -30,
    categoryBreakdown: {},
  });
});
