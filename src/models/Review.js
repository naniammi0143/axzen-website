const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    authorName: { type: String, required: true },
    productTitle: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String, maxlength: 100, default: "" },
    body: { type: String, maxlength: 1500, required: true },
    status: {
      type: String,
      enum: ["published", "hidden"],
      default: "published",
    },
    moderationReason: { type: String, default: "" },
    sellerReply: { type: String, maxlength: 1000, default: "" },
    repliedAt: Date,
  },
  { timestamps: true },
);
schema.index({ customerId: 1, productId: 1 }, { unique: true });
schema.index({ sellerId: 1, status: 1, createdAt: -1 });
schema.index({ productId: 1, status: 1 });
module.exports = mongoose.model("Review", schema);
