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
const { formatRupees, getPaymentChargePercent } = require("../utils/money");
const { hashPassword } = require("../utils/password");

const orderStatuses = ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"];
const productStatuses = ["pending_approval", "approved", "active", "rejected", "blocked", "inactive"];
const employeeRoles = {
  "Super Admin": {
    systemRole: "superadmin",
    permissions: ["*"],
    activityNotes: ["Full company control", "Employee and audit access", "All reports and finance"],
  },
  "Operations Manager": {
    systemRole: "admin",
    permissions: ["dashboard", "sellers", "products", "orders", "customers", "delivery", "reports"],
    activityNotes: ["Daily operations", "Seller/product/order control", "Marketplace reports"],
  },
  "Seller Executive": {
    systemRole: "support",
    permissions: ["dashboard", "sellers"],
    activityNotes: ["Seller onboarding", "KYC follow-up", "Seller status checks"],
  },
  "Product Executive": {
    systemRole: "support",
    permissions: ["dashboard", "products"],
    activityNotes: ["Product approvals", "Catalogue checks", "Stock review"],
  },
  "Order Executive": {
    systemRole: "support",
    permissions: ["dashboard", "orders", "customers"],
    activityNotes: ["Order support", "Customer order lookup", "Cancel/return coordination"],
  },
  "Support Executive": {
    systemRole: "support",
    permissions: ["dashboard", "customers", "orders"],
    activityNotes: ["Customer support", "Issue tracking", "Order assistance"],
  },
  "Finance Executive": {
    systemRole: "finance",
    permissions: ["dashboard", "finance", "reports"],
    activityNotes: ["Payment reports", "Commission and payout review", "Finance exports"],
  },
  "Shipping Executive": {
    systemRole: "delivery_manager",
    permissions: ["dashboard", "delivery", "orders"],
    activityNotes: ["Shipment tracking", "Delivery labels", "Courier updates"],
  },
};

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

function orderFinanceValue(order, field, legacyField = null) {
  if (Number.isFinite(Number(order[field]))) return Number(order[field]);
  if (legacyField && Number.isFinite(Number(order.finance?.[legacyField]))) return Number(order.finance[legacyField]);
  return 0;
}

function orderFinanceRow(order) {
  const productTotal = orderFinanceValue(order, "productTotal", "productTotalPaise") || orderFinanceValue(order, "productTotal", "subtotalPaise");
  const deliveryCharge = orderFinanceValue(order, "deliveryCharge", "deliveryChargePaise") || orderFinanceValue(order, "deliveryCharge", "deliveryFeePaise");
  const customerPaid = orderFinanceValue(order, "customerPaid", "customerPaidPaise") || orderFinanceValue(order, "customerPaid", "totalPaise");
  const commissionAmount = orderFinanceValue(order, "commissionAmount", "commissionAmountPaise") || orderFinanceValue(order, "commissionAmount", "commissionPaise");
  const savedPaymentCharge = orderFinanceValue(order, "paymentCharge", "paymentChargePaise") || orderFinanceValue(order, "paymentCharge", "onlinePaymentChargePaise");
  const paymentCharge = savedPaymentCharge || Math.min(Math.round((productTotal * getPaymentChargePercent()) / 100), Math.max(productTotal - commissionAmount, 0));
  const savedSellerPayout = savedPaymentCharge ? orderFinanceValue(order, "sellerPayout", "sellerPayoutPaise") || orderFinanceValue(order, "sellerPayout", "sellerEarningsPaise") : 0;
  const sellerPayout = Math.max(savedSellerPayout || productTotal - commissionAmount - paymentCharge, 0);

  return {
    ...order,
    productTotal,
    deliveryCharge,
    customerPaid,
    commissionType: order.commissionType || order.finance?.commissionType || "percentage",
    commissionValue: Number(order.commissionValue ?? order.finance?.commissionValue ?? ((order.finance?.commissionBps || 0) / 100)),
    commissionAmount,
    paymentCharge,
    sellerPayout,
    payoutStatus: order.payoutStatus || "pending",
    transactionId: order.transactionId || "",
    paymentMethod: order.paymentMethod || "",
  };
}

function buildOrderFinanceFilter(query) {
  const filter = {};

  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.payoutStatus) filter.payoutStatus = query.payoutStatus;
  if (query.orderStatus) filter.status = query.orderStatus;
  if (query.status && !query.orderStatus) filter.status = query.status;
  if (query.sellerId) filter.sellerId = query.sellerId;

  if (query.dateFrom || query.dateTo) {
    filter.createdAt = {};
    if (query.dateFrom) filter.createdAt.$gte = new Date(query.dateFrom);
    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);
      dateTo.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = dateTo;
    }
  }

  const search = textRegex(query.search);
  if (search) filter.$or = [{ orderId: search }, { sellerName: search }, { transactionId: search }];

  return filter;
}

