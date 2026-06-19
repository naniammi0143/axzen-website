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
const { createRazorpayOrder, hasRazorpayCredentials, razorpayConfig, verifyRazorpaySignature } = require("../utils/razorpay");
const { createShiprocketShipment } = require("../utils/shiprocket");

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
    customerPaid: financeValue(order, "customerPaid", "customerPaidPaise") || financeValue(order, "customerPaid", "totalPaise"),
    platformFee,
    paymentCharge,
    sellerPayout,
    items: order.items,
    customer: order.customerId
      ? {
          name: order.customerId.name || order.shippingAddress?.fullName || "Customer",
          phone: order.customerId.phone || order.shippingAddress?.phone || "",
          email: order.customerId.email || "",
        }
      : {
          name: order.shippingAddress?.fullName || "Customer",
          phone: order.shippingAddress?.phone || "",
          email: "",
        },
    shippingAddress: order.shippingAddress || null,
    shipmentStatus: order.shipmentStatus || order.deliveryStatus || "created",
    deliveryStatus: order.deliveryStatus || "created",
    awbNumber: order.awbNumber || "",
    courierName: order.courierName || "",
    trackingUrl: order.trackingUrl || "",
    pickupAgentName: order.pickupAgentName || "",
    pickupAgentPhone: order.pickupAgentPhone || "",
    transactionId: order.transactionId || "",
    cancelReason: order.cancelReason || "",
    returnReason: order.returnReason || "",
    refundStatus: order.refundStatus || "none",
    refundDueDate: order.refundDueDate || null,
    timeline: order.timeline || [],
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

const listCustomerOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ customerId: req.user.id }).sort({ createdAt: -1 });
  success(res, { orders });
});

async function getSellerForUser(req) {
  const seller = await Seller.findOne({ userId: req.user.id });
  if (!seller) {
    const error = new Error("Seller profile not found.");
    error.statusCode = 404;
    throw error;
  }
  return seller;
}

const listSellerOrders = asyncHandler(async (req, res) => {
  const seller = await getSellerForUser(req);
  const autoAcceptBefore = new Date(Date.now() - 5 * 60 * 1000);
  await Order.updateMany(
    { sellerId: seller._id, status: { $in: ["placed", "pending"] }, createdAt: { $lte: autoAcceptBefore } },
    {
      status: "accepted",
      $push: {
        timeline: {
          status: "accepted",
          note: "Automatically accepted after 5 minutes.",
          at: new Date(),
        },
      },
    }
  );
  const orders = await Order.find({ sellerId: seller._id }).populate("customerId", "name phone email").sort({ createdAt: -1 }).lean();
  success(res, { orders: orders.map(sellerOrderView) });
});

async function getSellerOrder(req) {
  const seller = await getSellerForUser(req);
  const order = await Order.findOne({
    sellerId: seller._id,
    $or: [mongoose.Types.ObjectId.isValid(req.params.id) ? { _id: req.params.id } : null, { orderId: req.params.id }].filter(Boolean),
  }).populate("customerId", "name phone email");

  if (!order) {
    const error = new Error("Seller order not found.");
    error.statusCode = 404;
    throw error;
  }

  return { seller, order };
}

function pushTimeline(order, status, note) {
  order.timeline = [
    ...(Array.isArray(order.timeline) ? order.timeline : []),
    {
      status,
      note,
      at: new Date(),
    },
  ];
}

async function updateSellerOrderStatus(req, res, nextStatus, options = {}) {
  const { order } = await getSellerOrder(req);
  const allowed = options.allowed || [];
  if (allowed.length && !allowed.includes(order.status)) {
    res.status(400).json({ ok: false, message: `Order cannot move from ${order.status} to ${nextStatus}.` });
    return;
  }

  order.status = nextStatus;
  if (options.deliveryStatus) order.deliveryStatus = options.deliveryStatus;
  if (nextStatus === "cancelled") order.cancelReason = options.note || "Cancelled by seller.";
  if (nextStatus === "cancelled" && order.paymentStatus === "pending") order.payoutStatus = "failed";
  pushTimeline(order, nextStatus, options.note || `Seller marked order as ${nextStatus}.`);
  await order.save();
  success(res, { order: sellerOrderView(order.toObject()) });
}

