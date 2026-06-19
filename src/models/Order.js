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
    sellerDeliveryCharge: { type: Number, min: 0, default: 0 },
    freeDeliveryApplied: { type: Boolean, default: false },
    customerPaid: { type: Number, min: 0, default: 0 },
    commissionType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    commissionValue: { type: Number, min: 0, default: 0 },
    commissionAmount: { type: Number, min: 0, default: 0 },
    paymentCharge: { type: Number, min: 0, default: 0 },
    paymentChargePercent: { type: Number, min: 0, default: 0 },
    sellerPayout: { type: Number, min: 0, default: 0 },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    payoutStatus: { type: String, enum: ["pending", "paid", "failed"], default: "pending" },
    payoutDate: { type: Date, default: null },
    refundStatus: { type: String, enum: ["none", "scheduled", "processed", "failed"], default: "none" },
    refundDueDate: { type: Date, default: null },
    cancelReason: { type: String, trim: true, default: "" },
    returnReason: { type: String, trim: true, default: "" },
    transactionId: { type: String, trim: true, default: "" },
    paymentMethod: { type: String, trim: true, default: "" },
    invoiceNumber: { type: String, trim: true, default: "" },
    invoiceDate: { type: Date, default: null },
    deliveryStatus: {
      type: String,
      enum: ["created", "ready_to_ship", "waiting_for_pickup", "assigned", "packed", "shipped", "picked", "delivered", "cancelled", "returned"],
      default: "created",
    },
    awbNumber: { type: String, trim: true, default: "" },
    courierName: { type: String, trim: true, default: "" },
    trackingUrl: { type: String, trim: true, default: "" },
    shipmentStatus: { type: String, trim: true, default: "" },
    pickupAgentName: { type: String, trim: true, default: "" },
    pickupAgentPhone: { type: String, trim: true, default: "" },
    finance: { type: Object, required: true },
    shippingAddress: { type: Object, default: null },
    timeline: [
      {
        status: { type: String, trim: true, required: true },
        note: { type: String, trim: true, default: "" },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);
