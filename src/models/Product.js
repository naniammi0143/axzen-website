const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    sellerName: { type: String, trim: true, required: true },
    sku: { type: String, trim: true, uppercase: true, required: true },
    title: { type: String, trim: true, required: true },
    category: { type: String, trim: true, default: "General" },
    pricePaise: { type: Number, min: 0, required: true },
    currency: { type: String, default: "INR" },
    stock: { type: Number, min: 0, default: 0 },
    images: [{ type: String, trim: true }],
    status: {
      type: String,
      enum: ["active", "approved", "inactive", "pending_approval", "rejected", "blocked"],
      default: "pending_approval",
    },
  },
  { timestamps: true }
);

productSchema.index({ sellerId: 1, sku: 1 }, { unique: true });
productSchema.index({ status: 1, category: 1 });

module.exports = mongoose.model("Product", productSchema);
