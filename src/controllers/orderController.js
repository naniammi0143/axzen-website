const Cart = require("../models/Cart");
const Delivery = require("../models/Delivery");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Seller = require("../models/Seller");
const Settlement = require("../models/Settlement");
const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { buildDeliveryLabelHtml } = require("../utils/deliveryLabel");
const { buildInvoiceHtml } = require("../utils/invoice");
const { calculateOrderFinance, formatRupees, getPaymentChargePercent, getSellerCommission, toPaise } = require("../utils/money");
const { createRazorpayOrder, razorpayConfig, verifyRazorpaySignature } = require("../utils/razorpay");

const adminRoles = ["admin", "superadmin", "support", "finance", "delivery_manager"];

async function canAccessOrder(req, order) {
  if (adminRoles.includes(req.user.role)) return true;
  if (req.user.role === "customer") return String(order.customerId?._id || order.customerId) === String(req.user.id);
  return false;
}

async function canAccessSellerOrder(req, order) {
  if (adminRoles.includes(req.user.role)) return true;
  if (req.user.role !== "seller") return false;
  const seller = await Seller.findOne({ userId: req.user.id }).select("_id");
  return seller && String(order.sellerId?._id || order.sellerId) === String(seller._id);
}

function financeValue(order, field, legacyField = null) {
  if (Number.isFinite(Number(order[field]))) return Number(order[field]);
  if (legacyField && Number.isFinite(Number(order.finance?.[legacyField]))) return Number(order.finance[legacyField]);
  return 0;
}

function sellerOrderView(order) {
  const productTotal = financeValue(order, "productTotal", "productTotalPaise") || financeValue(order, "productTotal", "subtotalPaise");
  const platformFee = financeValue(order, "commissionAmount", "commissionAmountPaise") || financeValue(order, "commissionAmount", "commissionPaise");
  const savedPaymentCharge = financeValue(order, "paymentCharge", "paymentChargePaise") || financeValue(order, "paymentCharge", "onlinePaymentChargePaise");
  const paymentCharge = savedPaymentCharge || Math.min(Math.round((productTotal * getPaymentChargePercent()) / 100), Math.max(productTotal - platformFee, 0));
  const savedPayout = savedPaymentCharge ? financeValue(order, "sellerPayout", "sellerPayoutPaise") || financeValue(order, "sellerPayout", "sellerEarningsPaise") : 0;
  const sellerPayout = Math.max(savedPayout || productTotal - platformFee - paymentCharge, 0);

  return {
    _id: order._id,
    orderId: order.orderId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    payoutStatus: order.payoutStatus,
    paymentMethod: order.paymentMethod,
    productTotal,
    platformFee,
    paymentCharge,
    sellerPayout,
    items: order.items,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

const listCustomerOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ customerId: req.user.id }).sort({ createdAt: -1 });
  success(res, { orders });
});

const listSellerOrders = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  const orders = seller ? await Order.find({ sellerId: seller._id }).sort({ createdAt: -1 }).lean() : [];
  success(res, { orders: orders.map(sellerOrderView) });
});

async function buildOrderFinanceFromRequest(req) {
  const cart = await Cart.findOne({ customerId: req.user.id });
  const items = Array.isArray(req.body.items) && req.body.items.length ? req.body.items : cart?.items || [];

  if (!items.length) {
    return { error: "Cart is empty." };
  }

  const seller = await Seller.findById(items[0].sellerId);
  if (!seller) {
    return { error: "Seller not found for this order." };
  }

  const deliveryCharge = toPaise(req.body.deliveryCharge ?? req.body.deliveryFee ?? 40);
  const finance = calculateOrderFinance(items, getSellerCommission(seller), deliveryCharge);
  return { cart, items, seller, finance };
}

const createRazorpayCheckoutOrder = asyncHandler(async (req, res) => {
  const context = await buildOrderFinanceFromRequest(req);
  if (context.error) {
    res.status(400).json({ ok: false, message: context.error });
    return;
  }

  if (!context.seller.onlinePaymentEnabled) {
    res.status(400).json({ ok: false, message: "Online payment is disabled for this seller." });
    return;
  }

  const receipt = `AXZ-RZP-${Date.now()}`;
  const razorpayOrder = await createRazorpayOrder({
    amountPaise: context.finance.customerPaidPaise,
    receipt,
    notes: {
      sellerId: String(context.seller._id),
      customerId: String(req.user.id),
    },
  });

  success(res, {
    keyId: razorpayConfig().keyId,
    razorpayOrder,
    amountPaise: context.finance.customerPaidPaise,
    amount: formatRupees(context.finance.customerPaidPaise),
  });
});

