const { publishedProductRatings } = require("../utils/productRatings");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Follow = require("../models/Follow");
const CustomerAppConfig = require("../models/CustomerAppConfig");
const {discounts} = require("../utils/checkoutRules");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { uploadProductImages } = require("../utils/cloudinary");
const { formatRupees, toPaise } = require("../utils/money");
const { convertCatalogueFiles, grokConfigured } = require("../utils/grokCatalogue");
const cache = require("../utils/cache");

const allowedProductImageTypes = new Set(["image/jpeg", "image/png"]);

function encodeCursor(product) {
  if (!product) return "";
  return Buffer.from(JSON.stringify({ updatedAt: product.updatedAt, id: product._id })).toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    const updatedAt = new Date(parsed.updatedAt);
    if (!parsed.id || Number.isNaN(updatedAt.getTime())) return null;
    return { updatedAt, id: parsed.id };
  } catch {
    return null;
  }
}

function optimizedCloudinaryUrl(value, width = 720) {
  const url = String(value || "");
  if (!/res\.cloudinary\.com\/.+\/image\/upload\//i.test(url)) return url;
  if (/\/image\/upload\/(?:[^/]+,)*f_auto/i.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,c_limit,w_${width},dpr_auto/`);
}

function normalizeFiles(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectProductImages(files = {}) {
  const images = [
    ...normalizeFiles(files.productImages),
    ...normalizeFiles(files.images),
    ...normalizeFiles(files.image),
    ...normalizeFiles(files.image1),
    ...normalizeFiles(files.image2),
    ...normalizeFiles(files.image3),
    ...normalizeFiles(files.image4),
    ...normalizeFiles(files.image5),
  ];
  return images.filter(Boolean);
}

function validateProductImages(files) {
  if (files.length > 5) return "A product can have maximum 5 images.";
  const invalid = files.find((file) => !allowedProductImageTypes.has(file.mimetype));
  if (invalid) return "Product images must be JPG or PNG.";
  return "";
}

const listProducts = asyncHandler(async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 40, 1), 100);
  const cursor = decodeCursor(req.query.cursor);
  const cacheKey = `catalog:v3:${limit}:${req.query.cursor || "first"}`;
  const cached = await cache.getJson(cacheKey);
  if (cached) {
    res.set("Cache-Control", "public, max-age=5, s-maxage=60, stale-while-revalidate=300");
    res.set("Server-Timing", "catalog-cache;dur=0");
    success(res, { ...cached, cached: true });
    return;
  }

  const startedAt = performance.now();
  const [demoUsers, active, config] = await Promise.all([
    require("../models/User").find({ firebaseUid: "local-test-seller" }).select("_id").lean(),
    Seller.find({ isActive: true, status: "active", approvalStatus: "approved", kycStatus: "approved" }).select("_id userId").lean(),
    CustomerAppConfig.findOne({ key: "default" }).select("festivalOffers").lean(),
  ]);
  const demoUserIds = new Set(demoUsers.map((user) => String(user._id)));
  const activeSellerIds = active.filter((seller) => !demoUserIds.has(String(seller.userId))).map((seller) => seller._id);
  const filter = { sellerId: { $in: activeSellerIds }, status: { $in: ["active", "approved"] } };
  if (cursor) {
    filter.$or = [
      { updatedAt: { $lt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } },
    ];
  }
  const rows = await Product.find(filter)
    .select("sku title category sellerId sellerName description mrpPaise pricePaise unitLabel ratingAverage ratingCount stock images createdAt updatedAt")
    .sort({ updatedAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  const products = rows.slice(0, limit);
  const [ratings] = await Promise.all([publishedProductRatings(products.map((product) => product._id))]);
  const offers = discounts(config?.festivalOffers);
  const sellerIds = [...new Set(products.map((product) => String(product.sellerId)).filter(Boolean))];
  const [sellers, followerRows] = sellerIds.length
    ? await Promise.all([
        Seller.find({ _id: { $in: sellerIds }, isActive: true, status: "active" })
          .select("_id businessName category city fullName businessType email phone createdAt codEnabled onlinePaymentEnabled freeDeliveryEnabled freeDeliveryMinOrderPaise storeDetails")
          .lean(),
        Follow.aggregate([
          { $match: { sellerId: { $in: products.map((product) => product.sellerId).filter(Boolean) } } },
          { $group: { _id: "$sellerId", followers: { $sum: 1 } } },
        ]),
      ])
    : [[], []];
  const sellerSettings = new Map(sellers.map((seller) => [String(seller._id), seller]));
  const followerCounts = new Map(followerRows.map((row) => [String(row._id), row.followers]));

  const publicProducts = products.filter((product) => sellerSettings.has(String(product.sellerId))).map((product) => {
      const settings = sellerSettings.get(String(product.sellerId)) || {};
      return {
        id: product._id,
        sku: product.sku,
        title: product.title,
        category: product.category,
        sellerId: product.sellerId,
        sellerName: settings.businessName,
        description: product.description || "",
        mrpPaise: product.mrpPaise || product.pricePaise,
        mrp: formatRupees(product.mrpPaise || product.pricePaise),
        basePricePaise: product.pricePaise,
        pricePaise: Math.round(product.pricePaise*(100-(offers.get(String(product._id)) || 0))/100),
        createdAt: product.createdAt,
        verifiedSeller: true,
        price: formatRupees(Math.round(product.pricePaise * (100 - (offers.get(String(product._id)) || 0)) / 100)),
        unitLabel: product.unitLabel || "1 pc",
        ...(ratings.get(String(product._id)) || { ratingAverage: 0, ratingCount: 0 }),
        stock: product.stock,
        images: product.images || [],
        image: optimizedCloudinaryUrl(product.images?.[0] || "", 720),
        thumbnail: optimizedCloudinaryUrl(product.images?.[0] || "", 480),
        sellerCategory: settings.category || "General",
        sellerCity: settings.city || "",
        sellerFullName: settings.fullName || "",
        sellerBusinessType: settings.businessType || "",
        sellerEmail: settings.email || "",
        sellerPhone: settings.phone || "",
        sellerCreatedAt: settings.createdAt || null,
        sellerFollowerCount: followerCounts.get(String(product.sellerId)) || 0,
        sellerStoreDetails: settings.storeDetails || {},
        codEnabled: settings.codEnabled !== false,
        onlinePaymentEnabled: settings.onlinePaymentEnabled !== false && require("../utils/razorpay").hasRazorpayCredentials(),
        freeDeliveryEnabled: settings.freeDeliveryEnabled === true,
        freeDeliveryMinOrderPaise: Number(settings.freeDeliveryMinOrderPaise) || 0,
      };
    });
  const payload = {
    products: publicProducts,
    hasMore,
    nextCursor: hasMore ? encodeCursor(products[products.length - 1]) : "",
  };
  await cache.setJson(cacheKey, payload, 60);
  res.set("Cache-Control", "public, max-age=5, s-maxage=60, stale-while-revalidate=300");
  res.set("Server-Timing", `catalog-db;dur=${(performance.now() - startedAt).toFixed(1)}`);
  success(res, payload);
});

const listSellerProducts = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  const products = seller ? await Product.find({ sellerId: seller._id }).sort({ updatedAt: -1 }) : [];
  success(res, { products });
});

const updateSellerInventory = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller profile not found." });
    return;
  }

  const update = {};
  if (req.body.stock !== undefined) update.stock = Math.max(Number.parseInt(req.body.stock, 10) || 0, 0);
  if (req.body.lowStockThreshold !== undefined) update.lowStockThreshold = Math.max(Number.parseInt(req.body.lowStockThreshold, 10) || 0, 0);
  if (req.body.investment !== undefined) update.investmentPaise = toPaise(req.body.investment);

  const product = await Product.findOneAndUpdate({ _id: req.params.id, sellerId: seller._id }, update, { new: true, runValidators: true });
  if (!product) {
    res.status(404).json({ ok: false, message: "Product not found." });
    return;
  }
  success(res, { product });
});

const createSellerProduct = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });

  if (!seller) {
    res.status(400).json({ ok: false, message: "Complete seller profile first." });
    return;
  }

  if (!seller.isActive || seller.approvalStatus !== "approved" || seller.kycStatus !== "approved") {
    res.status(403).json({ ok: false, message: "Seller account is waiting for admin approval." });
    return;
  }

  if (!req.body.title || !req.body.sku || !req.body.price) {
    res.status(400).json({ ok: false, message: "Title, SKU, and price are required." });
    return;
  }

  const imageFiles = collectProductImages(req.files);
  const imageError = validateProductImages(imageFiles);
  if (imageError) {
    res.status(400).json({ ok: false, message: imageError });
    return;
  }

  let uploadedImages = [];
  if (imageFiles.length) {
    const cloudinaryImages = await uploadProductImages(imageFiles, {
      folder: `axzen/products/${seller._id}/${req.body.sku.toUpperCase()}`,
    });
    uploadedImages = cloudinaryImages.map((image) => image.url);
  }

  const update = {
    sellerId: seller._id,
    sellerName: seller.businessName,
    sku: req.body.sku.toUpperCase(),
    title: req.body.title,
    description: req.body.description || "",
    category: req.body.category || "General",
    mrpPaise: toPaise(req.body.mrp || req.body.price),
    pricePaise: toPaise(req.body.price),
    unitLabel: req.body.unitLabel || "1 pc",
    stock: Number.parseInt(req.body.stock, 10) || 0,
    status: "pending_approval",
  };

  if (uploadedImages.length) {
    update.images = uploadedImages;
  }

  const updateOperation = {
    $set: update,
  };

  if (!uploadedImages.length) {
    updateOperation.$setOnInsert = { images: [] };
  }

  const product = await Product.findOneAndUpdate(
    { sellerId: seller._id, sku: req.body.sku.toUpperCase() },
    updateOperation,
    { new: true, upsert: true }
  );

  success(res, { product }, 201);
});

function collectCatalogueFiles(files = {}) {
  return [
    ...normalizeFiles(files.catalogue),
    ...normalizeFiles(files.catalogues),
    ...normalizeFiles(files.cataloguePages),
    ...normalizeFiles(files.file),
    ...normalizeFiles(files.files),
  ].filter(Boolean);
}

const parseSellerCatalogue = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  if (!seller) {
    res.status(400).json({ ok: false, message: "Complete seller profile first." });
    return;
  }
  if (!seller.isActive || seller.approvalStatus !== "approved" || seller.kycStatus !== "approved") {
    res.status(403).json({ ok: false, message: "Seller account is waiting for admin approval." });
    return;
  }
  if (!grokConfigured()) {
    res.status(503).json({ ok: false, message: "Grok AI is not configured on the server." });
    return;
  }

  const catalogueFiles = collectCatalogueFiles(req.files);
  if (!catalogueFiles.length) {
    res.status(400).json({ ok: false, message: "Upload a catalogue PDF or page images first." });
    return;
  }

  const products = await convertCatalogueFiles(catalogueFiles);
  success(res, { products, count: products.length });
});

module.exports = {
  createSellerProduct,
  listProducts,
  listSellerProducts,
  updateSellerInventory,
  parseSellerCatalogue,
  _catalogInternals: { encodeCursor, decodeCursor, optimizedCloudinaryUrl },
};