function buildReportFilter(query = {}) {
  const filter = buildOrderFinanceFilter({
    ...query,
    dateFrom: query.startDate || query.dateFrom,
    dateTo: query.endDate || query.dateTo,
    orderStatus: query.orderStatus || query.status,
  });
  return filter;
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

function csvValue(value) {
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
}

async function sendCsv(req, res, filename, rows) {
  await audit(req, "report.export", "report", filename, { rows: rows.length });
  const keys = Object.keys(rows[0] || { empty: "" });
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => JSON.stringify(csvValue(row[key]))).join(","))].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}.csv`);
  res.send(csv);
}

function comparisonText() {
  return "Live filtered data";
}

function sumRows(rows, field) {
  return rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
}

function reportCard(title, value, hint = comparisonText()) {
  return { title, value, hint };
}

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function monthKey(date) {
  return new Date(date).toISOString().slice(0, 7);
}

function statusCounts(rows) {
  return Object.entries(
    rows.reduce((counts, row) => {
      counts[row.status || "unknown"] = (counts[row.status || "unknown"] || 0) + 1;
      return counts;
    }, {})
  ).map(([label, value]) => ({ label, value }));
}

function groupMoney(rows, keyField, moneyField) {
  const grouped = rows.reduce((totals, row) => {
    const key = row[keyField] || "Unknown";
    totals[key] = (totals[key] || 0) + (Number(row[moneyField]) || 0);
    return totals;
  }, {});
  return Object.entries(grouped)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
}

function orderProductRows(orders) {
  const products = new Map();
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const key = item.sku || item.productId || item.title || item.name || "Unknown";
      const quantity = Number(item.quantity || item.qty || 1);
      const price = Number(item.pricePaise || item.price || item.unitPricePaise || 0);
      const current = products.get(key) || {
        product: item.title || item.name || "Product",
        sku: item.sku || key,
        sellerName: order.sellerName,
        quantitySold: 0,
        revenue: 0,
        returnCount: 0,
      };
      current.quantitySold += quantity;
      current.revenue += price * quantity;
      if (order.status === "returned") current.returnCount += quantity;
      products.set(key, current);
    });
  });
  return [...products.values()].sort((a, b) => b.revenue - a.revenue);
}

async function reportOrders(req) {
  const filter = buildReportFilter(req.query);
  const page = cleanInt(req.query.page, 1, 5000);
  const limit = cleanInt(req.query.limit, 25, 200);
  const skip = (page - 1) * limit;
  const search = textRegex(req.query.search);
  if (search) filter.$or = [{ orderId: search }, { sellerName: search }, { transactionId: search }];
  const [allOrders, pageOrders, total, sellers] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).limit(5000).populate("customerId", "name email phone status createdAt").populate("sellerId", "businessName city pincode").lean(),
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("customerId", "name email phone status createdAt").populate("sellerId", "businessName city pincode").lean(),
    Order.countDocuments(filter),
    Seller.find().sort({ businessName: 1 }).select("businessName").lean(),
  ]);
  return {
    allRows: allOrders.map(orderFinanceRow),
    pageRows: pageOrders.map(orderFinanceRow),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
    sellers,
  };
}

function reportEnvelope(type, cards, rows, charts, pageData = {}) {
  return {
    type,
    cards,
    rows,
    charts,
    page: pageData.page || 1,
    limit: pageData.limit || rows.length,
    total: pageData.total ?? rows.length,
    totalPages: pageData.totalPages || 1,
    sellers: pageData.sellers || [],
  };
}

function allowReport(req, res, type) {
  if (req.user?.role === "finance" && type !== "payments") {
    res.status(403).json({ ok: false, message: "Finance role can access payment reports only." });
    return false;
  }
  return true;
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
  if (req.query.approvalStatus) filter.approvalStatus = req.query.approvalStatus;
  const search = textRegex(req.query.search);
  if (search) filter.$or = [{ businessName: search }, { phone: search }, { city: search }];
  success(res, await paged(Seller, filter, req.query));
});

const sellerDetail = asyncHandler(async (req, res) => {
  const seller = await Seller.findById(req.params.id).populate("userId", "name email phone status role createdAt").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller not found." });
    return;
  }

  const [orders, products] = await Promise.all([
    Order.find({ sellerId: seller._id }).sort({ createdAt: -1 }).limit(500).lean(),
    Product.find({ sellerId: seller._id }).sort({ updatedAt: -1 }).limit(500).lean(),
  ]);

  const financeRows = orders.map(orderFinanceRow);
  const deliveredOrders = financeRows.filter((order) => order.status === "delivered");
  const activeOrders = financeRows.filter((order) => !["cancelled", "returned", "delivered"].includes(order.status));
  const readyOrders = financeRows.filter((order) => ["confirmed", "packed"].includes(order.status));
  const shipmentReadyOrders = financeRows.filter((order) => order.status === "packed");
  const pendingOrders = financeRows.filter((order) => ["placed", "pending", "accepted"].includes(order.status));
  const paidPayoutOrders = financeRows.filter((order) => order.payoutStatus === "paid");
  const pendingPayoutOrders = financeRows.filter((order) => order.payoutStatus !== "paid" && !["cancelled", "returned"].includes(order.status));

  const sum = (rows, field) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const statusCounts = financeRows.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
    return counts;
  }, {});

  const productSummary = products.reduce(
    (summary, product) => {
      summary.total += 1;
      if (["active", "approved"].includes(product.status)) summary.active += 1;
      if (product.status === "pending_approval") summary.pending += 1;
      if (Number(product.stock) <= 5) summary.lowStock += 1;
      return summary;
    },
    { total: 0, active: 0, pending: 0, lowStock: 0 }
  );

  success(res, {
    seller,
    summary: {
      totalOrders: financeRows.length,
      deliveredOrders: deliveredOrders.length,
      activeOrders: activeOrders.length,
      pendingOrders: pendingOrders.length,
      readyOrders: readyOrders.length,
      shipmentReadyOrders: shipmentReadyOrders.length,
      cancelledOrders: statusCounts.cancelled || 0,
      returnedOrders: statusCounts.returned || 0,
      totalCustomerPaid: asMoney(sum(financeRows, "customerPaid")),
      deliveredCustomerPaid: asMoney(sum(deliveredOrders, "customerPaid")),
      totalCommission: asMoney(sum(financeRows, "commissionAmount")),
      totalSellerPayout: asMoney(sum(financeRows, "sellerPayout")),
      sellerPayoutPaid: asMoney(sum(paidPayoutOrders, "sellerPayout")),
      sellerPayoutPending: asMoney(sum(pendingPayoutOrders, "sellerPayout")),
      productSummary,
      statusCounts,
    },
    recentOrders: financeRows.slice(0, 8),
    readyOrders: readyOrders.slice(0, 8),
    shipmentReadyOrders: shipmentReadyOrders.slice(0, 8),
    lowStockProducts: products.filter((product) => Number(product.stock) <= 5).slice(0, 8),
  });
});

const updateSeller = asyncHandler(async (req, res) => {
  const allowed = [
    "kycStatus",
    "bankStatus",
    "payoutStatus",
    "status",
    "approvalStatus",
    "isActive",
    "commissionBps",
    "commissionType",
    "commissionValue",
    "bankDetails",
    "payoutEnabled",
    "codEnabled",
    "onlinePaymentEnabled",
    "storeDetails",
    "pickupAddress",
  ];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });

  if (update.commissionType && !["percentage", "fixed"].includes(update.commissionType)) {
    res.status(400).json({ ok: false, message: "Invalid commission type." });
    return;
  }

  if (update.commissionValue !== undefined && Number(update.commissionValue) < 0) {
    res.status(400).json({ ok: false, message: "Commission value cannot be negative." });
    return;
  }

  if (update.commissionType === "percentage" && Number(update.commissionValue) > 100) {
    res.status(400).json({ ok: false, message: "Percentage commission cannot exceed 100." });
    return;
  }

  const seller = await Seller.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await audit(req, "seller.update", "seller", req.params.id, update);
  success(res, { seller });
});

const approveSeller = asyncHandler(async (req, res) => {
  req.body.kycStatus = "approved";
  req.body.approvalStatus = "approved";
  req.body.status = "active";
  req.body.isActive = true;
  req.body.payoutEnabled = true;
  await User.updateOne({ _id: (await Seller.findById(req.params.id).select("userId"))?.userId }, { status: "active" });
  return updateSeller(req, res);
});

const rejectSeller = asyncHandler(async (req, res) => {
  req.body.kycStatus = "rejected";
  req.body.approvalStatus = "rejected";
  req.body.status = "inactive";
  req.body.isActive = false;
  req.body.payoutEnabled = false;
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

  if (update.status && !orderStatuses.includes(update.status)) {
    res.status(400).json({ ok: false, message: "Invalid order status." });
    return;
  }

  if (["cancelled", "returned"].includes(update.status)) {
    update.paymentStatus = "refunded";
    update.payoutStatus = "failed";
    update.payoutDate = null;
  }

  const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found." });
    return;
  }

  if (["cancelled", "returned"].includes(update.status)) {
    const customerPaid = orderFinanceRow(order.toObject()).customerPaid;
    await Promise.all([
      Payment.updateMany({ orderId: order.orderId }, { status: "refunded", refundPaise: customerPaid }),
      Settlement.updateMany({ orderId: order.orderId }, { status: "failed", payoutPaise: 0, payoutDate: null }),
    ]);
    order.finance = {
      ...order.finance,
      refundAdjustmentPaise: customerPaid,
      netCommissionPaise: 0,
      netSellerPayoutPaise: 0,
    };
    await order.save();
  }

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

const customerDetail = asyncHandler(async (req, res) => {
  const customer = await User.findOne({ _id: req.params.id, role: "customer" }).lean();
  if (!customer) {
    res.status(404).json({ ok: false, message: "Customer not found." });
    return;
  }
  const orders = (await Order.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(200).populate("sellerId", "businessName").lean()).map(orderFinanceRow);
  const paidOrders = orders.filter((order) => order.paymentStatus === "paid" && !["cancelled", "returned"].includes(order.status));
  const cancelledReturned = orders.filter((order) => ["cancelled", "returned"].includes(order.status));
  success(res, {
    customer,
    summary: {
      totalOrders: orders.length,
      totalSpent: asMoney(sumRows(paidOrders, "customerPaid")),
      cancelledReturns: cancelledReturned.length,
      lastOrderDate: orders[0]?.createdAt || null,
    },
    orders,
  });
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

const paymentCommissionReport = asyncHandler(async (req, res) => {
  const filter = buildOrderFinanceFilter(req.query);
  const page = cleanInt(req.query.page, 1, 5000);
  const limit = cleanInt(req.query.limit, 30, 200);
  const skip = (page - 1) * limit;

  const [orders, total, sellers] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("sellerId", "businessName").lean(),
    Order.countDocuments(filter),
    Seller.find().sort({ businessName: 1 }).select("businessName").lean(),
  ]);

  const allRows = await Order.find(filter).select("finance productTotal deliveryCharge customerPaid commissionAmount paymentCharge sellerPayout payoutStatus paymentStatus").lean();
  const summary = allRows.reduce(
    (totals, order) => {
      const row = orderFinanceRow(order);
      totals.customerPayments += row.paymentStatus === "refunded" ? 0 : row.customerPaid;
      totals.platformCommission += row.paymentStatus === "refunded" ? 0 : row.commissionAmount;
      totals.onlinePaymentCharges += row.paymentStatus === "refunded" ? 0 : row.paymentCharge;
      totals.sellerPayoutPending += row.payoutStatus === "pending" && row.paymentStatus !== "refunded" ? row.sellerPayout : 0;
      totals.sellerPayoutPaid += row.payoutStatus === "paid" ? row.sellerPayout : 0;
      totals.deliveryCharges += row.paymentStatus === "refunded" ? 0 : row.deliveryCharge;
      return totals;
    },
    {
      customerPayments: 0,
      platformCommission: 0,
      onlinePaymentCharges: 0,
      sellerPayoutPending: 0,
      sellerPayoutPaid: 0,
      deliveryCharges: 0,
    }
  );

  success(res, {
    items: orders.map(orderFinanceRow),
    sellers,
    summary: Object.fromEntries(
      Object.entries(summary).map(([key, value]) => [
        key,
        {
          paise: value,
          formatted: formatRupees(value),
        },
      ])
    ),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  });
});

const listSettlements = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  success(res, await paged(Settlement, filter, req.query, { createdAt: -1 }, "sellerId"));
});

const updateSettlement = asyncHandler(async (req, res) => {
  const update = {};
  if (["pending", "processing", "paid", "hold", "failed"].includes(req.body.status)) update.status = req.body.status;
  if (req.body.status === "paid") update.payoutDate = req.body.payoutDate ? new Date(req.body.payoutDate) : new Date();
  if (req.body.status === "failed") update.payoutDate = null;
  const settlement = await Settlement.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  await audit(req, "settlement.update", "settlement", req.params.id, update);
  success(res, { settlement });
});

const updateOrderPayoutStatus = asyncHandler(async (req, res) => {
  const { payoutStatus } = req.body;
  if (!["pending", "paid", "failed"].includes(payoutStatus)) {
    res.status(400).json({ ok: false, message: "Invalid payout status." });
    return;
  }

  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404).json({ ok: false, message: "Order not found." });
    return;
  }

  if (order.paymentStatus === "refunded" && payoutStatus === "paid") {
    res.status(400).json({ ok: false, message: "Refunded orders cannot be marked payout paid." });
    return;
  }

  order.payoutStatus = payoutStatus;
  order.payoutDate = payoutStatus === "paid" ? new Date() : null;
  await order.save();

  const settlementStatus = payoutStatus === "paid" ? "paid" : payoutStatus;
  const payoutPaise = payoutStatus === "failed" ? 0 : orderFinanceRow(order.toObject()).sellerPayout;
  await Settlement.findOneAndUpdate(
    { orderId: order.orderId },
    { status: settlementStatus, payoutPaise, payoutDate: order.payoutDate },
    { new: true, upsert: false, runValidators: true }
  );

  await audit(req, "payout.status.update", "order", order._id, {
    orderId: order.orderId,
    payoutStatus,
    payoutDate: order.payoutDate,
  });

  success(res, { order });
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
  const pageData = await paged(User, filter, req.query);
  const profiles = await AdminUser.find({ userId: { $in: pageData.items.map((employee) => employee._id) } }).lean();
  const profileMap = new Map(profiles.map((profile) => [String(profile.userId), profile]));
  success(res, {
    ...pageData,
    roleMatrix: employeeRoles,
    items: pageData.items.map((employee) => {
      const profile = profileMap.get(String(employee._id)) || {};
      return {
        ...employee,
        displayRole: profile.displayRole || (employee.role === "superadmin" ? "Super Admin" : "Operations Manager"),
        permissions: profile.permissions || [],
        activityNotes: profile.activityNotes || [],
      };
    }),
  });
});

const createEmployee = asyncHandler(async (req, res) => {
  const displayRole = req.body.displayRole || "Support Executive";
  const roleConfig = employeeRoles[displayRole];
  if (!roleConfig) {
    res.status(400).json({ ok: false, message: "Invalid employee role." });
    return;
  }

  if (!req.body.name || !req.body.phone || !req.body.password) {
    res.status(400).json({ ok: false, message: "Name, phone and password are required." });
    return;
  }

  if (String(req.body.password).length < 8) {
    res.status(400).json({ ok: false, message: "Password must be at least 8 characters." });
    return;
  }

  const phone = String(req.body.phone).trim();
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : undefined;
  const employee = await User.create({
    name: String(req.body.name).trim(),
    phone,
    email,
    role: roleConfig.systemRole,
    status: req.body.status || "active",
    passwordHash: hashPassword(req.body.password),
  });

  const profile = await AdminUser.create({
    userId: employee._id,
    displayRole,
    permissions: roleConfig.permissions,
    activityNotes: roleConfig.activityNotes,
    createdBy: req.user?.id || null,
  });

  await audit(req, "employee.create", "employee", employee._id, { displayRole, permissions: profile.permissions });
  success(res, { employee: { ...employee.toObject(), displayRole, permissions: profile.permissions, activityNotes: profile.activityNotes } }, 201);
});

const updateEmployee = asyncHandler(async (req, res) => {
  const update = {};
  let roleConfig = null;
  if (req.body.displayRole) {
    roleConfig = employeeRoles[req.body.displayRole];
    if (!roleConfig) {
      res.status(400).json({ ok: false, message: "Invalid employee role." });
      return;
    }
    update.role = roleConfig.systemRole;
  }
  if (["active", "blocked", "pending"].includes(req.body.status)) update.status = req.body.status;
  if (req.body.name) update.name = req.body.name;
  if (req.body.email !== undefined) update.email = req.body.email ? String(req.body.email).trim().toLowerCase() : undefined;
  if (req.body.password) update.passwordHash = hashPassword(req.body.password);
  const employee = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!employee) {
    res.status(404).json({ ok: false, message: "Employee not found." });
    return;
  }
  const profileUpdate = { $setOnInsert: { userId: req.params.id } };
  if (roleConfig) {
    profileUpdate.$set = { displayRole: req.body.displayRole, permissions: roleConfig.permissions, activityNotes: roleConfig.activityNotes };
  }
  await AdminUser.updateOne({ userId: req.params.id }, profileUpdate, { upsert: true });
  await audit(req, "employee.update", "employee", req.params.id, update);
  success(res, { employee });
});

const financeSummary = asyncHandler(async (req, res) => {
  const [settlements, capturedPayments, refunds, commissionRows] = await Promise.all([
    Settlement.aggregate([{ $group: { _id: "$status", amountPaise: { $sum: "$payoutPaise" }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: "captured" } }, { $group: { _id: null, amountPaise: { $sum: "$amountPaise" }, count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: "refunded" } }, { $group: { _id: null, amountPaise: { $sum: "$refundPaise" }, count: { $sum: 1 } } }]),
    Order.aggregate([{ $match: { paymentStatus: { $ne: "refunded" } } }, { $group: { _id: null, commissionPaise: { $sum: "$commissionAmount" }, deliveryPaise: { $sum: "$deliveryCharge" } } }]),
  ]);

  success(res, {
    currency: "INR",
    captured: asMoney(capturedPayments[0]?.amountPaise || 0),
    refunds: asMoney(refunds[0]?.amountPaise || 0),
    commission: asMoney(commissionRows[0]?.commissionPaise || 0),
    deliveryCharges: asMoney(commissionRows[0]?.deliveryPaise || 0),
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

const reportSales = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "sales")) return;
  const { allRows, pageRows, ...pageData } = await reportOrders(req);
  const revenueRows = allRows.filter((row) => row.paymentStatus === "paid" && !["cancelled", "returned"].includes(row.status));
  const cancelledRows = allRows.filter((row) => row.status === "cancelled");
  const returnedRows = allRows.filter((row) => row.status === "returned");
  const totalSales = sumRows(revenueRows, "customerPaid");
  const refundTotal = sumRows([...cancelledRows, ...returnedRows], "customerPaid");
  const cards = [
    reportCard("Total Sales", formatRupees(totalSales)),
    reportCard("Total Orders", allRows.length),
    reportCard("Net Revenue", formatRupees(Math.max(totalSales - refundTotal, 0))),
    reportCard("Cancelled Orders", cancelledRows.length),
    reportCard("Returned Orders", returnedRows.length),
    reportCard("Average Order Value", formatRupees(revenueRows.length ? Math.round(totalSales / revenueRows.length) : 0)),
  ];
  const rows = pageRows.map((row) => ({
    orderId: row.orderId,
    sellerName: row.sellerName,
    customer: row.customerId?.name || row.customerId?.phone || "Customer",
    customerPaid: row.customerPaid,
    netSales: ["cancelled", "returned"].includes(row.status) ? 0 : row.customerPaid,
    status: row.status,
    paymentStatus: row.paymentStatus,
    date: row.createdAt,
    _id: row._id,
  }));
  const charts = {
    primary: groupMoney(revenueRows, "createdAt", "customerPaid").map((item) => item),
    dailySales: Object.entries(revenueRows.reduce((totals, row) => ({ ...totals, [dateKey(row.createdAt)]: (totals[dateKey(row.createdAt)] || 0) + row.customerPaid }), {})).map(([label, value]) => ({ label, value })),
    monthlyRevenue: Object.entries(revenueRows.reduce((totals, row) => ({ ...totals, [monthKey(row.createdAt)]: (totals[monthKey(row.createdAt)] || 0) + row.customerPaid }), {})).map(([label, value]) => ({ label, value })),
    secondary: statusCounts(allRows),
  };
  if (req.query.export === "true") return sendCsv(req, res, "axzen-sales-report", rows);
  success(res, reportEnvelope("sales", cards, rows, charts, pageData));
});

const reportSellers = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "sellers")) return;
  const { allRows } = await reportOrders(req);
  const grouped = new Map();
  allRows.forEach((row) => {
    const key = String(row.sellerId?._id || row.sellerId || row.sellerName);
    const item = grouped.get(key) || {
      sellerName: row.sellerName,
      totalOrders: 0,
      totalSales: 0,
      platformCommission: 0,
      payoutPending: 0,
      payoutPaid: 0,
      cancelledReturned: 0,
      performance: "Good",
    };
    item.totalOrders += 1;
    if (row.paymentStatus === "paid" && !["cancelled", "returned"].includes(row.status)) item.totalSales += row.customerPaid;
    item.platformCommission += ["cancelled", "returned"].includes(row.status) ? 0 : row.commissionAmount;
    item.payoutPending += row.payoutStatus === "pending" ? row.sellerPayout : 0;
    item.payoutPaid += row.payoutStatus === "paid" ? row.sellerPayout : 0;
    if (["cancelled", "returned"].includes(row.status)) item.cancelledReturned += 1;
    grouped.set(key, item);
  });
  const rows = [...grouped.values()].sort((a, b) => b.totalSales - a.totalSales);
  const cards = [
    reportCard("Sellers", rows.length),
    reportCard("Seller Sales", formatRupees(sumRows(rows, "totalSales"))),
    reportCard("Platform Commission", formatRupees(sumRows(rows, "platformCommission"))),
    reportCard("Payout Pending", formatRupees(sumRows(rows, "payoutPending"))),
    reportCard("Payout Paid", formatRupees(sumRows(rows, "payoutPaid"))),
  ];
  if (req.query.export === "true") return sendCsv(req, res, "axzen-seller-report", rows);
  success(res, reportEnvelope("sellers", cards, rows, { primary: rows.slice(0, 8).map((row) => ({ label: row.sellerName, value: row.totalSales })), secondary: rows.slice(0, 8).map((row) => ({ label: row.sellerName, value: row.totalOrders })) }));
});

const reportProducts = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "products")) return;
  const { allRows } = await reportOrders(req);
  let rows = orderProductRows(allRows);
  const skus = rows.map((row) => row.sku).filter(Boolean);
  const products = await Product.find({ sku: { $in: skus } }).select("sku title sellerName stock category").lean();
  const productMap = new Map(products.map((product) => [product.sku, product]));
  rows = rows.map((row) => ({
    ...row,
    product: productMap.get(row.sku)?.title || row.product,
    sellerName: productMap.get(row.sku)?.sellerName || row.sellerName,
    currentStock: productMap.get(row.sku)?.stock ?? "-",
    category: productMap.get(row.sku)?.category || "-",
    lowStock: Number(productMap.get(row.sku)?.stock ?? 99) <= 5 ? "Yes" : "No",
  }));
  const cards = [
    reportCard("Products Sold", rows.length),
    reportCard("Quantity Sold", sumRows(rows, "quantitySold")),
    reportCard("Product Revenue", formatRupees(sumRows(rows, "revenue"))),
    reportCard("Low Stock Alerts", rows.filter((row) => row.lowStock === "Yes").length),
    reportCard("Returns", sumRows(rows, "returnCount")),
  ];
  if (req.query.export === "true") return sendCsv(req, res, "axzen-product-report", rows);
  success(res, reportEnvelope("products", cards, rows, { primary: rows.slice(0, 8).map((row) => ({ label: row.product, value: row.revenue })), secondary: rows.slice(0, 8).map((row) => ({ label: row.product, value: row.quantitySold })) }));
});

const reportPayments = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "payments")) return;
  const { allRows, pageRows, ...pageData } = await reportOrders(req);
  const rows = pageRows.map((row) => {
    const actualShippingCost = Number(row.finance?.actualShippingCostPaise || row.actualShippingCost || 0);
    const gatewayGst = Math.round((row.paymentCharge || 0) * 0.18);
    return {
      orderId: row.orderId,
      sellerName: row.sellerName,
      customerPaid: row.customerPaid,
      productTotal: row.productTotal,
      deliveryCharge: row.deliveryCharge,
      actualShippingCost,
      deliveryMargin: row.deliveryCharge - actualShippingCost,
      platformCommission: row.commissionAmount,
      gatewayCharge: row.paymentCharge,
      gatewayGst,
      netSettlement: Math.max(row.sellerPayout - gatewayGst, 0),
      sellerPayout: row.sellerPayout,
      paymentStatus: row.paymentStatus,
      payoutStatus: row.payoutStatus,
      transactionId: row.transactionId,
      paymentMethod: row.paymentMethod,
      date: row.createdAt,
      _id: row._id,
    };
  });
  const cards = [
    reportCard("Customer Paid", formatRupees(sumRows(allRows, "customerPaid"))),
    reportCard("Platform Commission", formatRupees(sumRows(allRows, "commissionAmount"))),
    reportCard("Gateway Charges", formatRupees(sumRows(allRows, "paymentCharge"))),
    reportCard("Seller Payout", formatRupees(sumRows(allRows, "sellerPayout"))),
    reportCard("Delivery Charges", formatRupees(sumRows(allRows, "deliveryCharge"))),
  ];
  if (req.query.export === "true") return sendCsv(req, res, "axzen-payment-report", rows);
  success(res, reportEnvelope("payments", cards, rows, { primary: groupMoney(allRows, "paymentMethod", "customerPaid"), secondary: statusCounts(allRows) }, pageData));
});

const reportShipments = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "shipments")) return;
  const { allRows, pageRows, ...pageData } = await reportOrders(req);
  const deliveries = await Delivery.find({ orderId: { $in: pageRows.map((row) => row.orderId) } }).lean();
  const deliveryMap = new Map(deliveries.map((delivery) => [delivery.orderId, delivery]));
  const rows = pageRows.map((row) => {
    const delivery = deliveryMap.get(row.orderId) || {};
    const actualShippingCost = Number(row.finance?.actualShippingCostPaise || 0);
    return {
      orderId: row.orderId,
      sellerName: row.sellerName,
      customerPincode: row.shippingAddress?.pincode || "-",
      pickupPincode: row.sellerId?.pincode || "-",
      courierPartner: delivery.partnerName || "-",
      awbNumber: delivery.trackingNumber || "-",
      shipmentStatus: delivery.status || row.deliveryStatus || "created",
      actualShippingCost,
      customerDeliveryCharge: row.deliveryCharge,
      deliveryMargin: row.deliveryCharge - actualShippingCost,
      expectedDeliveryDate: row.finance?.expectedDeliveryDate || "",
      deliveredDate: delivery.status === "delivered" ? delivery.updatedAt : "",
      rtoCancelReason: delivery.failedReason || row.failedDeliveryReason || "",
      _id: row._id,
    };
  });
  const cards = [
    reportCard("Shipments", allRows.length),
    reportCard("Delivered", allRows.filter((row) => row.deliveryStatus === "delivered" || row.status === "delivered").length),
    reportCard("In Transit", allRows.filter((row) => ["packed", "shipped", "out_for_delivery"].includes(row.status)).length),
    reportCard("Delivery Charges", formatRupees(sumRows(allRows, "deliveryCharge"))),
    reportCard("Delivery Margin", formatRupees(sumRows(rows, "deliveryMargin"))),
  ];
  if (req.query.export === "true") return sendCsv(req, res, "axzen-shipment-report", rows);
  success(res, reportEnvelope("shipments", cards, rows, { primary: statusCounts(allRows), secondary: groupMoney(allRows, "sellerName", "deliveryCharge") }, pageData));
});

const reportReturns = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "returns")) return;
  req.query.status = req.query.status || "";
  const { allRows } = await reportOrders(req);
  const returnRows = allRows.filter((row) => ["cancelled", "returned"].includes(row.status));
  const rows = returnRows.map((row) => ({
    orderId: row.orderId,
    sellerName: row.sellerName,
    product: (row.items || []).map((item) => item.title || item.name || "Product").join(", "),
    customer: row.customerId?.name || row.customerId?.phone || "Customer",
    reason: row.failedDeliveryReason || row.finance?.refundReason || "-",
    refundAmount: row.customerPaid,
    refundStatus: row.paymentStatus === "refunded" ? "refunded" : "pending",
    returnPickupStatus: row.deliveryStatus || "-",
    lossAmount: row.commissionAmount + row.paymentCharge,
    status: row.status,
    _id: row._id,
  }));
  const cards = [
    reportCard("Returns/Cancels", rows.length),
    reportCard("Refund Amount", formatRupees(sumRows(rows, "refundAmount"))),
    reportCard("Loss Amount", formatRupees(sumRows(rows, "lossAmount"))),
    reportCard("Refunded", rows.filter((row) => row.refundStatus === "refunded").length),
  ];
  if (req.query.export === "true") return sendCsv(req, res, "axzen-return-report", rows);
  success(res, reportEnvelope("returns", cards, rows, { primary: statusCounts(returnRows), secondary: groupMoney(returnRows, "sellerName", "customerPaid") }));
});

const reportCustomers = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "customers")) return;
  const search = textRegex(req.query.search);
  const customerFilter = { role: "customer" };
  if (req.query.status) customerFilter.status = req.query.status;
  if (search) customerFilter.$or = [{ name: search }, { phone: search }, { email: search }];
  const customers = await User.find(customerFilter).sort({ createdAt: -1 }).limit(500).lean();
  const orders = (await Order.find({ customerId: { $in: customers.map((customer) => customer._id) } }).sort({ createdAt: -1 }).limit(5000).lean()).map(orderFinanceRow);
  const grouped = new Map(customers.map((customer) => [String(customer._id), {
    _id: customer._id,
    name: customer.name || "Customer",
    contact: [customer.phone, customer.email].filter(Boolean).join(" / "),
    totalOrders: 0,
    totalSpent: 0,
    lastOrderDate: "",
    cancelReturnCount: 0,
    status: customer.status,
    signupDate: customer.createdAt,
  }]));
  orders.forEach((order) => {
    const item = grouped.get(String(order.customerId));
    if (!item) return;
    item.totalOrders += 1;
    if (order.paymentStatus === "paid" && !["cancelled", "returned"].includes(order.status)) item.totalSpent += order.customerPaid;
    if (!item.lastOrderDate || new Date(order.createdAt) > new Date(item.lastOrderDate)) item.lastOrderDate = order.createdAt;
    if (["cancelled", "returned"].includes(order.status)) item.cancelReturnCount += 1;
  });
  const rows = [...grouped.values()];
  const cards = [
    reportCard("Customers", rows.length),
    reportCard("Total Orders", sumRows(rows, "totalOrders")),
    reportCard("Total Spent", formatRupees(sumRows(rows, "totalSpent"))),
    reportCard("Cancel/Returns", sumRows(rows, "cancelReturnCount")),
    reportCard("Active Customers", rows.filter((row) => row.status === "active").length),
  ];
  if (req.query.export === "true") return sendCsv(req, res, "axzen-customer-report", rows);
  success(res, reportEnvelope("customers", cards, rows, { primary: rows.slice(0, 8).map((row) => ({ label: row.name, value: row.totalSpent })), secondary: rows.slice(0, 8).map((row) => ({ label: row.name, value: row.totalOrders })) }));
});

const reportCompliance = asyncHandler(async (req, res) => {
  if (!allowReport(req, res, "compliance")) return;
  const [orders, sellers, products, payments, settlements, deliveries] = await Promise.all([
    Order.countDocuments(),
    Seller.countDocuments(),
    Product.countDocuments(),
    Payment.countDocuments(),
    Settlement.countDocuments(),
    Delivery.countDocuments(),
  ]);
  const rows = [
    { area: "Sales invoices", maintain: "Order invoice number, date, customer paid, product total, delivery charge", owner: "Admin / Finance", source: "Orders + invoices", status: orders ? "available" : "pending" },
    { area: "Seller KYC", maintain: "PAN, GST if available, Aadhaar/KYC document, pickup address, approval status", owner: "Seller Executive", source: "Seller registration", status: sellers ? "available" : "pending" },
    { area: "GST and tax register", maintain: "Taxable sales, refunds, cancelled orders, GST/PAN references, monthly export", owner: "Finance Executive", source: "Reports -> Sales/Payments", status: "available" },
    { area: "Payment gateway ledger", maintain: "Transaction ID, gateway charge, GST on gateway charge, net settlement", owner: "Finance Executive", source: "Payments report", status: payments ? "available" : "pending" },
    { area: "Seller payout ledger", maintain: "Product total, platform commission, gateway charge, payout pending/paid, payout date", owner: "Finance Executive", source: "Settlements", status: settlements ? "available" : "pending" },
    { area: "Inventory register", maintain: "SKU, product name, seller, stock, low stock alerts, quantity sold", owner: "Product Executive", source: "Products report", status: products ? "available" : "pending" },
    { area: "Shipment records", maintain: "Pickup pincode, customer pincode, AWB/tracking, courier partner, delivery status", owner: "Shipping Executive", source: "Shipment report", status: deliveries ? "available" : "pending" },
    { area: "Return/refund file", maintain: "Return reason, refund amount, refund status, loss amount, return pickup status", owner: "Support / Finance", source: "Returns report", status: "available" },
    { area: "Audit and access logs", maintain: "Admin exports, payout changes, employee access and role changes", owner: "Super Admin", source: "Audit Logs", status: "available" },
    { area: "Bank and reconciliation", maintain: "Captured payments, COD pending, payout UTR/reference, settlement differences", owner: "Finance Executive", source: "Payments + settlement exports", status: "available" },
  ];
  const cards = [
    reportCard("Compliance Areas", rows.length),
    reportCard("Orders Maintained", orders),
    reportCard("Sellers Maintained", sellers),
    reportCard("Payment Records", payments),
    reportCard("Shipment Records", deliveries),
  ];
  if (req.query.export === "true") return sendCsv(req, res, "axzen-compliance-report", rows);
  success(res, reportEnvelope("compliance", cards, rows, { primary: rows.map((row) => ({ label: row.area, value: row.status === "available" ? 1 : 0 })), secondary: [{ label: "Orders", value: orders }, { label: "Sellers", value: sellers }, { label: "Payments", value: payments }, { label: "Shipments", value: deliveries }] }));
});

const exportCsv = asyncHandler(async (req, res) => {
  const type = req.params.type;
  if (type === "finance" && !["superadmin", "finance"].includes(req.user?.role)) {
    res.status(403).json({ ok: false, message: "Finance export is not allowed for your role." });
    return;
  }
  const rows =
    type === "finance"
      ? (await Order.find(buildOrderFinanceFilter(req.query)).sort({ createdAt: -1 }).limit(1000).lean()).map(orderFinanceRow)
      : type === "sellers"
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
  createEmployee,
  exportCsv,
  financeSummary,
  customerDetail,
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
  paymentCommissionReport,
  productStatuses,
  rejectProduct,
  rejectSeller,
  reportCustomers,
  reportCompliance,
  reportPayments,
  reportProducts,
  reportReturns,
  reportSales,
  reportSellers,
  reportShipments,
  reports,
  sellerDetail,
  updateCustomer,
  updateDelivery,
  updateEmployee,
  updateOrder,
  updateOrderPayoutStatus,
  updateProduct,
  updateSeller,
  updateSettlement,
};
