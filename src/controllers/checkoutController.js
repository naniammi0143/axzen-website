const crypto = require("crypto");
const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Settlement = require("../models/Settlement");
const Delivery = require("../models/Delivery");
const CheckoutSession = require("../models/CheckoutSession");
const CustomerAppConfig = require("../models/CustomerAppConfig");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const {
  calculateOrderFinance,
  getSellerCommission,
  formatRupees,
} = require("../utils/money");
const rules = require("../utils/checkoutRules");
const gateway = require("../utils/razorpay");
const { emitSellerNewOrder } = require("../utils/realtime");

async function buildQuote(req) {
  const input = req.body.items?.length
    ? req.body.items
    : (await Cart.findOne({ customerId: req.user.id }))?.items;
  const requested = rules.normalizeItems(input);
  const products = await Product.find({
    _id: { $in: requested.map((i) => i.productId) },
    status: { $in: ["active", "approved"] },
  }).lean();
  const offers = await CustomerAppConfig.findOne({ key: "default" })
    .select("festivalOffers")
    .lean();
  const discount = rules.discounts(offers?.festivalOffers);
  const items = requested.map((item) => {
    const p = products.find((p) => String(p._id) === item.productId);
    if (
      !p ||
      !Number.isSafeInteger(p.pricePaise) ||
      p.pricePaise < 1 ||
      p.stock < item.quantity
    )
      throw rules.invalid(
        "An item is unavailable or has insufficient stock. Please review your cart.",
        409,
      );
    return {
      productId: p._id,
      sellerId: p.sellerId,
      sku: p.sku,
      title: p.title,
      image: p.images?.[0] || "",
      pricePaise: Math.round(
        (p.pricePaise * (100 - (discount.get(item.productId) || 0))) / 100,
      ),
      quantity: item.quantity,
    };
  });
  if (new Set(items.map((i) => String(i.sellerId))).size !== 1)
    throw rules.invalid(
      "Check out each store separately. Your other items will stay in the cart.",
    );
  const seller = await Seller.findById(items[0].sellerId);
  if (!rules.sellerAvailable(seller))
    throw rules.invalid("This seller is not accepting orders right now.", 409);
  const method = req.body.paymentMethod || "cod";
  if (!["cod", "online", "razorpay"].includes(method))
    throw rules.invalid("Choose a supported payment method.");
  if (method === "cod" && !seller.codEnabled)
    throw rules.invalid("Cash on Delivery is unavailable for this store.");
  if (
    method !== "cod" &&
    (!seller.onlinePaymentEnabled || !gateway.hasRazorpayCredentials())
  )
    throw rules.invalid("Online payment is unavailable for this store.", 503);
  const total = items.reduce((n, i) => n + i.pricePaise * i.quantity, 0);
  const fees = rules.deliveryFees(seller, total);
  const finance = calculateOrderFinance(
    items,
    getSellerCommission(seller),
    fees.deliveryCharge,
    fees.sellerDeliveryCharge,
    method,
  );
  finance.freeDeliveryApplied = fees.freeDeliveryApplied;
  return { items, seller, finance };
}
const quoteOrder = asyncHandler(async (req, res) => {
  const q = await buildQuote(req);
  success(res, {
    quote: {
      items: q.items,
      finance: q.finance,
      sellerId: q.seller._id,
      sellerName: q.seller.businessName,
      codEnabled: q.seller.codEnabled,
      onlinePaymentEnabled:
        q.seller.onlinePaymentEnabled && gateway.hasRazorpayCredentials(),
    },
  });
});
const createRazorpayCheckoutOrder = asyncHandler(async (req, res) => {
  const shippingAddress = rules.address(req.body.shippingAddress);
  req.body.paymentMethod = "razorpay";
  const q = await buildQuote(req);
  if (
    req.body.expectedTotalPaise !== undefined &&
    req.body.expectedTotalPaise !== q.finance.customerPaidPaise
  )
    throw rules.invalid(
      "Prices changed. Review your total before paying.",
      409,
    );
  const provider = await gateway.createRazorpayOrder({
    amountPaise: q.finance.customerPaidPaise,
    receipt: "AXZ-" + crypto.randomUUID().slice(0, 24),
    notes: { customerId: String(req.user.id), sellerId: String(q.seller._id) },
  });
  await CheckoutSession.create({
    customerId: req.user.id,
    providerOrderId: provider.id,
    items: q.items,
    sellerId: q.seller._id,
    sellerName: q.seller.businessName,
    finance: q.finance,
    shippingAddress,
  });
  success(res, {
    keyId: gateway.razorpayConfig().keyId,
    razorpayOrder: provider,
    amountPaise: q.finance.customerPaidPaise,
    amount: formatRupees(q.finance.customerPaidPaise),
    mockPayment: false,
  });
});
function orderReply(order) {
  return {
    order: {
      ...order.toObject(),
      totalPaise: order.customerPaid,
      total: formatRupees(order.customerPaid),
      statusLabel: "Order placed. Waiting for seller confirmation.",
    },
  };
}
async function finalize(req, res) {
  let q, shippingAddress, checkout, paymentId;
  const method =
    req.body.paymentMethod === "cod" || !req.body.paymentMethod
      ? "cod"
      : "razorpay";
  let checkoutKey;
  if (method === "razorpay") {
    if (
      typeof req.body.razorpayOrderId !== "string" ||
      typeof req.body.razorpayPaymentId !== "string" ||
      typeof req.body.razorpaySignature !== "string"
    )
      throw rules.invalid("Payment verification details are required.");
    checkout = await CheckoutSession.findOne({
      providerOrderId: req.body.razorpayOrderId,
      customerId: req.user.id,
    });
    if (
      !checkout ||
      !gateway.verifyRazorpaySignature({
        razorpayOrderId: checkout.providerOrderId,
        razorpayPaymentId: req.body.razorpayPaymentId,
        razorpaySignature: req.body.razorpaySignature,
      })
    )
      throw rules.invalid("Payment verification failed.", 400);
    const previous = await Order.findOne({
      checkoutKey: "razorpay:" + checkout.providerOrderId,
      customerId: req.user.id,
    });
    if (previous) return success(res, orderReply(previous));
    const paid = await gateway.fetchRazorpayPayment(req.body.razorpayPaymentId);
    if (
      paid.order_id !== checkout.providerOrderId ||
      paid.status !== "captured" ||
      paid.amount !== checkout.finance.customerPaidPaise ||
      paid.currency !== "INR"
    )
      throw rules.invalid(
        "Payment is not captured for this checkout. Please retry verification; do not pay again.",
        409,
      );
    paymentId = paid.id;
    checkoutKey = "razorpay:" + checkout.providerOrderId;
    // Retain the captured payment reference even if final stock/order creation needs manual reconciliation.
    await CheckoutSession.updateOne(
      { _id: checkout._id, state: { $ne: "completed" } },
      {
        $set: {
          paymentId,
          state: "needs_review",
          failureReason: "Payment captured; order confirmation pending.",
        },
      },
    );
    shippingAddress = checkout.shippingAddress;
    q = {
      items: checkout.items,
      finance: checkout.finance,
      seller: await Seller.findById(checkout.sellerId),
    };
  } else {
    shippingAddress = rules.address(req.body.shippingAddress);
    const key = String(
      req.headers["idempotency-key"] || req.body.idempotencyKey || "",
    );
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
      throw rules.invalid(
        "A checkout request ID is required. Refresh checkout and try again.",
      );
    checkoutKey = "cod:" + req.user.id + ":" + key;
    const previous = await Order.findOne({
      checkoutKey,
      customerId: req.user.id,
    });
    if (previous) return success(res, orderReply(previous));
    q = await buildQuote(req);
    if (
      req.body.expectedTotalPaise !== undefined &&
      req.body.expectedTotalPaise !== q.finance.customerPaidPaise
    )
      throw rules.invalid(
        "Prices changed. Review your total before placing the order.",
        409,
      );
  }
  let order;
  try {
    await mongoose.connection.transaction(async (session) => {
      const previous = await Order.findOne({ checkoutKey }).session(session);
      if (previous) {
        order = previous;
        return;
      }
      // Write the seller document too, serializing checkout with approval/block updates.
      const seller = await Seller.findOneAndUpdate(
        {
          _id: q.seller?._id,
          isActive: true,
          status: "active",
          approvalStatus: "approved",
          kycStatus: "approved",
          ...(method === "cod"
            ? { codEnabled: true }
            : { onlinePaymentEnabled: true }),
        },
        { $inc: { orderRevision: 1 } },
        { new: true, session },
      );
      if (!seller)
        throw rules.invalid("This store is no longer accepting orders.", 409);
      for (const item of q.items) {
        const updated = await Product.findOneAndUpdate(
          {
            _id: item.productId,
            sellerId: seller._id,
            stock: { $gte: item.quantity },
            status: { $in: ["active", "approved"] },
          },
          { $inc: { stock: -item.quantity } },
          { new: true, session },
        );
        if (!updated)
          throw rules.invalid(
            "Stock changed before this order could be placed.",
            409,
          );
      }
      const orderId = "AXZ-" + crypto.randomUUID();
      const f = q.finance;
      [order] = await Order.create(
        [
          {
            orderId,
            checkoutKey,
            ...(paymentId ? { razorpayPaymentId: paymentId } : {}),
            customerId: req.user.id,
            sellerId: seller._id,
            sellerName: seller.businessName,
            items: q.items,
            status: "placed",
            paymentStatus: method === "cod" ? "pending" : "paid",
            payoutStatus: "pending",
            productTotal: f.productTotalPaise,
            deliveryCharge: f.deliveryChargePaise,
            sellerDeliveryCharge: f.sellerDeliveryChargePaise,
            freeDeliveryApplied: f.freeDeliveryApplied,
            customerPaid: f.customerPaidPaise,
            commissionType: f.commissionType,
            commissionValue: f.commissionValue,
            commissionAmount: f.commissionAmountPaise,
            paymentCharge: f.paymentChargePaise,
            paymentChargePercent: f.paymentChargePercent,
            sellerPayout: f.sellerPayoutPaise,
            transactionId: paymentId || "COD-" + orderId,
            paymentMethod: method,
            invoiceNumber: "INV-" + orderId,
            invoiceDate: new Date(),
            deliveryStatus: "created",
            finance: f,
            shippingAddress,
            timeline: [
              {
                status: "placed",
                note: "Order placed. Waiting for seller confirmation.",
                at: new Date(),
              },
            ],
          },
        ],
        { session },
      );
      await Payment.create(
        [
          {
            orderId,
            customerId: req.user.id,
            amountPaise: f.customerPaidPaise,
            status: method === "cod" ? "created" : "captured",
            provider: method,
            transactionId: order.transactionId,
            paymentMethod: method,
          },
        ],
        { session },
      );
      await Settlement.create(
        [
          {
            orderId,
            sellerId: seller._id,
            grossPaise: f.productTotalPaise,
            deliveryChargePaise: f.deliveryChargePaise,
            sellerDeliveryChargePaise: f.sellerDeliveryChargePaise,
            commissionPaise: f.commissionAmountPaise,
            paymentChargePaise: f.paymentChargePaise,
            payoutPaise: f.sellerPayoutPaise,
            status: "pending",
          },
        ],
        { session },
      );
      await Delivery.create([{ orderId, status: "created" }], { session });
      await Cart.updateOne(
        { customerId: req.user.id },
        {
          $pull: {
            items: { productId: { $in: q.items.map((i) => i.productId) } },
          },
        },
        { session },
      );
      if (checkout)
        await CheckoutSession.updateOne(
          { _id: checkout._id },
          {
            $set: { orderId, state: "completed", paymentId },
            $unset: { failureReason: 1 },
          },
          { session },
        );
    });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Order.findOne({
        checkoutKey,
        customerId: req.user.id,
      });
      if (existing) return success(res, orderReply(existing));
    }
    if (checkout) {
      await CheckoutSession.updateOne(
        { _id: checkout._id, state: { $ne: "completed" } },
        { $set: { state: "needs_review", failureReason: error.message } },
      );
      throw rules.invalid(
        "Payment received, but the order needs review. Do not pay again. Open Orders to retry or contact support with payment " +
          paymentId +
          ".",
        409,
      );
    }
    throw error;
  }
  order.$session(null);
  emitSellerNewOrder(order.sellerId, order.toObject());
  success(res, orderReply(order), 201);
}
const createOrder = asyncHandler(finalize);
const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  req.body.paymentMethod = "razorpay";
  return finalize(req, res);
});
const listPaymentReviews = asyncHandler(async (req, res) => {
  const items = await CheckoutSession.find({
    customerId: req.user.id,
    state: "needs_review",
  })
    .select("providerOrderId paymentId createdAt finance")
    .lean();
  success(res, { items });
});
module.exports = {
  quoteOrder,
  createOrder,
  createRazorpayCheckoutOrder,
  verifyRazorpayPayment,
  listPaymentReviews,
  buildQuote,
};
