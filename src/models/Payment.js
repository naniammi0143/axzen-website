const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amountPaise: { type: Number, min: 0, required: true },
    currency: { type: String, default: "INR" },
    provider: { type: String, default: "demo" },
    status: { type: String, enum: ["created", "captured", "failed", "refunded"], default: "captured" },
    refundPaise: { type: Number, min: 0, default: 0 },
    transactionId: { type: String, trim: true, default: "" },
    paymentMethod: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
