const Cart = require("../models/Cart");
const CustomerAppConfig = require("../models/CustomerAppConfig");
const Delivery = require("../models/Delivery");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Settlement = require("../models/Settlement");
const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { buildDeliveryLabelHtml } = require("../utils/deliveryLabel");
const { buildInvoiceHtml } = require("../utils/invoice");
const { calculateOrderFinance, formatRupees, getPaymentChargePercent, getSellerCommission, toPaise } = require("../utils/money");
const { createRazorpayOrder, hasRazorpayCredentials, razorpayConfig, verifyRazorpaySignature } = require("../utils/razorpay");
const { emitSellerNewOrder } = require("../utils/realtime");
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
  const sellerDeliveryCharge = financeValue(order, "sellerDeliveryCharge", "sellerDeliveryChargePaise");
  const paymentCharge = order.paymentMethod === "cod" ? 0 : savedPaymentCharge || Math.min(Math.round((productTotal * getPaymentChargePercent()) / 100), Math.max(productTotal - platformFee, 0));
  const savedPayout = savedPaymentCharge ? financeValue(order, "sellerPayout", "sellerPayoutPaise") || financeValue(order, "sellerPayout", "sellerEarningsPaise") : 0;
  const sellerPayout = Math.max(savedPayout || productTotal - platformFee - paymentCharge - sellerDeliveryCharge, 0);

  return {
    _id: order._id,
    orderId: order.orderId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    payoutStatus: order.payoutStatus,
    paymentMethod: order.paymentMethod,
    productTotal,
    customerPaid: financeValue(order, "customerPaid", "customerPaidPaise") || financeValue(order, "customerPaid", "totalPaise"),
    deliveryCharge: financeValue(order, "deliveryCharge", "deliveryChargePaise"),
    sellerDeliveryCharge,
    freeDeliveryApplied: Boolean(order.freeDeliveryApplied || order.finance?.freeDeliveryApplied),
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
  const { seller } = await getSellerOrder(req);
  const order = await require('../services/cancelOrder')({sellerId:seller._id,$or:[{orderId:req.params.id},...(mongoose.isValidObjectId(req.params.id)?[{_id:req.params.id}]:[])]},req.body.reason || 'Cancelled by seller.');
  success(res,{order:sellerOrderView(order.toObject())});
});
const cancelCustomerOrder = asyncHandler(async (req, res) => {
  const order = await require('../services/cancelOrder')({customerId:req.user.id,$or:[{orderId:req.params.id},...(mongoose.isValidObjectId(req.params.id)?[{_id:req.params.id}]:[])]},req.body.reason || 'Cancelled by customer.');
  success(res,{order});
});

const packSellerOrder = asyncHandler(async (req, res) => {
  const { seller, order } = await getSellerOrder(req);
  if (!["accepted", "confirmed", "packed"].includes(order.status)) {
    res.status(400).json({ ok: false, message: `Order cannot be packed from ${order.status}.` });
    return;
  }

  if (order.awbNumber || order.providerShipmentId) return success(res,{order:sellerOrderView(order.toObject())});
  const shipment = await createShiprocketShipment({
    order,
    seller,
    customerAddress: order.shippingAddress || {},
  });

  order.status = "packed";
  order.deliveryStatus = shipment.shipmentStatus;
  order.shipmentStatus = shipment.shipmentStatus;
  order.providerShipmentId = shipment.shipmentId;
  order.awbNumber = shipment.awbNumber || "";
  order.courierName = shipment.courierName || "";
  order.trackingUrl = shipment.trackingUrl || "";
  order.pickupAgentName = shipment.pickupAgentName || "";
  order.pickupAgentPhone = shipment.pickupAgentPhone || "";
  pushTimeline(order, "packed", shipment.awbNumber ? "Order packed. Waiting for courier pickup." : "Order packed. Courier assignment pending.");
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
      status: shipment.shipmentStatus,
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

  if (order.awbNumber || order.providerShipmentId) return success(res,{order:sellerOrderView(order.toObject())});
  const shipment = await createShiprocketShipment({
    order,
    seller,
    customerAddress: order.shippingAddress || {},
  });

  order.status = "packed";
  order.deliveryStatus = shipment.shipmentStatus;
  order.shipmentStatus = shipment.shipmentStatus;
  order.providerShipmentId = shipment.shipmentId;
  order.awbNumber = shipment.awbNumber || "";
  order.courierName = shipment.courierName || "";
  order.trackingUrl = shipment.trackingUrl || "";
  pushTimeline(order, "packed", "Shipment registered. Courier assignment and pickup pending.");
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
      status: shipment.shipmentStatus,
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
  if (["new", "pickup_scheduled", "waiting_for_pickup"].includes(normalized)) return { orderStatus: "packed", deliveryStatus: "waiting_for_pickup" };
  return null;
}

async function applyShipmentStatus(order, status, reason = "") {
  const next = normalizeShipmentStatus(status);
  if (!next || ["cancelled","returned"].includes(order.status) || (order.status === "delivered" && next.orderStatus !== "returned")) return order;
  const progression = ["placed", "pending", "accepted", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
  if (next.orderStatus !== "returned" && progression.indexOf(next.orderStatus) < progression.indexOf(order.status)) return order;
  if (next.orderStatus === order.status && next.deliveryStatus === order.deliveryStatus) return order;
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
    order.refundDueDate = null;
    order.payoutStatus = "failed";
    await Settlement.updateMany({orderId:order.orderId},{$set:{status:"failed",payoutPaise:0}});
  }
  pushTimeline(order, next.deliveryStatus, reason || `Shipment status updated to ${next.deliveryStatus}.`);
  await order.save();
  await Delivery.findOneAndUpdate({ orderId: order.orderId }, { status: next.deliveryStatus }, { upsert: false });
  return order;
}

const syncSellerShipmentStatus = asyncHandler(async (req, res) => {
  const { order } = await getSellerOrder(req);
  return res.status(409).json({ok:false,message:"Shipment status is updated by the courier. Contact support if tracking is delayed."});
});

const shiprocketStatusWebhook = asyncHandler(async (req, res) => {
  const webhookSecret = process.env.SHIPROCKET_WEBHOOK_SECRET || "";
  if (!webhookSecret) return res.status(503).json({ok:false,message:"Shipment webhook is not configured."});
  if (webhookSecret) {
    const providedSecret = req.headers["x-shiprocket-secret"] || req.headers["x-webhook-secret"] || req.body.secret;
    if (providedSecret !== webhookSecret) {
      res.status(401).json({ ok: false, message: "Invalid shipment webhook secret." });
      return;
    }
  }
  const orderId = req.body.order_id || req.body.orderId;
  const awb = req.body.awb || req.body.awb_code || req.body.awbNumber;
  if ((orderId && typeof orderId !== "string") || (awb && typeof awb !== "string") || (!orderId && !awb)) return res.status(400).json({ok:false,message:"A valid order ID or AWB is required."});
  if (typeof (req.body.current_status || req.body.status) !== "string") return res.status(400).json({ok:false,message:"Shipment status is required."});
  const order = await Order.findOne({
    $or: [orderId ? { orderId } : null, awb ? { awbNumber: awb } : null].filter(Boolean),
  });
  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found for shipment update." });
    return;
  }
  const updated = await applyShipmentStatus(order, req.body.current_status || req.body.status, typeof req.body.reason === "string" ? req.body.reason.slice(0,500) : "");
  success(res, { order: sellerOrderView(updated.toObject()) });
});

const { createOrder, createRazorpayCheckoutOrder, verifyRazorpayPayment } = require("./checkoutController");

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
  cancelCustomerOrder,
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
