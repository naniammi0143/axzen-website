const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
process.env.NODE_ENV = "test";
const rules = require("../src/utils/checkoutRules");
const gateway = require("../src/utils/razorpay");
const { calculateOrderFinance } = require("../src/utils/money");
const address = {
  fullName: "Test Customer",
  phone: "+91 90000 00001",
  address: "123 Test Street",
  city: "Hyderabad",
  state: "Telangana",
  pincode: "500001",
};
test("checkout rejects malformed, fractional and excessive quantities; consolidates ObjectID case", () => {
  for (const items of [
    null,
    [],
    [null],
    [{ productId: "x", quantity: 1 }],
    [{ productId: "a".repeat(24), quantity: 1.5 }],
    [{ productId: "a".repeat(24), quantity: 11 }],
  ])
    assert.throws(
      () => rules.normalizeItems(items),
      (e) => e.statusCode === 400,
    );
  const rows = rules.normalizeItems([
    { productId: "A".repeat(24), quantity: 2 },
    { productId: "a".repeat(24), quantity: 3 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, 5);
});
test("shipping address strips unexpected fields and validates phone and pincode", () => {
  const clean = rules.address({
    ...address,
    role: "superadmin",
    customerPaid: 0,
  });
  assert.equal(clean.phone, "9000000001");
  assert.equal(clean.role, undefined);
  for (const bad of [
    null,
    { ...address, pincode: "000000" },
    { ...address, phone: "123" },
    { ...address, address: "x" },
  ])
    assert.throws(
      () => rules.address(bad),
      (e) => e.statusCode === 400,
    );
});
test("free shipping threshold is computed server-side and carried by the seller", () => {
  const seller = {
    freeDeliveryEnabled: true,
    freeDeliveryMinOrderPaise: 10000,
  };
  assert.deepEqual(rules.deliveryFees(seller, 9999), {
    deliveryCharge: 4000,
    sellerDeliveryCharge: 0,
    freeDeliveryApplied: false,
  });
  assert.deepEqual(rules.deliveryFees(seller, 10000), {
    deliveryCharge: 0,
    sellerDeliveryCharge: 4000,
    freeDeliveryApplied: true,
  });
});
test("COD has no online gateway fee and finance totals balance", () => {
  const f = calculateOrderFinance(
    [{ pricePaise: 10000, quantity: 2 }],
    { commissionType: "percentage", commissionValue: 12 },
    4000,
    0,
    "cod",
  );
  assert.equal(f.paymentChargePaise, 0);
  assert.equal(f.customerPaidPaise, 24000);
  assert.equal(f.sellerPayoutPaise + f.commissionAmountPaise, 20000);
});
test("discounts use the highest allowed configured offer without stacking", () => {
  const id = "a".repeat(24);
  assert.equal(
    rules
      .discounts([
        { productIds: [id], discountPercent: 15 },
        { sellerEntries: [{ productIds: [id], discountPercent: 20 }] },
      ])
      .get(id),
    20,
  );
  assert.equal(
    rules.discounts([{ productIds: [id], discountPercent: 999 }]).get(id),
    90,
  );
});
test("Razorpay rejects missing configuration, mock references and malformed signatures", async () => {
  const oldId = process.env.RAZORPAY_KEY_ID,
    oldSecret = process.env.RAZORPAY_KEY_SECRET;
  try {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    assert.equal(gateway.hasRazorpayCredentials(), false);
    await assert.rejects(
      gateway.createRazorpayOrder({ amountPaise: 100 }),
      (e) => e.statusCode === 503,
    );
    process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
    process.env.RAZORPAY_KEY_SECRET = "test-only";
    const input = {
      razorpayOrderId: "order_fixture",
      razorpayPaymentId: "pay_fixture",
    };
    const sig = crypto
      .createHmac("sha256", "test-only")
      .update("order_fixture|pay_fixture")
      .digest("hex");
    assert.equal(
      gateway.verifyRazorpaySignature({ ...input, razorpaySignature: sig }),
      true,
    );
    assert.equal(
      gateway.verifyRazorpaySignature({ ...input, razorpaySignature: "abc" }),
      false,
    );
    assert.equal(
      gateway.verifyRazorpaySignature({
        ...input,
        razorpayPaymentId: "pay_other",
        razorpaySignature: sig,
      }),
      false,
    );
  } finally {
    if (oldId) process.env.RAZORPAY_KEY_ID = oldId;
    else delete process.env.RAZORPAY_KEY_ID;
    if (oldSecret) process.env.RAZORPAY_KEY_SECRET = oldSecret;
    else delete process.env.RAZORPAY_KEY_SECRET;
  }
});
test("shipping cannot fabricate a successful shipment without credentials", async () => {
  const keys = ["SHIPROCKET_TOKEN", "SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD"];
  const saved = keys.map((k) => process.env[k]);
  keys.forEach((k) => delete process.env[k]);
  try {
    await assert.rejects(
      require("../src/utils/shiprocket").createShiprocketShipment({
        order: {},
        seller: {},
        customerAddress: {},
      }),
      (e) => e.statusCode === 503,
    );
  } finally {
    keys.forEach((k, i) => {
      if (saved[i]) process.env[k] = saved[i];
    });
  }
});
test("public asset serving excludes backend code and private files without needing a database", async () => {
  const app = require("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    for (const file of [
      "/src/controllers/authController.js",
      "/server.js",
      "/package.json",
      "/.env",
      "/tests/commerce.test.cjs",
    ])
      assert.equal((await fetch(base + file)).status, 404, file);
    for (const file of [
      "/",
      "/customer/app.js",
      "/customer/storefront.css",
      "/seller",
      "/admin",
    ])
      assert.equal((await fetch(base + file)).status, 200, file);
    const r = await fetch(base + "/api/health");
    assert.equal(r.headers.get("cache-control"), "no-store");
  } finally {
    await new Promise((r) => server.close(r));
  }
});
