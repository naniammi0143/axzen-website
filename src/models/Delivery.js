const mongoose = require("mongoose");

const deliverySchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    partnerName: { type: String, trim: true, default: "" },
    trackingNumber: { type: String, trim: true, default: "" },
    courierName: { type: String, trim: true, default: "" },
    trackingUrl: { type: String, trim: true, default: "" },
    awbNumber: { type: String, trim: true, default: "" },
    deliveryAgentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deliveryAgentName: { type: String, trim: true, default: "" },
    deliveryAgentPhone: { type: String, trim: true, default: "" },
    assignedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ["created", "ready_to_ship", "waiting_for_pickup", "assigned", "packed", "shipped", "picked", "out_for_delivery", "delivered", "cancelled", "returned"],
      default: "created",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Delivery", deliverySchema);
