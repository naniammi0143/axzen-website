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

async function staffOrderAccess(req,areas) {
  if(req.user.role==='superadmin')return true;
  const profile=await require('../models/AdminUser').findOne({userId:req.user.id}).select('permissions').lean();
  if(profile)return profile.permissions.includes('*') || areas.some(a=>profile.permissions.includes(a));
  return ['admin','support','finance','delivery_manager'].includes(req.user.role);
}
async function canAccessOrder(req, order) {
  if (adminRoles.includes(req.user.role)) return staffOrderAccess(req,['orders','finance']);
  if(req.user.role==='seller')return canAccessSellerOrder(req,order);
  if (req.user.role === "customer") return String(order.customerId?._id || order.customerId) === String(req.user.id);
  return false;
}

async function canAccessSellerOrder(req, order) {
  if (adminRoles.includes(req.user.role)) return staffOrderAccess(req,["orders","delivery"]);
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
    providerShipmentId: order.providerShipmentId || "",
    shipmentBookingState: order.shipmentBookingState || "none",
    shipmentBookingError: order.shipmentBookingError || "",
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

const acceptSellerOrder = asyncHandler(async (req, res) => {
  const { seller } = await getSellerOrder(req);
  const order = await require('../services/orderWorkflow').transition({sellerId:seller._id,$or:[{orderId:req.params.id},...(mongoose.isValidObjectId(req.params.id)?[{_id:req.params.id}]:[])]},'accepted',{actor:req.user,note:'Seller accepted the order.'});
  success(res,{order:sellerOrderView(order.toObject())});
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
  const { order } = await getSellerOrder(req);
  const updated = await require('../services/orderWorkflow').transition({_id:order._id},'packed',{actor:req.user,note:'Seller checked all items and completed packing.'});
  success(res,{order:sellerOrderView(updated.toObject())});
});

const packAndShipSellerOrder = asyncHandler(async (req,res) => {
  const {seller,order} = await getSellerOrder(req);
  if (order.status !== 'packed') return res.status(409).json({ok:false,message:'Complete packing before requesting a courier.'});
  if (order.awbNumber || order.providerShipmentId) return success(res,{order:sellerOrderView(order.toObject())});
  const packageDetails = {};
  for (const field of ['length','breadth','height','weight']) {
    const value = req.body.packageDetails?.[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > (field === 'weight' ? 100 : 300)) return res.status(400).json({ok:false,message:'Enter actual parcel dimensions (cm) and weight (kg).'});
    packageDetails[field]=value;
  }
  if (!(process.env.SHIPROCKET_TOKEN || (process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD))) return res.status(503).json({ok:false,message:'Courier booking is not configured. Packing is saved. Contact delivery support to arrange pickup.'});
  if(!seller.shippingPickupLocation) return res.status(503).json({ok:false,message:'Delivery support must connect this store’s registered Shiprocket pickup location. Packing is saved.'});
  const locked=await Order.findOneAndUpdate({_id:order._id,status:'packed',shipmentBookingState:{$nin:['booking','booked','needs_review']},providerShipmentId:'',awbNumber:''},{$set:{shipmentBookingState:'booking',packageDetails}},{new:true});
  if (!locked) return res.status(409).json({ok:false,message:'Booking already started. Refresh or contact support to reconcile it before retrying.'});
  try {
    const shipment=await createShiprocketShipment({order:locked,seller,customerAddress:order.shippingAddress || {}});
    locked.providerShipmentId=shipment.shipmentId;
    locked.awbNumber=shipment.awbNumber || '';locked.courierName=shipment.courierName || '';
    locked.trackingUrl=shipment.trackingUrl || '';locked.shipmentStatus=shipment.shipmentStatus;
    locked.deliveryStatus=shipment.shipmentStatus;locked.shipmentBookingState='booked';locked.shipmentBookingError='';
    pushTimeline(locked,'packed',shipment.awbNumber ? 'Courier booking confirmed. Awaiting actual pickup.' : 'Shipment registered. Delivery operations must assign courier and pickup.');
    await mongoose.connection.transaction(async session=>{
      await locked.save({session});
      await Delivery.updateOne({orderId:locked.orderId},{$set:{courierName:locked.courierName,partnerName:locked.courierName,awbNumber:locked.awbNumber,trackingNumber:locked.awbNumber,trackingUrl:locked.trackingUrl,status:locked.deliveryStatus}},{session});
    });
    locked.$session(null);
    success(res,{order:sellerOrderView(locked.toObject())});
  } catch(error) {
    await Order.updateOne({_id:order._id,shipmentBookingState:'booking'},{$set:{shipmentBookingState:'needs_review',shipmentBookingError:'Booking could not be confirmed. Support must check the courier account before retrying.'}});
    throw error;
  }
});

function normalizeShipmentStatus(status = "") {
  const normalized = String(status).toLowerCase().replace(/\s+/g, "_");
  if (["picked_up", "pickup_done", "in_transit", "shipped"].includes(normalized)) return { orderStatus: "shipped", deliveryStatus: "shipped" };
  if (["out_for_delivery"].includes(normalized)) return {orderStatus:"out_for_delivery",deliveryStatus:"out_for_delivery"};
  if (["delivered", "delivery_done"].includes(normalized)) return { orderStatus: "delivered", deliveryStatus: "delivered" };
  if (["rto_delivered", "returned"].includes(normalized)) {
    return { orderStatus: "returned", deliveryStatus: "returned" };
  }
  if (["new", "pickup_scheduled", "waiting_for_pickup"].includes(normalized)) return { orderStatus: "packed", deliveryStatus: "waiting_for_pickup" };
  return null;
}

async function applyShipmentStatus(order, status, reason = '') {
  const next=normalizeShipmentStatus(status);if(!next)return order;
  let updated;
  await mongoose.connection.transaction(async session=>{
    updated=await Order.findById(order._id).session(session);
    if(!updated)return;
    const progression=['placed','pending','accepted','confirmed','packed','shipped','out_for_delivery','delivered'];
    if(['cancelled','returned'].includes(updated.status) || (updated.status==='delivered' && next.orderStatus!=='returned'))return;
    if(next.orderStatus!=='returned' && progression.indexOf(next.orderStatus)<progression.indexOf(updated.status))return;
    if(next.orderStatus===updated.status && next.deliveryStatus===updated.deliveryStatus)return;
    if(!updated.providerShipmentId && !updated.awbNumber)return;
    updated.status=next.orderStatus;updated.deliveryStatus=next.deliveryStatus;updated.shipmentStatus=next.deliveryStatus;
    if(next.orderStatus==='returned'){
      updated.returnReason=reason || 'Courier confirmed return.';
      if(updated.paymentStatus==='paid')updated.refundStatus='scheduled';
      updated.refundDueDate=null;updated.payoutStatus='failed';
      await Settlement.updateMany({orderId:updated.orderId},{$set:{status:'failed',payoutPaise:0}},{session});
    }
    pushTimeline(updated,next.deliveryStatus,reason || `Courier status: ${next.deliveryStatus}.`);
    await updated.save({session});
    await Delivery.updateOne({orderId:updated.orderId},{$set:{status:next.deliveryStatus}},{session});
  });
  updated?.$session(null);return updated || order;
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
