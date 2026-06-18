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

function calculateOrderFinance(items, commissionBps = 1200, deliveryFeePaise = 4000) {
  const subtotalPaise = items.reduce((total, item) => total + item.pricePaise * item.quantity, 0);
  const commissionPaise = Math.round((subtotalPaise * commissionBps) / 10000);
  const sellerEarningsPaise = subtotalPaise - commissionPaise;
  const totalPaise = subtotalPaise + deliveryFeePaise;

  return {
    currency: "INR",
    subtotalPaise,
    deliveryFeePaise,
    totalPaise,
    commissionBps,
    commissionPaise,
    sellerEarningsPaise,
  };
}

module.exports = {
  toPaise,
  formatRupees,
  calculateOrderFinance,
};
