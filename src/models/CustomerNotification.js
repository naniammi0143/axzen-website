const mongoose = require("mongoose");

const customerNotificationSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", default: null },
    type: { type: String, enum: ["new_product", "seller_message"], required: true },
    title: { type: String, trim: true, required: true },
    message: { type: String, trim: true, default: "" },
    link: { type: String, trim: true, default: "" },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

customerNotificationSchema.index({ customerId: 1, createdAt: -1 });
customerNotificationSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("CustomerNotification", customerNotificationSchema);
