const mongoose = require("mongoose");

const followSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
  },
  { timestamps: true }
);

followSchema.index({ customerId: 1, sellerId: 1 }, { unique: true });
followSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("Follow", followSchema);