const acceptSellerOrder = asyncHandler(async (req, res) => {
  await updateSellerOrderStatus(req, res, "accepted", {
    allowed: ["placed", "pending", "accepted"],
    note: "Seller accepted order.",
  });
});

const rejectSellerOrder = asyncHandler(async (req, res) => {
  await updateSellerOrderStatus(req, res, "cancelled", {
    allowed: ["placed", "pending", "accepted", "packed"],
    deliveryStatus: "cancelled",
    note: req.body.reason || "Seller rejected order.",
  });
});

const packSellerOrder = asyncHandler(async (req, res) => {
  const { seller, order } = await getSellerOrder(req);
  if (!["accepted", "confirmed", "packed"].includes(order.status)) {
    res.status(400).json({ ok: false, message: `Order cannot be packed from ${order.status}.` });
    return;
  }

  const shipment = await createShiprocketShipment({
    order,
    seller,
    customerAddress: order.shippingAddress || {},
  });

  order.status = "packed";
  order.deliveryStatus = "waiting_for_pickup";
  order.shipmentStatus = "waiting_for_pickup";
  order.awbNumber = shipment.awbNumber || "";
  order.courierName = shipment.courierName || "";
  order.trackingUrl = shipment.trackingUrl || "";
  order.pickupAgentName = shipment.pickupAgentName || "";
  order.pickupAgentPhone = shipment.pickupAgentPhone || "";
  pushTimeline(order, "waiting_for_pickup", "Order packed. Waiting for pickup agent.");
  await order.save();

  await Delivery.findOneAndUpdate(
    { orderId: order.orderId },
    {
      orderId: order.orderId,
      partnerName: shipment.courierName || "Shiprocket",
      courierName: shipment.courierName || "Shiprocket",
      trackingNumber: shipment.awbNumber || "",
      awbNumber: shipment.awbNumber || "",
      trackingUrl: shipment.trackingUrl || "",
      status: "waiting_for_pickup",
    },
    { upsert: true, new: true }
  );

  success(res, { order: sellerOrderView(order.toObject()), shipment });
});

const packAndShipSellerOrder = asyncHandler(async (req, res) => {
  const { seller, order } = await getSellerOrder(req);
  const isCodOrder = order.paymentMethod === "cod" && order.paymentStatus === "pending";
  if (order.paymentStatus !== "paid" && !isCodOrder) {
    res.status(400).json({ ok: false, message: "Packing complete requires paid online payment or seller-enabled Cash on Delivery." });
    return;
  }

  if (!["packed", "accepted", "confirmed"].includes(order.status)) {
    res.status(400).json({ ok: false, message: `Order cannot be shipped from ${order.status}.` });
    return;
  }

  const shipment = await createShiprocketShipment({
    order,
    seller,
    customerAddress: order.shippingAddress || {},
  });

  order.status = "shipped";
  order.deliveryStatus = "shipped";
  order.shipmentStatus = shipment.shipmentStatus || "shipped";
  order.awbNumber = shipment.awbNumber || "";
  order.courierName = shipment.courierName || "";
  order.trackingUrl = shipment.trackingUrl || "";
  pushTimeline(order, "shipped", "Shipment created with Shiprocket.");
  await order.save();

  await Delivery.findOneAndUpdate(
    { orderId: order.orderId },
    {
      orderId: order.orderId,
      partnerName: shipment.courierName || "Shiprocket",
      courierName: shipment.courierName || "Shiprocket",
      trackingNumber: shipment.awbNumber || "",
      awbNumber: shipment.awbNumber || "",
      trackingUrl: shipment.trackingUrl || "",
      status: "shipped",
    },
    { upsert: true, new: true }
  );

  success(res, { order: sellerOrderView(order.toObject()), shipment });
});

function normalizeShipmentStatus(status = "") {
  const normalized = String(status).toLowerCase().replace(/\s+/g, "_");
  if (["picked_up", "pickup_done", "in_transit", "shipped"].includes(normalized)) return { orderStatus: "shipped", deliveryStatus: "shipped" };
  if (["delivered", "delivery_done"].includes(normalized)) return { orderStatus: "delivered", deliveryStatus: "delivered" };
  if (["rto", "rto_delivered", "returned", "undelivered", "customer_refused"].includes(normalized)) {
    return { orderStatus: "returned", deliveryStatus: "returned" };
  }
  return { orderStatus: "packed", deliveryStatus: "waiting_for_pickup" };
}

