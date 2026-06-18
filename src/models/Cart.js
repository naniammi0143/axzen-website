const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    sku: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    quantity: { type: Number, min: 1, default: 1 },
    pricePaise: { type: Number, min: 0, required: true },
    lineTotalPaise: { type: Number, min: 0, required: true },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: [cartItemSchema],
    subtotalPaise: { type: Number, min: 0, default: 0 },
    currency: { type: String, default: "INR" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Cart", cartSchema);
