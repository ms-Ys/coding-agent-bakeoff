const path = require("node:path");
const assert = require("node:assert/strict");

function loadReporting(repoDir) {
  const reportingPath = path.join(repoDir, "src", "reporting.js");
  delete require.cache[require.resolve(reportingPath)];
  return require(reportingPath);
}

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
  {
    id: "o-103",
    createdAt: "2026-03-10T11:15:00Z",
    status: "paid",
    discounts: 20,
    items: [
      { sku: "desk-lamp", category: "electronics", unitPrice: 80, quantity: 1 },
      { sku: "book-5", category: "books", unitPrice: 40, quantity: 3 },
    ],
  },
];

function main() {
  const repoDir = process.argv[2];

  if (!repoDir) {
    console.error("Usage: node task-b-check.js <repo-dir>");
    process.exit(1);
  }

  const { buildRevenueReport } = loadReporting(repoDir);

  const noFilterReport = buildRevenueReport(ORDERS);
  assert.deepEqual(noFilterReport, {
    totalOrders: 4,
    paidOrders: 3,
    grossRevenue: 390,
    refundedRevenue: 30,
    discountedRevenue: 44,
    netRevenue: 316,
    categoryBreakdown: {
      electronics: 2,
      books: 6,
      stationery: 4,
    },
  });

  const booksOnlyReport = buildRevenueReport(ORDERS, {
    categoryFilter: ["books"],
  });
  assert.deepEqual(booksOnlyReport, {
    totalOrders: 3,
    paidOrders: 3,
    grossRevenue: 190,
    refundedRevenue: 0,
    discountedRevenue: 22,
    netRevenue: 168,
    categoryBreakdown: {
      books: 6,
    },
  });

  console.log("task-b-check: OK");
}

main();
