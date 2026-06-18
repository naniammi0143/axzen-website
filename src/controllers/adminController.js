const AuditLog = require("../models/AuditLog");
const AdminUser = require("../models/AdminUser");
const Delivery = require("../models/Delivery");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Settlement = require("../models/Settlement");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { formatRupees } = require("../utils/money");

const orderStatuses = ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"];
const productStatuses = ["pending_approval", "approved", "active", "rejected", "blocked", "inactive"];

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function asMoney(paise = 0) {
  return {
    paise,
    formatted: formatRupees(paise),
  };
}

function cleanInt(value, fallback = 20, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function textRegex(value) {
  if (!value) return null;
  return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

async function audit(req, action, entityType, entityId, metadata = {}) {
  await AuditLog.create({
    actorId: req.user?.id || null,
    actorRole: req.user?.role || "",
    action,
    entityType,
    entityId: String(entityId || ""),
    message: `${action} ${entityType}`,
    metadata,
    ip: req.ip || "",
  });
}

async function paged(Model, filter, query, sort = { createdAt: -1 }, populate = null) {
  const page = cleanInt(query.page, 1, 5000);
  const limit = cleanInt(query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const find = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) find.populate(populate);
  const [items, total] = await Promise.all([find.lean(), Model.countDocuments(filter)]);
  return { items, page, limit, total, totalPages: Math.ceil(total / limit) || 1 };
}

async function revenueSum(filter = {}) {
  const rows = await Order.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: "$finance.totalPaise" } } },
  ]);
  return rows[0]?.total || 0;
}

const adminOverview = asyncHandler(async (req, res) => {
  const today = startOfToday();
  const month = startOfMonth();
  const [
    totalOrders,
    todayOrders,
    pendingOrders,
    deliveredOrders,
    totalRevenue,
    todayRevenue,
    monthlyRevenue,
    activeSellers,
    pendingSellers,
    totalCustomers,
    lowStockProducts,
    recentOrders,
    salesSeries,
    categoryRows,
  ] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.countDocuments({ status: { $in: ["pending", "placed"] } }),
    Order.countDocuments({ status: "delivered" }),
    revenueSum({ paymentStatus: "paid" }),
    revenueSum({ paymentStatus: "paid", createdAt: { $gte: today } }),
    revenueSum({ paymentStatus: "paid", createdAt: { $gte: month } }),
    Seller.countDocuments({ status: "active", kycStatus: "approved" }),
    Seller.countDocuments({ kycStatus: "pending" }),
    User.countDocuments({ role: "customer" }),
    Product.find({ stock: { $lte: 5 }, status: { $in: ["active", "approved"] } }).sort({ stock: 1 }).limit(8).lean(),
    Order.find().sort({ createdAt: -1 }).limit(8).populate("customerId", "name phone").lean(),
    Order.aggregate([
      { $match: { createdAt: { $gte: month } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
          revenuePaise: { $sum: "$finance.totalPaise" },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Product.aggregate([{ $group: { _id: "$category", products: { $sum: 1 } } }, { $sort: { products: -1 } }, { $limit: 6 }]),
  ]);

  success(res, {
    stats: {
      totalOrders,
      todayOrders,
      pendingOrders,
      deliveredOrders,
      totalRevenue: asMoney(totalRevenue),
      todayRevenue: asMoney(todayRevenue),
      monthlyRevenue: asMoney(monthlyRevenue),
      activeSellers,
      pendingSellers,
      totalCustomers,
      lowStockCount: lowStockProducts.length,
    },
    recentOrders,
    lowStockProducts,
    charts: {
      sales: salesSeries,
      topCategories: categoryRows.map((row) => ({ category: row._id || "General", products: row.products })),
    },
  });
});

const listSellers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.kycStatus) filter.kycStatus = req.query.kycStatus;
  const search = textRegex(req.query.search);
  if (search) filter.$or = [{ businessName: search }, { phone: search }, { city: search }];
  success(res, await paged(Seller, filter, req.query));
});

const updateSeller = asyncHandler(async (req, res) => {
  const allowed = ["kycStatus", "bankStatus", "payoutStatus", "status", "commissionBps", "storeDetails", "bankDetails", "pickupAddress"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const seller = await Seller.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await audit(req, "seller.update", "seller", req.params.id, update);
  success(res, { seller });
});

const approveSeller = asyncHandler(async (req, res) => {
  req.body.kycStatus = "approved";
  req.body.status = "active";
  return updateSeller(req, res);
});

const rejectSeller = asyncHandler(async (req, res) => {
  req.body.kycStatus = "rejected";
  req.body.status = "inactive";
  return updateSeller(req, res);
});

const listProducts = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  const search = textRegex(req.query.search);
  if (search) filter.$or = [{ title: search }, { sku: search }, { sellerName: search }];
  success(res, await paged(Product, filter, req.query));
});

const updateProduct = asyncHandler(async (req, res) => {
  const allowed = ["status", "category", "subcategory", "pricePaise", "discountPaise", "stock", "lowStockThreshold", "gstBps", "rejectionReason"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await audit(req, "product.update", "product", req.params.id, update);
  success(res, { product });
});

const approveProduct = asyncHandler(async (req, res) => {
  req.body.status = "approved";
  return updateProduct(req, res);
});

const rejectProduct = asyncHandler(async (req, res) => {
  req.body.status = "rejected";
  return updateProduct(req, res);
});

const listOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
  if (req.query.sellerId) filter.sellerId = req.query.sellerId;
  const search = textRegex(req.query.search);
  if (search) filter.$or = [{ orderId: search }, { sellerName: search }, { trackingId: search }];
  success(res, await paged(Order, filter, req.query, { createdAt: -1 }, "customerId sellerId"));
});