const createOrder = asyncHandler(async (req, res) => {
  const context = await buildOrderFinanceFromRequest(req);
  if (context.error) {
    res.status(400).json({ ok: false, message: context.error });
    return;
  }

  const { items, seller, finance } = context;
  const orderId = `AXZ-${Date.now()}`;
  const invoiceNumber = `INV-${orderId}`;
  const paymentMethod = ["cod", "razorpay", "online"].includes(req.body.paymentMethod) ? req.body.paymentMethod : "cod";

  if (paymentMethod === "cod" && !seller.codEnabled) {
    res.status(400).json({ ok: false, message: "Cash on Delivery is disabled for this seller." });
    return;
  }

  if (paymentMethod !== "cod" && !seller.onlinePaymentEnabled) {
    res.status(400).json({ ok: false, message: "Online payment is disabled for this seller." });
    return;
  }

  const isOnlinePaid =
    paymentMethod !== "cod" &&
    req.body.razorpayOrderId &&
    req.body.razorpayPaymentId &&
    req.body.razorpaySignature &&
    verifyRazorpaySignature({
      razorpayOrderId: req.body.razorpayOrderId,
      razorpayPaymentId: req.body.razorpayPaymentId,
      razorpaySignature: req.body.razorpaySignature,
    });
  const transactionId = req.body.razorpayPaymentId || req.body.transactionId || (paymentMethod === "cod" ? `COD-${orderId}` : `PAY-${orderId}`);
  const order = await Order.create({
    orderId,
    customerId: req.user.id,
    sellerId: seller?._id || items[0].sellerId,
    sellerName: seller?.businessName || "Seller",
    items,
    status: "placed",
    paymentStatus: paymentMethod === "cod" ? "pending" : isOnlinePaid ? "paid" : "pending",
    payoutStatus: "pending",
    productTotal: finance.productTotalPaise,
    deliveryCharge: finance.deliveryChargePaise,
    customerPaid: finance.customerPaidPaise,
    commissionType: finance.commissionType,
    commissionValue: finance.commissionValue,
    commissionAmount: finance.commissionAmountPaise,
    paymentCharge: finance.paymentChargePaise,
    paymentChargePercent: finance.paymentChargePercent,
    sellerPayout: finance.sellerPayoutPaise,
    transactionId,
    paymentMethod,
    invoiceNumber,
    invoiceDate: new Date(),
    deliveryStatus: "created",
    finance,
    shippingAddress: req.body.shippingAddress || null,
  });

  await Payment.create({
    orderId,
    customerId: req.user.id,
    amountPaise: finance.customerPaidPaise,
    status: order.paymentStatus === "paid" ? "captured" : "created",
    provider: paymentMethod === "cod" ? "cod" : "razorpay",
    transactionId,
    paymentMethod,
  });
  await Settlement.create({
    orderId,
    sellerId: order.sellerId,
    grossPaise: finance.productTotalPaise,
    deliveryChargePaise: finance.deliveryChargePaise,
    commissionPaise: finance.commissionAmountPaise,
    paymentChargePaise: finance.paymentChargePaise,
    payoutPaise: finance.sellerPayoutPaise,
    status: "pending",
  });
  await Delivery.create({ orderId, status: "created" });
  await Cart.deleteOne({ customerId: req.user.id });

  success(
    res,
    {
      order: {
        orderId,
        invoiceNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        totalPaise: finance.customerPaidPaise,
        total: formatRupees(finance.customerPaidPaise),
        sellerPayout: formatRupees(finance.sellerPayoutPaise),
        platformCommission: formatRupees(finance.commissionAmountPaise),
      },
    },
    201
  );
});

const verifyRazorpayPayment = asyncHandler(async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    res.status(400).json({ ok: false, message: "Razorpay verification details are required." });
    return;
  }

  if (!verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature })) {
    res.status(400).json({ ok: false, message: "Razorpay payment signature is invalid." });
    return;
  }

  const order = await Order.findOneAndUpdate(
    { orderId, customerId: req.user.id },
    {
      paymentStatus: "paid",
      paymentMethod: "razorpay",
      transactionId: razorpayPaymentId,
    },
    { new: true }
  );

  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found for payment verification." });
    return;
  }

  await Payment.updateMany(
    { orderId },
    {
      status: "captured",
      provider: "razorpay",
      transactionId: razorpayPaymentId,
      paymentMethod: "razorpay",
    }
  );

  success(res, { orderId, paymentStatus: order.paymentStatus, transactionId: razorpayPaymentId });
});

const getOrderInvoice = asyncHandler(async (req, res) => {
  const lookup = [{ orderId: req.params.id }];
  if (mongoose.Types.ObjectId.isValid(req.params.id)) lookup.push({ _id: req.params.id });
  const order = await Order.findOne({ $or: lookup })
    .populate("customerId", "name email phone")
    .populate("sellerId")
    .lean();

  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found." });
    return;
  }

  if (!(await canAccessOrder(req, order))) {
    res.status(403).json({ ok: false, message: "You do not have permission to view this invoice." });
    return;
  }

  const invoiceNumber = order.invoiceNumber || `INV-${order.orderId}`;
  const invoiceDate = order.invoiceDate || order.createdAt || new Date();
  if (!order.invoiceNumber || !order.invoiceDate) {
    await Order.updateOne({ _id: order._id }, { invoiceNumber, invoiceDate });
    order.invoiceNumber = invoiceNumber;
    order.invoiceDate = invoiceDate;
  }

  const invoiceHtml = buildInvoiceHtml(order, { showInternalSettlement: adminRoles.includes(req.user.role) });
  success(res, { invoiceNumber, orderId: order.orderId, invoiceHtml });
});

const getDeliveryLabel = asyncHandler(async (req, res) => {
  const lookup = [{ orderId: req.params.id }];
  if (mongoose.Types.ObjectId.isValid(req.params.id)) lookup.push({ _id: req.params.id });
  const order = await Order.findOne({ $or: lookup })
    .populate("customerId", "name email phone")
    .populate("sellerId")
    .lean();

  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found." });
    return;
  }

  if (!(await canAccessSellerOrder(req, order))) {
    res.status(403).json({ ok: false, message: "You do not have permission to print this delivery label." });
    return;
  }

  success(res, { orderId: order.orderId, labelHtml: buildDeliveryLabelHtml(order) });
});

module.exports = {
  createOrder,
  createRazorpayCheckoutOrder,
  getDeliveryLabel,
  getOrderInvoice,
  listCustomerOrders,
  listSellerOrders,
  verifyRazorpayPayment,
};
