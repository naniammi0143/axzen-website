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

async function workflowOrder(orderId, status = 'placed') {
  const orderItems = [{ productId: String(items[0]._id), title: items[0].title, quantity: 2, pricePaise: 10000 }];
  return Order.create({
    orderId, customerId: customer._id, sellerId: seller._id, sellerName: seller.businessName,
    status, paymentMethod: 'cod', paymentStatus: 'pending', items: orderItems,
    finance: require('../src/utils/money').calculateOrderFinance(orderItems, {}, 0, 0, 'cod'),
    shippingAddress, createdAt: new Date(Date.now() - 3600000)
  });
}

test('seller fulfilment requires explicit acceptance, preserves packing without courier credentials and prevents skipped steps', async () => {
  const sellerToken=jwt.sign({id:String(seller.userId),role:'seller'},process.env.JWT_SECRET);
  const o=await workflowOrder('WORKFLOW-1');
  assert.equal((await request('/api/orders/seller',null,sellerToken)).status,200);
  assert.equal((await Order.findById(o._id)).status,'placed','GET must not auto-accept orders');
  assert.equal((await request(`/api/seller/orders/${o._id}/pack`,{},sellerToken)).status,409);
  const accepted = await request(`/api/seller/orders/${o._id}/accept`,{},sellerToken);
  assert.equal(accepted.status,200,JSON.stringify(accepted.body));
  assert.equal((await request(`/api/seller/orders/${o._id}/pack`,{},sellerToken)).status,200);
  assert.equal((await Order.findById(o._id)).status,'packed');
  const b=await request(`/api/seller/orders/${o._id}/pack-and-ship`,{packageDetails:{length:10,breadth:10,height:5,weight:.5}},sellerToken);
  assert.equal(b.status,503);
  const packed=await Order.findById(o._id);
  assert.equal(packed.status,'packed');assert.equal(packed.awbNumber,'');assert.equal(packed.shipmentBookingState,'none');
  assert.equal((await request(`/api/seller/orders/${o._id}/reject`,{reason:'Too late'},sellerToken)).status,409);
  const outsider=await User.create({role:'seller',name:'Other seller',phone:'+919000001004',status:'active'});
  await Seller.create({userId:outsider._id,businessName:'Other Store'});
  const outsideToken=jwt.sign({id:String(outsider._id),role:'seller'},process.env.JWT_SECRET);
  assert.equal((await request(`/api/seller/orders/${o._id}/accept`,{},outsideToken)).status,404);
});

test('courier operations are permission scoped, sequential and cannot mark payments paid',async()=>{
  const Admin=require('../src/models/AdminUser');
  const op=await User.create({name:'Courier ops',phone:'+919000001005',role:'delivery_manager',status:'active'});
  const support=await User.create({name:'Support',phone:'+919000001006',role:'support',status:'active'});
  await Admin.create({userId:op._id,permissions:['delivery','orders']});
  await Admin.create({userId:support._id,permissions:['orders']});
  const opToken=jwt.sign({id:String(op._id),role:'delivery_manager'},process.env.JWT_SECRET), supportToken=jwt.sign({id:String(support._id),role:'support'},process.env.JWT_SECRET);
  const o=await workflowOrder('COURIER-1', 'packed');
  const path=`/api/admin/orders/${o._id}/shipment`;
  assert.equal((await request(path,{status:'shipped',note:'Fixture courier evidence',awbNumber:'TRACK-123',courierName:'Fixture courier'},supportToken,'PATCH')).status,403);
  assert.equal((await request(path,{status:'delivered',note:'Skip is invalid',awbNumber:'TRACK-123',courierName:'Fixture courier'},opToken,'PATCH')).status,409);
  assert.equal((await request(path,{status:'shipped',note:'Confirmed pickup',awbNumber:'TRACK-123',courierName:'Fixture courier',trackingUrl:'https://example.com/track/123'},opToken,'PATCH')).status,200);
  assert.equal((await request(path,{status:'out_for_delivery',note:'Courier scan'},opToken,'PATCH')).status,200);
  assert.equal((await request(path,{status:'delivered',note:'Courier proof of delivery'},opToken,'PATCH')).status,200);
  assert.equal((await Order.findById(o._id)).paymentStatus,'pending','a delivery status is not payment reconciliation');
  assert.equal((await request(path,{status:'shipped',note:'Old scan'},opToken,'PATCH')).status,409);
  assert.equal((await request(`/api/admin/orders/${o._id}`,{paymentStatus:'paid',note:'Not provider verified'},supportToken,'PATCH')).status,400);
});

