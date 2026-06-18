const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    businessName: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "General" },
    city: { type: String, trim: true, default: "Hyderabad" },
    kycStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    bankStatus: { type: String, enum: ["not_submitted", "pending", "verified"], default: "not_submitted" },
    payoutStatus: { type: String, enum: ["active", "hold"], default: "active" },
    commissionBps: { type: Number, min: 0, max: 10000, default: 1200 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Seller", sellerSchema);
