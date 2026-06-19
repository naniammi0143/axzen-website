const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    partnerName: { type: String, trim: true, default: "" },
    trackingNumber: { type: String, trim: true, default: "" },
    courierName: { type: String, trim: true, default: "" },
    trackingUrl: { type: String, trim: true, default: "" },
    awbNumber: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["created", "ready_to_ship", "waiting_for_pickup", "assigned", "packed", "shipped", "picked", "delivered", "cancelled", "returned"],
      default: "created",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Delivery", deliverySchema);
