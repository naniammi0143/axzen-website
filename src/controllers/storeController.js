const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const Seller = require("../models/Seller");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Review = require("../models/Review");
const Follow = require("../models/Follow");
const User = require("../models/User");
const Config = require("../models/CustomerAppConfig");
const Audit = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { invalid, discounts } = require("../utils/checkoutRules");
const {
  activeStore,
  text,
  storeDetails,
  reviewInput,
} = require("../utils/storeRules");
function objectId(value) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value))
    throw invalid("Invalid record ID.");
  return new mongoose.Types.ObjectId(value);
}
async function visibleStore(id) {
  const seller = await Seller.findOne({
    _id: objectId(id),
    ...activeStore,
  }).lean();
  if (
    !seller ||
    (await User.exists({
      _id: seller.userId,
      $or: [{ firebaseUid: "local-test-seller" }, { status: "blocked" }],
    }))
  )
    throw invalid("This store is not available.", 404);
  return seller;
}
async function owner(req) {
  const seller = await Seller.findOne({ userId: req.user.id }).lean();
  if (!seller) throw invalid("Seller profile not found.", 404);
  return seller;
}
function publicReview(r) {
  return {
    id: r._id,
    productId: r.productId,
    productTitle: r.productTitle,
    authorName: r.authorName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    sellerReply: r.sellerReply,
    repliedAt: r.repliedAt,
    createdAt: r.createdAt,
    verifiedPurchase: true,
  };
}
async function reviewSummary(sellerId) {
  const rows = await Review.aggregate([
    { $match: { sellerId, status: "published" } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]);
  const count = rows.reduce((n, r) => n + r.count, 0);
  return {
    reviewCount: count,
    ratingAverage: count
      ? Number(
          (rows.reduce((n, r) => n + r._id * r.count, 0) / count).toFixed(1),
        )
      : 0,
    bars: [5, 4, 3, 2, 1].map((stars) => ({
      stars,
      count: rows.find((r) => r._id === stars)?.count || 0,
    })),
  };
}
async function customerId(req) {
  try {
    const claims = jwt.verify(
      (req.headers.authorization || "").replace(/^Bearer /, ""),
      env.jwtSecret,
      { algorithms: ["HS256"] },
    );
    if (
      claims.role === "customer" &&
      (await User.exists({
        _id: claims.id,
        role: "customer",
        status: { $ne: "blocked" },
      }))
    )
      return claims.id;
  } catch {}
  return null;
}
const profile = asyncHandler(async (req, res) => {
  const s = await visibleStore(req.params.sellerId);
  const c = await customerId(req);
  const [products, followers, following, summary, sales, config] =
    await Promise.all([
      Product.find({ sellerId: s._id, status: { $in: ["active", "approved"] } })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      Follow.countDocuments({ sellerId: s._id }),
      c ? Follow.exists({ sellerId: s._id, customerId: c }) : null,
      reviewSummary(s._id),
      Order.aggregate([
        { $match: { sellerId: s._id, status: "delivered" } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.productId",
            units: { $sum: "$items.quantity" },
          },
        },
      ]),
      Config.findOne({ key: "default" }).select("festivalOffers").lean(),
    ]);
  const sold = new Map(sales.map((r) => [String(r._id), r.units]));
  const offers = discounts(config?.festivalOffers);
  const rows = products.map((p) => ({
    id: p._id,
    sellerId: s._id,
    sellerName: s.businessName,
    title: p.title,
    description: p.description,
    category: p.category,
    sku: p.sku,
    stock: p.stock,
    images: p.images,
    image: p.images?.[0] || "",
    unitLabel: p.unitLabel,
    mrpPaise: p.mrpPaise || p.pricePaise,
    basePricePaise: p.pricePaise,
    pricePaise: Math.round(
      (p.pricePaise * (100 - (offers.get(String(p._id)) || 0))) / 100,
    ),
    ratingAverage: p.ratingAverage,
    ratingCount: p.ratingCount,
    soldUnits: sold.get(String(p._id)) || 0,
    createdAt: p.createdAt,
    verifiedSeller: true,
    codEnabled: s.codEnabled,
    onlinePaymentEnabled:
      s.onlinePaymentEnabled &&
      require("../utils/razorpay").hasRazorpayCredentials(),
    freeDeliveryEnabled: s.freeDeliveryEnabled,
    freeDeliveryMinOrderPaise: s.freeDeliveryMinOrderPaise,
    sellerStoreDetails: s.storeDetails,
    sellerCategory: s.category,
    sellerCity: s.city,
    sellerFollowerCount: followers,
  }));
  success(res, {
    seller: {
      id: s._id,
      name: s.businessName,
      businessName: s.businessName,
      category: s.category,
      city: s.city,
      createdAt: s.createdAt,
      verified: true,
      storeDetails: s.storeDetails,
      productCount: rows.length,
      followerCount: followers,
      isFollowing: !!following,
      ...summary,
    },
    products: rows,
    bestSellers: rows
      .filter((p) => p.soldUnits > 0)
      .sort((a, b) => b.soldUnits - a.soldUnits)
      .slice(0, 12),
  });
});
const reviews = asyncHandler(async (req, res) => {
  const s = await visibleStore(req.params.sellerId);
  const page = Math.max(1, Math.min(10000, parseInt(req.query.page, 10) || 1));
  const [items, summary] = await Promise.all([
    Review.find({ sellerId: s._id, status: "published" })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * 12)
      .limit(12)
      .lean(),
    reviewSummary(s._id),
  ]);
  success(res, {
    reviews: {
      ...summary,
      items: items.map(publicReview),
      page,
      hasMore: page * 12 < summary.reviewCount,
    },
  });
});
async function recalculate(productId, session) {
  const [totals] = await Review.aggregate([
    { $match: { productId, status: "published" } },
    { $group: { _id: null, count: { $sum: 1 }, average: { $avg: "$rating" } } },
  ]).session(session);
  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        ratingCount: totals?.count || 0,
        ratingAverage: totals?.average || 0,
      },
    },
    { session },
  );
}
const writeReview = asyncHandler(async (req, res) => {
  const input = reviewInput(req.body);
  const productId = objectId(req.body.productId);
  const orderId = objectId(req.params.id);
  let result;
  await mongoose.connection.transaction(async (session) => {
    const order = await Order.findOne({
      _id: orderId,
      customerId: req.user.id,
      status: "delivered",
    })
      .session(session)
      .lean();
    const item = order?.items.find(
      (i) => String(i.productId) === String(productId),
    );
    if (!item)
      throw invalid(
        "Only a customer who received this product can review it.",
        403,
      );
    // Serializes review writes for one product so the cached average cannot lose an update.
    const product = await Product.findOneAndUpdate(
      { _id: productId, sellerId: order.sellerId },
      { $inc: { reviewRevision: 1 } },
      { session },
    );
    if (!product) throw invalid("Product no longer available.", 404);
    const existing = await Review.findOne({
      customerId: req.user.id,
      productId,
    }).session(session);
    if (existing?.status === "hidden")
      throw invalid("This review is under moderation. Contact support.", 409);
    result = await Review.findOneAndUpdate(
      { customerId: req.user.id, productId },
      {
        $set: {
          ...input,
          orderId,
          sellerId: order.sellerId,
          authorName: (req.user.name || "Customer").trim().split(/\s+/)[0],
          productTitle: item.title,
        },
      },
      { upsert: true, new: true, runValidators: true, session },
    );
    await recalculate(productId, session);
  });
  success(res, { review: publicReview(result) });
});
const myReviews = asyncHandler(async (req, res) => {
  const s = await owner(req);
  const items = await Review.find({ sellerId: s._id, status: "published" })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  success(res, {
    items: items.map(publicReview),
    ...(await reviewSummary(s._id)),
  });
});
const reply = asyncHandler(async (req, res) => {
  const s = await owner(req);
  const sellerReply = text(req.body.reply, 1000, "reply", true);
  const r = await Review.findOneAndUpdate(
    { _id: objectId(req.params.id), sellerId: s._id, status: "published" },
    { sellerReply, repliedAt: new Date() },
    { new: true, runValidators: true },
  );
  if (!r) throw invalid("Review not found.", 404);
  success(res, { review: publicReview(r) });
});
const editStore = asyncHandler(async (req, res) => {
  const s = await owner(req);
  const details = storeDetails(req.body.storeDetails);
  const update = Object.fromEntries(
    Object.entries(details).map(([k, v]) => ["storeDetails." + k, v]),
  );
  const seller = await Seller.findByIdAndUpdate(
    s._id,
    { $set: update },
    { new: true, runValidators: true },
  );
  success(res, { seller });
});
const listModeration = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const filter = ["published", "hidden"].includes(req.query.status)
    ? { status: req.query.status }
    : {};
  const [items, total] = await Promise.all([
    Review.find(filter)
      .populate("sellerId", "businessName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * 30)
      .limit(30)
      .lean(),
    Review.countDocuments(filter),
  ]);
  success(res, { items, total, page });
});
const moderate = asyncHandler(async (req, res) => {
  if (!["published", "hidden"].includes(req.body.status))
    throw invalid("Invalid review status.");
  const reason = text(req.body.reason, 500, "moderation reason", true);
  let result;
  await mongoose.connection.transaction(async (session) => {
    const r = await Review.findById(objectId(req.params.id)).session(session);
    if (!r) throw invalid("Review not found.", 404);
    await Product.updateOne(
      { _id: r.productId },
      { $inc: { reviewRevision: 1 } },
      { session },
    );
    r.status = req.body.status;
    r.moderationReason = reason;
    await r.save({ session });
    await recalculate(r.productId, session);
    await Audit.create(
      [
        {
          actorId: req.user.id,
          actorRole: req.user.role,
          action: "review.moderate",
          entityType: "review",
          entityId: String(r._id),
          message: reason,
          metadata: { status: r.status },
        },
      ],
      { session },
    );
    result = r;
  });
  success(res, { review: result });
});
module.exports = {
  profile,
  reviews,
  writeReview,
  myReviews,
  reply,
  editStore,
  listModeration,
  moderate,
};
