const Cart = require("../models/Cart");
const Product = require("../models/Product");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { calculateOrderFinance, formatRupees } = require("../utils/money");

const getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ customerId: req.user.id });
  success(res, { cart: cart || { items: [], subtotalPaise: 0 } });
});

const saveCart = asyncHandler(async (req, res) => {
  const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
  const skus = requestedItems.map((item) => String(item.sku || "").trim()).filter(Boolean);
  const products = await Product.find({ sku: { $in: skus }, status: "active" });
  const productMap = new Map(products.map((product) => [product.sku, product]));
  const items = requestedItems
    .map((item) => {
      const product = productMap.get(String(item.sku || "").trim());
      const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);

      if (!product) {
        return null;
      }

      return {
        productId: product._id,
        sellerId: product.sellerId,
        sku: product.sku,
        title: product.title,
        quantity,
        pricePaise: product.pricePaise,
        lineTotalPaise: product.pricePaise * quantity,
      };
    })
    .filter(Boolean);
  const finance = calculateOrderFinance(items, 0, 0);
  const cart = await Cart.findOneAndUpdate(
    { customerId: req.user.id },
    {
      customerId: req.user.id,
      items,
      subtotalPaise: finance.subtotalPaise,
      currency: "INR",
    },
    { new: true, upsert: true }
  );

  success(res, {
    cart: {
      ...cart.toObject(),
      subtotal: formatRupees(cart.subtotalPaise),
    },
  });
});

module.exports = {
  getCart,
  saveCart,
};