test('store reviews require a delivered purchase, update real ratings, support owner replies and audited moderation',async()=>{
  const Review=require('../src/models/Review');
  async function assertPublicRating(average, count) {
    for (const route of ['/api/customer/catalog', `/api/sellers/public/${seller._id}/profile`]) {
      const response = await request(route, null, '');
      assert.equal(response.status, 200);
      const product = response.body.products.find(p => String(p.id) === String(items[0]._id));
      assert.equal(product.ratingAverage, average);
      assert.equal(product.ratingCount, count);
      assert.equal(product.sellerName, seller.businessName);
    }
  }
  await Product.updateOne({_id:items[0]._id}, {$set:{ratingAverage:4.8,ratingCount:99,sellerName:'Outdated store name'}});
  await assertPublicRating(0, 0);
  const o=await workflowOrder('REVIEW-1', 'delivered');
  const path=`/api/orders/${o._id}/review`;
  const input={productId:String(items[0]._id),rating:4,title:'Useful product',body:'Delivered in good condition.'};
  const other=await User.create({role:'customer',name:'Another Customer',phone:'+919000001007',status:'active'});
  const otherToken=jwt.sign({id:String(other._id),role:'customer'},process.env.JWT_SECRET);
  assert.equal((await request(path,input,otherToken,'PUT')).status,403);
  assert.equal((await request(path,{...input,productId:String(items[1]._id)},token,'PUT')).status,403);
  assert.equal((await request(path,{...input,rating:4.7},token,'PUT')).status,400);
  assert.equal((await request(path,input,token,'PUT')).status,200);
  assert.equal((await request(path,{...input,rating:5},token,'PUT')).status,200);
  assert.equal(await Review.countDocuments({customerId:customer._id,productId:items[0]._id}),1);
  assert.equal((await Product.findById(items[0]._id)).ratingAverage,5);
  await assertPublicRating(5, 1);
  const review=await Review.findOne({customerId:customer._id,productId:items[0]._id});
  const sellerToken=jwt.sign({id:String(seller.userId),role:'seller'},process.env.JWT_SECRET);
  assert.equal((await request(`/api/sellers/me/reviews/${review._id}/reply`,{reply:'Thank you for your feedback.'},sellerToken,'PUT')).status,200);
  const pub=await request(`/api/sellers/public/${seller._id}/customer-reviews`,null,'');
  assert.equal(pub.body.reviews.reviewCount,1);assert.equal(pub.body.reviews.items[0].verifiedPurchase,true);
  assert.equal(pub.body.reviews.items[0].customerId,undefined);assert.equal(pub.body.reviews.items[0].orderId,undefined);
  const root=await User.create({role:'superadmin',name:'Root',phone:'+919000001008',status:'active'});
  const rootToken=jwt.sign({id:String(root._id),role:'superadmin'},process.env.JWT_SECRET);
  assert.equal((await request(`/api/admin/reviews/${review._id}`,{status:'hidden',reason:'Fixture moderation'},sellerToken,'PATCH')).status,403);
  assert.equal((await request(`/api/admin/reviews/${review._id}`,{status:'hidden',reason:'Fixture moderation'},rootToken,'PATCH')).status,200);
  assert.equal((await Product.findById(items[0]._id)).ratingCount,0);
  await assertPublicRating(0, 0);
  assert.equal((await request(path,input,token,'PUT')).status,409,'editing must not bypass moderation');
  assert.equal((await request(`/api/admin/reviews/${review._id}`,{status:'published',reason:'Restored after review'},rootToken,'PATCH')).status,200);
  assert.equal((await Product.findById(items[0]._id)).ratingCount,1);
  assert.equal((await request(`/api/admin/products/${items[0]._id}`,{ratingAverage:1,ratingCount:200},rootToken,'PATCH')).status,400);
  const profile=await request(`/api/sellers/public/${seller._id}/profile`,null,'');
  assert.equal(profile.body.seller.ratingAverage,5);
  assert.ok(profile.body.bestSellers.some(p=>String(p.id)===String(items[0]._id)&&p.soldUnits>=2));
  assert.equal(profile.body.seller.panNumber,undefined);
});

