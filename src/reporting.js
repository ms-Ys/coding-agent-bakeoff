const { roundCurrency } = require("./checkout");

function getOrderGross(order) {
  return roundCurrency(
    order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  );
}

function inDateRange(order, options) {
  const createdAt = new Date(order.createdAt).getTime();

  if (options.from && createdAt < new Date(options.from).getTime()) {
    return false;
  }

  if (options.to && createdAt > new Date(options.to).getTime()) {
    return false;
  }

  return true;
}

function buildRevenueReport(orders, options = {}) {
  const includedOrders = orders.filter((order) => inDateRange(order, options));

  const report = {
    totalOrders: includedOrders.length,
    paidOrders: 0,
    grossRevenue: 0,
    refundedRevenue: 0,
    netRevenue: 0,
    categoryBreakdown: {},
  };

  for (const order of includedOrders) {
    const gross = getOrderGross(order);

    if (order.status === "paid") {
      report.paidOrders += 1;
      report.grossRevenue = roundCurrency(report.grossRevenue + gross);
      report.netRevenue = roundCurrency(report.netRevenue + gross - order.discounts);

      for (const item of order.items) {
        report.categoryBreakdown[item.category] =
          (report.categoryBreakdown[item.category] ?? 0) + item.quantity;
      }
    } else if (order.status === "refunded") {
      report.refundedRevenue = roundCurrency(report.refundedRevenue + gross);
      report.netRevenue = roundCurrency(report.netRevenue - gross);
    }
  }

  return report;
}

module.exports = {
  buildRevenueReport,
  getOrderGross,
  inDateRange,
};
