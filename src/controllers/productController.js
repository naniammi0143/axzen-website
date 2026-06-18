const Product = require("../models/Product");
const Seller = require("../models/Seller");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { formatRupees, toPaise } = require("../utils/money");

const listProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ status: "active" }).sort({ updatedAt: -1 }).limit(48);

  success(res, {
    products: products.map((product) => ({
      id: product._id,
      sku: product.sku,
      title: product.title,
      category: product.category,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      pricePaise: product.pricePaise,
      price: formatRupees(product.pricePaise),
      stock: product.stock,
    })),
  });
});

const listSellerProducts = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  const products = seller ? await Product.find({ sellerId: seller._id }).sort({ updatedAt: -1 }) : [];
  success(res, { products });
});

const createSellerProduct = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });

  if (!seller) {
    res.status(400).json({ ok: false, message: "Complete seller profile first." });
    return;
  }

  if (!req.body.title || !req.body.sku || !req.body.price) {
    res.status(400).json({ ok: false, message: "Title, SKU, and price are required." });
    return;
  }

  const product = await Product.findOneAndUpdate(
    { sellerId: seller._id, sku: req.body.sku.toUpperCase() },
    {
      $set: {
        sellerId: seller._id,
        sellerName: seller.businessName,
        sku: req.body.sku.toUpperCase(),
        title: req.body.title,
        category: req.body.category || "General",
        pricePaise: toPaise(req.body.price),
        stock: Number.parseInt(req.body.stock, 10) || 0,
        status: "pending_approval",
      },
      $setOnInsert: {
        images: [],
      },
    },
    { new: true, upsert: true }
  );

  success(res, { product }, 201);
});

module.exports = {
  createSellerProduct,
  listProducts,
  listSellerProducts,
};