test('store profile edits validate public links and cannot change seller approval or other sellers',async()=>{
  const sellerToken=jwt.sign({id:String(seller.userId),role:'seller'},process.env.JWT_SECRET);
  assert.equal((await request('/api/sellers/me/store',{storeDetails:{instagramUrl:'javascript:alert(1)'}},sellerToken,'PUT')).status,400);
  assert.equal((await request('/api/sellers/me/store',{storeDetails:{instagramUrl:'https://example.com/pretend-instagram'}},sellerToken,'PUT')).status,400);
  const saved=await request('/api/sellers/me/store',{status:'blocked',storeDetails:{tagline:'Made with care',about:'Our real store story.',instagramUrl:'https://www.instagram.com/axzen/',status:'blocked'}},sellerToken,'PUT');
  assert.equal(saved.status,200);assert.equal(saved.body.seller.status,'active');
  assert.equal(saved.body.seller.storeDetails.tagline,'Made with care');
  await Seller.updateOne({_id:seller._id},{kycStatus:'pending'});
  assert.equal((await request(`/api/sellers/public/${seller._id}/profile`,null,'')).status,404);
  await Seller.updateOne({_id:seller._id},{kycStatus:'approved'});
});
test('staff creation uses an OTP phone without passwords and remains superadmin-only', async () => {
  const root = await User.create({ role: 'superadmin', name: 'Staff Owner', phone: '+919000003001', status: 'active' });
  const rootToken = jwt.sign({ id: String(root._id), role: 'superadmin' }, process.env.JWT_SECRET);
  const input = { name: 'Operations', phone: '+91 90000 03002', displayRole: 'Operations Manager' };
  assert.equal((await request('/api/admin/employees', input, token)).status, 403);
  assert.equal((await request('/api/admin/employees', { ...input, phone: '9000003002' }, rootToken)).status, 400);
  const result = await request('/api/admin/employees', input, rootToken);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.employee.phone, '+919000003002');
  assert.equal(result.body.employee.passwordHash, undefined);
  assert.equal(result.body.employee.role, 'admin');
  assert.equal((await User.findById(result.body.employee._id).select('+passwordHash')).passwordHash, '');
});

test('admin creates stores with OTP/password access without granting public or staff access', async () => {
  const admin = await User.create({role:'admin',name:'Store Admin',phone:'+919000001020',status:'active'});
  const adminToken = jwt.sign({id:String(admin._id),role:'admin'},process.env.JWT_SECRET);
  const input = {businessName:'Admin-created Store',fullName:'Store Owner',phone:'9999999999',access:'password',password:'Fixture-Store-2026'};
  assert.equal((await request('/api/admin/sellers',input,token)).status,403);
  const finance = await User.create({role:'finance',phone:'+919000001021',status:'active'});
  const financeToken = jwt.sign({id:String(finance._id),role:'finance'},process.env.JWT_SECRET);
  assert.equal((await request('/api/admin/sellers',input,financeToken)).status,403);
  assert.equal((await request('/api/admin/sellers',{...input,password:'short'},adminToken)).status,400);
  const created = await request('/api/admin/sellers',{...input,role:'superadmin',isActive:true,approvalStatus:'approved'},adminToken);
  assert.equal(created.status,201);
  assert.equal(created.body.seller.isActive,false);
  assert.equal(created.body.seller.kycStatus,'pending');
  assert.equal(created.body.seller.approvalStatus,'pending');
  assert.equal(created.body.seller.agreements.marketplaceTerms,false);
  const owner = await User.findById(created.body.seller.userId).select('+passwordHash');
  assert.equal(owner.role,'seller'); assert.equal(owner.phone,'+919999999999');
  assert.match(owner.passwordHash,/^scrypt-v1\$/);
  assert.equal(JSON.stringify(created.body).includes('Fixture-Store-2026'),false);
  assert.equal((await request('/api/admin/sellers',input,adminToken)).status,409);
  assert.equal(await Seller.countDocuments({phone:owner.phone}),1);
  const audit = await require('../src/models/AuditLog').findOne({action:'seller.create',entityId:created.body.seller._id}).lean();
  assert.equal(JSON.stringify(audit).includes('Fixture-Store-2026'),false);
  const path='/api/auth/seller-password-login';
  const login = await request(path,{phone:input.phone,password:input.password},'');
  assert.equal(login.status,200); assert.equal(login.body.user.role,'seller');
  assert.equal(login.body.user.passwordHash,undefined);
  assert.equal(login.body.user.seller.approvalStatus,'pending');
  assert.equal((await request('/api/admin/sellers',null,login.body.token)).status,403);
  assert.equal((await request(path,{phone:input.phone,password:input.password,role:'superadmin'},'')).status,401);
  for (let n=0;n<5;n++) assert.equal((await request(path,{phone:input.phone,password:'wrong-password'},'')).status,401);
  assert.equal((await request(path,{phone:input.phone,password:input.password},'')).status,401);
  assert.equal((await request('/api/auth/seller-password',{password:'Changed-Store-2026',currentPassword:'wrong'},login.body.token,'PUT')).status,403);
  const otp = await request('/api/auth/phone-login',{role:'seller',firebaseToken:'local-test-store-owner'},'');
  assert.equal(otp.status,200); assert.equal(String(otp.body.user.id),String(owner._id));
  const reset = await request('/api/auth/seller-password',{password:'Changed-Store-2026'},otp.body.token,'PUT');
  assert.equal(reset.status,200);
  assert.equal((await request('/api/sellers/me',null,login.body.token)).status,401);
  assert.equal((await request('/api/sellers/me',null,reset.body.token)).status,200);
  assert.equal((await request(path,{phone:input.phone,password:'Changed-Store-2026'},'')).status,200);
  await User.updateOne({_id:owner._id},{status:'blocked'});
  assert.equal((await request(path,{phone:input.phone,password:'Changed-Store-2026'},'')).status,401);
  const otpOnly = await request('/api/admin/sellers',{businessName:'OTP Store',fullName:'OTP Owner',phone:'+919000001022',access:'otp'},adminToken);
  assert.equal(otpOnly.status,201);
  assert.equal((await User.findById(otpOnly.body.seller.userId).select('+passwordHash')).passwordHash,'');
  assert.equal((await request(path,{phone:'+919000001022',password:'Anything-2026'},'')).status,401);
});