const updateOrder = asyncHandler(async (req, res) => {
  const allowed = ["status", "paymentStatus", "deliveryStatus", "trackingId", "invoiceNumber", "refundStatus", "failedDeliveryReason"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await audit(req, "order.update", "order", req.params.id, update);
  success(res, { order });
});

const listCustomers = asyncHandler(async (req, res) => {
  const filter = { role: "customer" };
  if (req.query.status) filter.status = req.query.status;
  const search = textRegex(req.query.search);
  if (search) filter.$or = [{ name: search }, { phone: search }, { email: search }];
  success(res, await paged(User, filter, req.query));
});

const updateCustomer = asyncHandler(async (req, res) => {
  const update = {};
  if (["active", "blocked", "pending"].includes(req.body.status)) update.status = req.body.status;
  const customer = await User.findOneAndUpdate({ _id: req.params.id, role: "customer" }, update, { new: true });
  await audit(req, "customer.update", "customer", req.params.id, update);
  success(res, { customer });
});

const listPayments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  success(res, await paged(Payment, filter, req.query));
});

const listSettlements = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  success(res, await paged(Settlement, filter, req.query, { createdAt: -1 }, "sellerId"));
});

const updateSettlement = asyncHandler(async (req, res) => {
  const update = {};
  if (["pending", "processing", "paid", "hold", "failed"].includes(req.body.status)) update.status = req.body.status;
  const settlement = await Settlement.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await audit(req, "settlement.update", "settlement", req.params.id, update);
  success(res, { settlement });
});

const listDeliveries = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  success(res, await paged(Delivery, filter, req.query));
});

const updateDelivery = asyncHandler(async (req, res) => {
  const allowed = ["partnerName", "trackingNumber", "pickupAddress", "deliveryPincode", "sameDayEligible", "failedReason", "status"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const delivery = await Delivery.findOneAndUpdate({ orderId: req.params.orderId }, update, {
    new: true,
    upsert: true,
    runValidators: true,
  });
  await audit(req, "delivery.update", "delivery", req.params.orderId, update);
  success(res, { delivery });
});

const listEmployees = asyncHandler(async (req, res) => {
  const roles = ["admin", "superadmin", "support", "finance", "delivery_manager"];
  const filter = { role: { $in: roles } };
  const search = textRegex(req.query.search);
  if (search) filter.$or = [{ name: search }, { phone: search }, { email: search }, { role: search }];
  success(res, await paged(User, filter, req.query));
});

const updateEmployee = asyncHandler(async (req, res) => {
  const roles = ["admin", "support", "finance", "delivery_manager"];
  const update = {};
  if (roles.includes(req.body.role)) update.role = req.body.role;
  if (["active", "blocked", "pending"].includes(req.body.status)) update.status = req.body.status;
  if (req.body.name) update.name = req.body.name;
  const employee = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await AdminUser.updateOne({ userId: req.params.id }, { $setOnInsert: { userId: req.params.id } }, { upsert: true });
  await audit(req, "employee.update", "employee", req.params.id, update);
  success(res, { employee });
});

const financeSummary = asyncHandler(async (req, res) => {
  const [settlements, capturedPayments, refunds] = await Promise.all([
    Settlement.aggregate([{ $group: { _id: "$status", amountPaise: { $sum: "$payoutPaise" }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: "captured" } }, { $group: { _id: null, amountPaise: { $sum: "$amountPaise" }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: "refunded" } }, { $group: { _id: null, amountPaise: { $sum: "$refundPaise" }, count: { $sum: 1 } } }]),
  ]);

  success(res, {
    currency: "INR",
    captured: asMoney(capturedPayments[0]?.amountPaise || 0),
    refunds: asMoney(refunds[0]?.amountPaise || 0),
    payouts: settlements.map((item) => ({
      status: item._id,
      count: item.count,
      amountPaise: item.amountPaise,
      amount: formatRupees(item.amountPaise),
    })),
  });
});

const reports = asyncHandler(async (req, res) => {
  const sellerWise = await Order.aggregate([
    { $group: { _id: "$sellerName", orders: { $sum: 1 }, revenuePaise: { $sum: "$finance.totalPaise" } } },
    { $sort: { revenuePaise: -1 } },
    { $limit: 20 },
  ]);
  const productWise = await Product.find().sort({ stock: 1 }).limit(20).select("title sku category stock pricePaise status").lean();
  const returns = await Order.countDocuments({ status: { $in: ["cancelled", "returned"] } });
  success(res, { sellerWise, productWise, returns });
});

const exportCsv = asyncHandler(async (req, res) => {
  const type = req.params.type;
  const rows =
    type === "sellers"
      ? await Seller.find().limit(500).lean()
      : type === "products"
        ? await Product.find().limit(500).lean()
        : await Order.find().limit(500).lean();
  const keys = Object.keys(rows[0] || { empty: "" }).filter((key) => !["_id", "__v"].includes(key));
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(row[key] ?? "")).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=axzen-${type}.csv`);
  res.send(csv);
});

const listAuditLogs = asyncHandler(async (req, res) => {
  success(res, await paged(AuditLog, {}, req.query));
});

module.exports = {
  adminOverview,
  approveProduct,
  approveSeller,
  exportCsv,
  financeSummary,
  listAuditLogs,
  listCustomers,
  listDeliveries,
  listEmployees,
  listOrders,
  listPayments,
  listProducts,
  listSellers,
  listSettlements,
  orderStatuses,
  productStatuses,
  rejectProduct,
  rejectSeller,
  reports,
  updateCustomer,
  updateDelivery,
  updateEmployee,
  updateOrder,
  updateProduct,
  updateSeller,
  updateSettlement,
};
