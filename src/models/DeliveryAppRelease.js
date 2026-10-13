const mongoose = require("mongoose");

const deliveryAppReleaseSchema = new mongoose.Schema(
  {
    appType: { type: String, enum: ["customer", "seller", "delivery"], default: "delivery", index: true },
    version: { type: String, required: true, trim: true, maxlength: 40, unique: true },
    notes: { type: String, trim: true, maxlength: 500, default: "" },
    javascript: { type: String, required: true, select: false },
    stylesheet: { type: String, required: true, select: false },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    sizeBytes: { type: Number, required: true, min: 1, max: 3 * 1024 * 1024 },
    active: { type: Boolean, default: false, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

deliveryAppReleaseSchema.index({ appType: 1, createdAt: -1 });

module.exports = mongoose.model("DeliveryAppRelease", deliveryAppReleaseSchema);