test('superadmin creates no-login stores and controls store and product catalogue fields', async () => {
  const root = await User.create({ role: 'superadmin', name: 'Catalogue Owner', phone: '+919000003101', status: 'active' });
  const rootToken = jwt.sign({ id: String(root._id), role: 'superadmin' }, process.env.JWT_SECRET);
  const first = await request('/api/admin/sellers', { access: 'none' }, rootToken);
  const second = await request('/api/admin/sellers', { access: 'none', businessName: '', phone: '+919000003109' }, rootToken);
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.match(first.body.seller.businessName, /^New store /);
  const noLoginOwner = await User.findById(first.body.seller.userId).lean();
  assert.match(noLoginOwner.phone, /^disabled:[a-f0-9]{24}$/);
  const contactOnlyOwner = await User.findById(second.body.seller.userId).lean();
  assert.match(contactOnlyOwner.phone, /^disabled:[a-f0-9]{24}$/);
  assert.equal(second.body.seller.phone, '+919000003109');
  const ordinaryAdmin = await User.create({ role: 'admin', name: 'Ordinary Admin', phone: '+919000003102', status: 'active' });
  const ordinaryToken = jwt.sign({ id: String(ordinaryAdmin._id), role: 'admin' }, process.env.JWT_SECRET);
  assert.equal((await request('/api/admin/sellers', { access: 'none' }, ordinaryToken)).status, 403);

  const storeEdit = await request(`/api/admin/sellers/${first.body.seller._id}`, {
    businessName: 'Owner Controlled Store', phone: '', storeDetails: { profileImageUrl: '', offerBannerUrl: '' },
  }, rootToken, 'PATCH');
  assert.equal(storeEdit.status, 200, JSON.stringify(storeEdit.body));
  assert.equal(storeEdit.body.seller.businessName, 'Owner Controlled Store');

  const productEdit = await request(`/api/admin/products/${items[0]._id}`, {
    title: '', pricePaise: '', mrpPaise: 15900, stock: '', images: ['https://images.example.com/item.png'],
  }, rootToken, 'PATCH');
  assert.equal(productEdit.status, 200, JSON.stringify(productEdit.body));
  assert.equal(productEdit.body.product.title, 'Untitled product');
  assert.equal(productEdit.body.product.pricePaise, 0);
  assert.equal(productEdit.body.product.stock, 0);
  assert.deepEqual(productEdit.body.product.images, ['https://images.example.com/item.png']);
  assert.equal((await request(`/api/admin/products/${items[1]._id}`, { pricePaise: 10 }, ordinaryToken, 'PATCH')).status, 403);
});
