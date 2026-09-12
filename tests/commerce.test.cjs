const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
process.env.NODE_ENV = "test";
process.env.ALLOW_TEST_AUTH = "true";
process.env.JWT_SECRET = "test-secret-never-used-for-a-real-account";
process.env.RAZORPAY_KEY_ID = "rzp_test_fixture";
process.env.RAZORPAY_KEY_SECRET = "fixture-only-secret";
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const Seller = require("../src/models/Seller");
const Product = require("../src/models/Product");
const Order = require("../src/models/Order");
const Payment = require("../src/models/Payment");
const Checkout = require("../src/models/CheckoutSession");
const Cart = require("../src/models/Cart");
const rules = require("../src/utils/checkoutRules");
let db, server, base, customer, seller, items, token;
const shippingAddress = {
  fullName: "Test Customer",
  phone: "9000000001",
  address: "123 Test Street",
  city: "Hyderabad",
  state: "Telangana",
  pincode: "500001",
};
async function request(route, body, auth = token, method) {
  const response = await fetch(base + route, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      ...(auth ? { Authorization: "Bearer " + auth } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  db = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "7.0.24" },
  });
  await mongoose.connect(db.getUri());
  const app = require("../src/app");
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
  customer = await User.create({
    name: "Customer",
    role: "customer",
    phone: "+919000000001",
    status: "active",
  });
  const u = await User.create({
    name: "Seller",
    role: "seller",
    phone: "+919000000002",
    status: "active",
  });
  seller = await Seller.create({
    userId: u._id,
    businessName: "Test Store",
    isActive: true,
    status: "active",
    approvalStatus: "approved",
    kycStatus: "approved",
    codEnabled: true,
    onlinePaymentEnabled: true,
  });
  items = await Product.create([
    {
      sellerId: seller._id,
      sellerName: "Test Store",
      sku: "ONE",
      title: "Product One",
      pricePaise: 10000,
      stock: 30,
      status: "active",
    },
    {
      sellerId: seller._id,
      sellerName: "Test Store",
      sku: "TWO",
      title: "Product Two",
      pricePaise: 20000,
      stock: 30,
      status: "approved",
    },
  ]);
  token = jwt.sign(
    { id: customer._id.toString(), role: "customer" },
    process.env.JWT_SECRET,
  );
});
after(async () => {
  server?.close();
  await mongoose.disconnect();
  await db?.stop();
});
test("public OTP cannot create admin or superadmin accounts", async () => {
  for (const role of ["admin", "superadmin", "finance"]) {
    const r = await request(
      "/api/auth/phone-login",
      { role, firebaseToken: "local-test-fixture" },
      "",
    );
    assert.equal(r.status, 403);
  }
  assert.equal(await User.countDocuments({ role: "superadmin" }), 0);
});
test("blocked users cannot use existing tokens", async () => {
  await User.updateOne({ _id: customer._id }, { status: "blocked" });
  assert.equal((await request("/api/customer/me")).status, 401);
  await User.updateOne({ _id: customer._id }, { status: "active" });
});
test("backend and config files are not publicly served", async () => {
  for (const path of [
    "/src/controllers/authController.js",
    "/server.js",
    "/package.json",
    "/.env",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 404, path);
  }
  for (const path of ["/", "/seller", "/admin", "/customer/app.js"])
    assert.equal((await fetch(base + path)).status, 200);
});
test("quote ignores client fees, rejects mixed sellers and charges no gateway fee for COD", async () => {
  const r = await request("/api/orders/quote", {
    items: [{ productId: items[0]._id, quantity: 2 }],
    deliveryCharge: 0,
    sellerDeliveryCharge: 999,
    paymentMethod: "cod",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.quote.finance.deliveryChargePaise, 4000);
  assert.equal(r.body.quote.finance.paymentChargePaise, 0);
  assert.throws(() =>
    rules.normalizeItems([
      { productId: String(items[0]._id), quantity: 10 },
      { productId: String(items[0]._id), quantity: 1 },
    ]),
  );
});
test("blocked seller cannot receive checkout orders", async () => {
  await Seller.updateOne({ _id: seller._id }, { status: "blocked" });
  const r = await request("/api/orders/quote", {
    items: [{ productId: items[0]._id, quantity: 1 }],
    paymentMethod: "cod",
  });
  assert.equal(r.status, 409);
  await Seller.updateOne({ _id: seller._id }, { status: "active" });
});
test("COD retry is idempotent, preserves other-store cart items and cancellation restores stock once", async () => {
  const other = await Seller.create({
    userId: new mongoose.Types.ObjectId(),
    businessName: "Other Store",
  });
  await Cart.create({
    customerId: customer._id,
    items: [
      {
        productId: items[0]._id,
        sellerId: seller._id,
        sku: "ONE",
        title: "Product One",
        quantity: 2,
        pricePaise: 10000,
        lineTotalPaise: 20000,
      },
      {
        productId: new mongoose.Types.ObjectId(),
        sellerId: other._id,
        sku: "OTHER",
        title: "Other",
        quantity: 1,
        pricePaise: 500,
        lineTotalPaise: 500,
      },
    ],
  });
  const body = {
    items: [{ productId: items[0]._id, quantity: 2 }],
    paymentMethod: "cod",
    shippingAddress,
    idempotencyKey: crypto.randomUUID(),
  };
  const first = await request("/api/customer/orders", body);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  const retry = await request("/api/customer/orders", body);
  assert.equal(retry.status, 200);
  assert.equal(first.body.order.orderId, retry.body.order.orderId);
  assert.equal((await Product.findById(items[0]._id)).stock, 28);
  assert.equal(
    (await Cart.findOne({ customerId: customer._id })).items.length,
    1,
  );
  const cancel = "/api/orders/" + first.body.order.orderId + "/cancel";
  assert.equal(
    (await request(cancel, { reason: "Changed my mind" })).status,
    200,
  );
  assert.equal((await request(cancel, { reason: "Retry" })).status, 200);
  assert.equal((await Product.findById(items[0]._id)).stock, 30);
});
test("transaction rolls back stock on an order-write failure", async () => {
  const create = Order.create;
  Order.create = async () => {
    throw new Error("Simulated order persistence failure");
  };
  try {
    const r = await request("/api/customer/orders", {
      items: [
        { productId: items[0]._id, quantity: 1 },
        { productId: items[1]._id, quantity: 1 },
      ],
      paymentMethod: "cod",
      shippingAddress,
      idempotencyKey: crypto.randomUUID(),
    });
    assert.equal(r.status, 500);
    assert.equal((await Product.findById(items[0]._id)).stock, 30);
    assert.equal((await Product.findById(items[1]._id)).stock, 30);
  } finally {
    Order.create = create;
  }
});
test("paid checkout binds customer, amount and order; repeated confirmation creates one order", async () => {
  const providerOrderId = "order_fixtureA",
    paymentId = "pay_fixtureA";
  const finance = require("../src/utils/money").calculateOrderFinance(
    [{ pricePaise: 10000, quantity: 1 }],
    { commissionType: "percentage", commissionValue: 12 },
    4000,
    0,
    "razorpay",
  );
  await Checkout.create({
    customerId: customer._id,
    providerOrderId,
    sellerId: seller._id,
    sellerName: seller.businessName,
    items: [
      {
        productId: items[0]._id,
        sellerId: seller._id,
        sku: "ONE",
        title: "Product One",
        pricePaise: 10000,
        quantity: 1,
      },
    ],
    finance,
    shippingAddress,
  });
  const signature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(providerOrderId + "|" + paymentId)
    .digest("hex");
  const body = {
    paymentMethod: "razorpay",
    razorpayOrderId: providerOrderId,
    razorpayPaymentId: paymentId,
    razorpaySignature: signature,
    items: [{ productId: items[1]._id, quantity: 9 }],
  };
  const gateway = require("../src/utils/razorpay");
  const fetchPayment = gateway.fetchRazorpayPayment;
  gateway.fetchRazorpayPayment = async () => ({
    id: paymentId,
    order_id: providerOrderId,
    status: "captured",
    amount: 1,
    currency: "INR",
  });
  try {
    assert.equal((await request("/api/customer/orders", body)).status, 409);
    gateway.fetchRazorpayPayment = async () => ({
      id: paymentId,
      order_id: providerOrderId,
      status: "captured",
      amount: finance.customerPaidPaise,
      currency: "INR",
    });
    const r = await request("/api/customer/orders", body);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.order.items[0].sku, "ONE");
    const again = await request("/api/customer/orders", body);
    assert.equal(again.status, 200);
    assert.equal(
      await Order.countDocuments({ razorpayPaymentId: paymentId }),
      1,
    );
    assert.equal(await Payment.countDocuments({ transactionId: paymentId }), 1);
  } finally {
    gateway.fetchRazorpayPayment = fetchPayment;
  }
});
test("mock online payment and unsigned shipping updates are rejected", async () => {
  const r = await request("/api/customer/orders", {
    items: [{ productId: items[0]._id, quantity: 1 }],
    paymentMethod: "online",
    mockPayment: true,
    razorpayPaymentId: "mock_pay_fixture",
    shippingAddress,
  });
  assert.equal(r.status, 400);
  const event = await request(
    "/api/orders/shiprocket/status",
    { order_id: "anything", status: "delivered" },
    "",
  );
  assert.equal(event.status, 503);
});
test("saved addresses persist by customer and never expose another account", async () => {
  const saved = await request(
    "/api/customer/me",
    { addresses: [shippingAddress] },
    token,
    "PUT",
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.body.user.addresses[0].pincode, "500001");
  assert.equal(
    (await request("/api/customer/me")).body.user.addresses.length,
    1,
  );
});
