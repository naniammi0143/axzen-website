const Product = require("../models/Product");
const Seller = require("../models/Seller");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { uploadProductImages } = require("../utils/cloudinary");
const { formatRupees, toPaise } = require("../utils/money");

const allowedProductImageTypes = new Set(["image/jpeg", "image/png"]);

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
  const products = await Product.find({ status: { $in: ["active", "approved"] } }).sort({ updatedAt: -1 }).limit(48).lean();
  const sellerIds = [...new Set(products.map((product) => String(product.sellerId)).filter(Boolean))];
  const sellers = sellerIds.length
    ? await Seller.find({ _id: { $in: sellerIds } })
        .select("_id codEnabled onlinePaymentEnabled freeDeliveryEnabled freeDeliveryMinOrderPaise")
        .lean()
    : [];
  const sellerSettings = new Map(sellers.map((seller) => [String(seller._id), seller]));

  success(res, {
    products: products.map((product) => {
      const settings = sellerSettings.get(String(product.sellerId)) || {};
      return {
        id: product._id,
        sku: product.sku,
        title: product.title,
        category: product.category,
        sellerId: product.sellerId,
        sellerName: product.sellerName,
        description: product.description || "",
        mrpPaise: product.mrpPaise || product.pricePaise,
        mrp: formatRupees(product.mrpPaise || product.pricePaise),
        pricePaise: product.pricePaise,
        price: formatRupees(product.pricePaise),
        unitLabel: product.unitLabel || "1 pc",
        ratingAverage: Number(product.ratingAverage || 0),
        ratingCount: Number(product.ratingCount || 0),
        stock: product.stock,
        images: product.images || [],
        image: product.images?.[0] || "",
        codEnabled: settings.codEnabled !== false,
        onlinePaymentEnabled: settings.onlinePaymentEnabled !== false,
        freeDeliveryEnabled: settings.freeDeliveryEnabled === true,
        freeDeliveryMinOrderPaise: Number(settings.freeDeliveryMinOrderPaise) || 0,
      };
    }),
  });
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

module.exports = {
  createSellerProduct,
  listProducts,
  listSellerProducts,
  updateSellerInventory,
};
