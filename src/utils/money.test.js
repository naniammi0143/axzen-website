const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateOrderFinance, getSellerCommission } = require("./money");

const items = [{ pricePaise: 100000, quantity: 1 }];

test("calculates percentage commission on product total only", () => {
  const finance = calculateOrderFinance(items, { commissionType: "percentage", commissionValue: 10 }, 5000);

  assert.equal(finance.productTotalPaise, 100000);
  assert.equal(finance.deliveryChargePaise, 5000);
  assert.equal(finance.customerPaidPaise, 105000);
  assert.equal(finance.commissionAmountPaise, 10000);
  assert.equal(finance.paymentChargePaise, 2000);
  assert.equal(finance.sellerPayoutBeforePaymentChargePaise, 90000);
  assert.equal(finance.sellerPayoutPaise, 88000);
});

test("calculates fixed commission and prevents negative payout", () => {
  const finance = calculateOrderFinance(items, { commissionType: "fixed", commissionValue: 1200 }, 5000);

  assert.equal(finance.commissionAmountPaise, 100000);
  assert.equal(finance.sellerPayoutPaise, 0);
});

test("supports zero delivery charge", () => {
  const finance = calculateOrderFinance(items, { commissionType: "percentage", commissionValue: 5 }, 0);

  assert.equal(finance.deliveryChargePaise, 0);
  assert.equal(finance.customerPaidPaise, 100000);
  assert.equal(finance.commissionAmountPaise, 5000);
});

test("cuts seller-paid free delivery from seller payout only", () => {
  const finance = calculateOrderFinance(items, { commissionType: "percentage", commissionValue: 10 }, 0, 4000);

  assert.equal(finance.deliveryChargePaise, 0);
  assert.equal(finance.sellerDeliveryChargePaise, 4000);
  assert.equal(finance.customerPaidPaise, 100000);
  assert.equal(finance.sellerPayoutPaise, 84000);
});

test("uses legacy seller commission bps when explicit settings are absent", () => {
  const commission = getSellerCommission({ commissionBps: 1500 });

  assert.deepEqual(commission, {
    commissionType: "percentage",
    commissionValue: 15,
  });
});

test("uses default commission when seller has no settings", () => {
  const commission = getSellerCommission(null, { commissionType: "percentage", commissionValue: 8 });

  assert.deepEqual(commission, {
    commissionType: "percentage",
    commissionValue: 8,
  });
});
