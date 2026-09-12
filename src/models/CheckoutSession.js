const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    providerOrderId: { type: String, required: true, unique: true },
    items: { type: [Object], required: true },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
    },
    sellerName: String,
    finance: Object,
    shippingAddress: Object,
    paymentId: String,
    orderId: String,
    state: {
      type: String,
      enum: ["created", "completed", "needs_review"],
      default: "created",
    },
    failureReason: String,
  },
  { timestamps: true },
);
schema.index({ customerId: 1, createdAt: -1 });
module.exports = mongoose.model("CheckoutSession", schema);
