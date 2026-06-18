const Cart = require("../models/Cart");
const Delivery = require("../models/Delivery");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Seller = require("../models/Seller");
const Settlement = require("../models/Settlement");
const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { buildInvoiceHtml } = require("../utils/invoice");
const { calculateOrderFinance, formatRupees, getSellerCommission, toPaise } = require("../utils/money");

const adminRoles = ["admin", "superadmin", "support", "finance", "delivery_manager"];

async function canAccessOrder(req, order) {
  if (adminRoles.includes(req.user.role)) return true;
  if (req.user.role === "customer") return String(order.customerId?._id || order.customerId) === String(req.user.id);
  if (req.user.role === "seller") {
    const seller = await Seller.findOne({ userId: req.user.id }).select("_id");
    return seller && String(order.sellerId?._id || order.sellerId) === String(seller._id);
  }
  return false;
}

const listCustomerOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ customerId: req.user.id }).sort({ createdAt: -1 });
  success(res, { orders });
});

const listSellerOrders = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  const orders = seller ? await Order.find({ sellerId: seller._id }).sort({ createdAt: -1 }) : [];
  success(res, { orders });
});

const createOrder = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ customerId: req.user.id });
  const items = Array.isArray(req.body.items) && req.body.items.length ? req.body.items : cart?.items || [];

  if (!items.length) {
    res.status(400).json({ ok: false, message: "Cart is empty." });
    return;
  }

  const seller = await Seller.findById(items[0].sellerId);
  const commission = getSellerCommission(seller);
  const deliveryCharge = toPaise(req.body.deliveryCharge ?? req.body.deliveryFee ?? 40);
  const finance = calculateOrderFinance(items, commission, deliveryCharge);
  const orderId = `AXZ-${Date.now()}`;
  const invoiceNumber = `INV-${orderId}`;
  const transactionId = req.body.transactionId || `TXN-${Date.now()}`;
  const paymentMethod = req.body.paymentMethod || req.body.provider || "demo";
  const order = await Order.create({
    orderId,
    customerId: req.user.id,
    sellerId: seller?._id || items[0].sellerId,
    sellerName: seller?.businessName || "Seller",
    items,
    status: "placed",
    paymentStatus: "paid",
    payoutStatus: "pending",
    productTotal: finance.productTotalPaise,
    deliveryCharge: finance.deliveryChargePaise,
    customerPaid: finance.customerPaidPaise,
    commissionType: finance.commissionType,
    commissionValue: finance.commissionValue,
    commissionAmount: finance.commissionAmountPaise,
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
    status: "captured",
    provider: req.body.provider || "demo",
    transactionId,
    paymentMethod,
  });
  await Settlement.create({
    orderId,
    sellerId: order.sellerId,
    grossPaise: finance.productTotalPaise,
    deliveryChargePaise: finance.deliveryChargePaise,
    commissionPaise: finance.commissionAmountPaise,
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
        totalPaise: finance.customerPaidPaise,
        total: formatRupees(finance.customerPaidPaise),
        sellerPayout: formatRupees(finance.sellerPayoutPaise),
        platformCommission: formatRupees(finance.commissionAmountPaise),
      },
    },
    201
  );
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

  const invoiceHtml = buildInvoiceHtml(order);
  success(res, { invoiceNumber, orderId: order.orderId, invoiceHtml });
});

module.exports = {
  createOrder,
  getOrderInvoice,
  listCustomerOrders,
  listSellerOrders,
};
