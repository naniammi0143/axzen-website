const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    partnerName: { type: String, trim: true, default: "" },
    trackingNumber: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["created", "assigned", "picked", "delivered"], default: "created" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Delivery", deliverySchema);
