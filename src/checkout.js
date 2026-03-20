const LOYALTY_RATES = {
  none: 0,
  bronze: 0.02,
  silver: 0.05,
  gold: 0.08,
};

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function getLineSubtotal(item) {
  return roundCurrency(item.unitPrice * item.quantity);
}

function getSubtotal(items) {
  return roundCurrency(items.reduce((sum, item) => sum + getLineSubtotal(item), 0));
}

function getEligibleItems(items, coupon) {
  if (!coupon || !coupon.eligibleCategories || coupon.eligibleCategories.length === 0) {
    return items;
  }

  return items.filter((item) => coupon.eligibleCategories.includes(item.category));
}

function getLoyaltyDiscount(subtotal, loyaltyTier) {
  const rate = LOYALTY_RATES[loyaltyTier] ?? 0;
  return roundCurrency(subtotal * rate);
}

function getCouponDiscount(items, coupon) {
  if (!coupon) {
    return 0;
  }

  const eligibleItems = getEligibleItems(items, coupon);
  const eligibleSubtotal = getSubtotal(eligibleItems);
  const fullSubtotal = getSubtotal(items);

  // Intentional bug for Task A:
  // minimumSubtotal should be checked against eligibleSubtotal when a category-limited
  // coupon is used, but the current implementation checks the full subtotal.
  if (coupon.minimumSubtotal && fullSubtotal < coupon.minimumSubtotal) {
    return 0;
  }

  if (coupon.type === "percent") {
    return roundCurrency(eligibleSubtotal * (coupon.amount / 100));
  }

  if (coupon.type === "fixed") {
    return Math.min(roundCurrency(coupon.amount), eligibleSubtotal);
  }

  return 0;
}

function createOrderSummary(order, coupon = null, loyaltyTier = "none") {
  const subtotal = getSubtotal(order.items);
  const loyaltyDiscount = getLoyaltyDiscount(subtotal, loyaltyTier);
  const couponDiscount = getCouponDiscount(order.items, coupon);
  const total = roundCurrency(Math.max(subtotal - loyaltyDiscount - couponDiscount, 0));

  return {
    subtotal,
    loyaltyDiscount,
    couponDiscount,
    total,
  };
}

module.exports = {
  createOrderSummary,
  getCouponDiscount,
  getEligibleItems,
  getLineSubtotal,
  getSubtotal,
  roundCurrency,
};
