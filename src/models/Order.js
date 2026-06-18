const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    sellerName: { type: String, trim: true, required: true },
    items: [{ type: Object, required: true }],
    status: {
      type: String,
      enum: ["placed", "pending", "accepted", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"],
      default: "placed",
    },
    productTotal: { type: Number, min: 0, default: 0 },
    deliveryCharge: { type: Number, min: 0, default: 0 },
    customerPaid: { type: Number, min: 0, default: 0 },
    commissionType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    commissionValue: { type: Number, min: 0, default: 0 },
    commissionAmount: { type: Number, min: 0, default: 0 },
    sellerPayout: { type: Number, min: 0, default: 0 },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    payoutStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    payoutDate: { type: Date, default: null },
    transactionId: { type: String, trim: true, default: "" },
    paymentMethod: { type: String, trim: true, default: "" },
    invoiceNumber: { type: String, trim: true, default: "" },
    invoiceDate: { type: Date, default: null },
    deliveryStatus: { type: String, enum: ["created", "assigned", "picked", "delivered"], default: "created" },
    finance: { type: Object, required: true },
    shippingAddress: { type: Object, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
