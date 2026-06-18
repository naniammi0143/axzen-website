function toPaise(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

function formatRupees(paise) {
  return `Rs. ${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function normalizeCommission(input = {}) {
  const type = input.commissionType === "fixed" ? "fixed" : "percentage";
  const legacyPercent = Number(input.commissionBps) >= 0 ? Number(input.commissionBps) / 100 : 12;
  const rawValue = input.commissionValue ?? legacyPercent;
  const value = Math.max(Number(rawValue) || 0, 0);

  return { type, value };
}

function calculateCommission(productTotalPaise, commission = {}) {
  const productTotal = Math.max(Number(productTotalPaise) || 0, 0);
  const { type, value } = normalizeCommission(commission);
  const commissionAmountPaise =
    type === "fixed"
      ? Math.min(toPaise(value), productTotal)
      : Math.min(Math.round((productTotal * value) / 100), productTotal);

  return {
    commissionType: type,
    commissionValue: value,
    commissionAmountPaise,
    sellerPayoutPaise: Math.max(productTotal - commissionAmountPaise, 0),
  };
}

function getPaymentChargePercent(defaultPercent = 2) {
  const configured = Number(process.env.PAYMENT_CHARGE_PERCENT ?? process.env.DEFAULT_PAYMENT_CHARGE_PERCENT ?? defaultPercent);
  return Number.isFinite(configured) && configured >= 0 ? configured : defaultPercent;
}

function getSellerCommission(seller, defaultCommission = {}) {
  if (seller?.commissionType && seller.commissionValue !== undefined && seller.commissionValue !== null) {
    return {
      commissionType: seller.commissionType,
      commissionValue: seller.commissionValue,
    };
  }

  if (Number.isFinite(Number(seller?.commissionBps))) {
    return {
      commissionType: "percentage",
      commissionValue: Number(seller.commissionBps) / 100,
    };
  }

  return {
    commissionType: defaultCommission.commissionType || process.env.DEFAULT_COMMISSION_TYPE || "percentage",
    commissionValue: Number(defaultCommission.commissionValue ?? process.env.DEFAULT_COMMISSION_VALUE ?? 12),
  };
}

function calculateOrderFinance(items, commission = {}, deliveryChargePaise = 4000) {
  const productTotalPaise = items.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const safeDeliveryChargePaise = Math.max(Number(deliveryChargePaise) || 0, 0);
  const calculated = calculateCommission(productTotalPaise, commission);
  const paymentChargePercent = getPaymentChargePercent();
  const paymentChargePaise = Math.min(Math.round((productTotalPaise * paymentChargePercent) / 100), calculated.sellerPayoutPaise);
  const netSellerPayoutPaise = Math.max(calculated.sellerPayoutPaise - paymentChargePaise, 0);
  const customerPaidPaise = productTotalPaise + safeDeliveryChargePaise;

  return {
    currency: "INR",
    productTotalPaise,
    subtotalPaise: productTotalPaise,
    deliveryChargePaise: safeDeliveryChargePaise,
    deliveryFeePaise: safeDeliveryChargePaise,
    customerPaidPaise,
    totalPaise: customerPaidPaise,
    commissionType: calculated.commissionType,
    commissionValue: calculated.commissionValue,
    commissionAmountPaise: calculated.commissionAmountPaise,
    commissionPaise: calculated.commissionAmountPaise,
    paymentChargePercent,
    paymentChargePaise,
    onlinePaymentChargePaise: paymentChargePaise,
    sellerPayoutBeforePaymentChargePaise: calculated.sellerPayoutPaise,
    sellerPayoutPaise: netSellerPayoutPaise,
    sellerEarningsPaise: netSellerPayoutPaise,
  };
}

module.exports = {
  calculateCommission,
  getPaymentChargePercent,
  toPaise,
  formatRupees,
  calculateOrderFinance,
  getSellerCommission,
};