async function applyShipmentStatus(order, status, reason = "") {
  const next = normalizeShipmentStatus(status);
  order.status = next.orderStatus;
  order.deliveryStatus = next.deliveryStatus;
  order.shipmentStatus = next.deliveryStatus;
  if (next.orderStatus === "delivered" && order.paymentMethod === "cod") {
    order.paymentStatus = "paid";
    order.payoutStatus = "pending";
  }
  if (next.orderStatus === "returned") {
    order.returnReason = reason || "Customer did not accept delivery.";
    order.refundStatus = order.paymentMethod === "cod" ? "none" : "scheduled";
    order.refundDueDate = order.paymentMethod === "cod" ? null : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (order.paymentMethod !== "cod") order.paymentStatus = "refunded";
  }
  pushTimeline(order, next.deliveryStatus, reason || `Shipment status updated to ${next.deliveryStatus}.`);
  await order.save();
  await Delivery.findOneAndUpdate({ orderId: order.orderId }, { status: next.deliveryStatus }, { upsert: false });
  return order;
}

const syncSellerShipmentStatus = asyncHandler(async (req, res) => {
  const { order } = await getSellerOrder(req);
  const updated = await applyShipmentStatus(order, req.body.status || "shipped", req.body.reason || "");
  success(res, { order: sellerOrderView(updated.toObject()) });
});

const shiprocketStatusWebhook = asyncHandler(async (req, res) => {
  const orderId = req.body.order_id || req.body.orderId;
  const awb = req.body.awb || req.body.awb_code || req.body.awbNumber;
  const order = await Order.findOne({
    $or: [orderId ? { orderId } : null, awb ? { awbNumber: awb } : null].filter(Boolean),
  });
  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found for shipment update." });
    return;
  }
  const updated = await applyShipmentStatus(order, req.body.current_status || req.body.status || "shipped", req.body.reason || "");
  success(res, { order: sellerOrderView(updated.toObject()) });
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
    mockPayment: Boolean(razorpayOrder.mock || !hasRazorpayCredentials()),
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

  const isMockOnlinePaid =
    paymentMethod !== "cod" &&
    !hasRazorpayCredentials() &&
    req.body.mockPayment === true &&
    String(req.body.razorpayPaymentId || "").startsWith("mock_pay_");
  const isOnlinePaid =
    isMockOnlinePaid ||
    (paymentMethod !== "cod" &&
      req.body.razorpayOrderId &&
      req.body.razorpayPaymentId &&
      req.body.razorpaySignature &&
      verifyRazorpaySignature({
        razorpayOrderId: req.body.razorpayOrderId,
        razorpayPaymentId: req.body.razorpayPaymentId,
        razorpaySignature: req.body.razorpaySignature,
      }));
  if (paymentMethod !== "cod" && !isOnlinePaid) {
    res.status(400).json({ ok: false, message: "Online payment was not completed. Order was not placed." });
    return;
  }
  const transactionId = req.body.razorpayPaymentId || req.body.transactionId || (paymentMethod === "cod" ? `COD-${orderId}` : `PAY-${orderId}`);
  const order = await Order.create({
    orderId,
    customerId: req.user.id,
    sellerId: seller?._id || items[0].sellerId,
    sellerName: seller?.businessName || "Seller",
    items,
    status: "placed",
    paymentStatus: paymentMethod === "cod" ? "pending" : "paid",
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
    timeline: [
      {
        status: "placed",
        note: "Order placed by customer. Waiting for seller acceptance.",
        at: new Date(),
      },
    ],
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
        statusLabel: "Order placed. Seller will accept shortly.",
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
  acceptSellerOrder,
  createOrder,
  createRazorpayCheckoutOrder,
  getDeliveryLabel,
  getOrderInvoice,
  packAndShipSellerOrder,
  packSellerOrder,
  rejectSellerOrder,
  shiprocketStatusWebhook,
  syncSellerShipmentStatus,
  listCustomerOrders,
  listSellerOrders,
  verifyRazorpayPayment,
};
