const mongoose = require("mongoose");

const sellerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    businessName: { type: String, trim: true, required: true },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "General" },
    city: { type: String, trim: true, default: "Hyderabad" },
    fullName: { type: String, trim: true, default: "" },
    businessType: { type: String, trim: true, default: "" },
    gstNumber: { type: String, trim: true, uppercase: true, default: "" },
    panNumber: { type: String, trim: true, uppercase: true, default: "" },
    aadhaarNumber: { type: String, trim: true, default: "" },
    pickupAddress: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pincode: { type: String, trim: true, default: "" },
    approvalStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    status: { type: String, enum: ["active", "inactive", "blocked"], default: "inactive" },
    isActive: { type: Boolean, default: false },
    kycStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    bankStatus: { type: String, enum: ["not_submitted", "pending", "verified"], default: "not_submitted" },
    payoutStatus: { type: String, enum: ["active", "hold"], default: "active" },
    commissionBps: { type: Number, min: 0, max: 10000, default: 1200 },
    commissionType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
    commissionValue: { type: Number, min: 0, default: 12 },
    bankDetails: {
      accountHolderName: { type: String, trim: true, default: "" },
      accountNumber: { type: String, trim: true, default: "" },
      ifsc: { type: String, trim: true, default: "" },
      bankName: { type: String, trim: true, default: "" },
      upiId: { type: String, trim: true, default: "" },
    },
    payoutEnabled: { type: Boolean, default: true },
    codEnabled: { type: Boolean, default: true },
    onlinePaymentEnabled: { type: Boolean, default: true },
    kycDocuments: [
      {
        type: { type: String, enum: ["pan", "kyc"], required: true },
        originalName: { type: String, trim: true, required: true },
        fileName: { type: String, trim: true, required: true },
        path: { type: String, trim: true, required: true },
        storage: { type: String, trim: true, default: "serverless-temp" },
        mimeType: { type: String, trim: true, required: true },
        size: { type: Number, min: 0, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Seller", sellerSchema);
