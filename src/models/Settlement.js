const mongoose = require("mongoose");

const settlementSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    grossPaise: { type: Number, min: 0, required: true },
    deliveryChargePaise: { type: Number, min: 0, default: 0 },
    commissionPaise: { type: Number, min: 0, required: true },
    payoutPaise: { type: Number, min: 0, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["pending", "processing", "paid", "hold", "failed"], default: "pending" },
    payoutDate: { type: Date, default: null },
  },
  { timestamps: true }
);

settlementSchema.index({ sellerId: 1, status: 1 });

module.exports = mongoose.model("Settlement", settlementSchema);
