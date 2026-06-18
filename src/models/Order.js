const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    sellerName: { type: String, trim: true, required: true },
    items: [{ type: Object, required: true }],
    status: { type: String, enum: ["placed", "accepted", "packed", "shipped", "delivered", "cancelled"], default: "placed" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    deliveryStatus: { type: String, enum: ["created", "assigned", "picked", "delivered"], default: "created" },
    finance: { type: Object, required: true },
    shippingAddress: { type: Object, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
