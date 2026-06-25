const mongoose = require("mongoose");

const customerAppConfigSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "default" },
    saleTitle: { type: String, trim: true, default: "Exclusive coupon for you!" },
    saleSubtitle: { type: String, trim: true, default: "Flat 10% Off up to Rs. 100. Already applied on selected products." },
    saleCta: { type: String, trim: true, default: "Shop offers" },
    offerImageUrl: { type: String, trim: true, default: "" },
    spotlightTitle: { type: String, trim: true, default: "Brands in Spotlight" },
    recommendedSellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Seller" }],
    categoryOrder: [{ type: String, trim: true }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerAppConfig", customerAppConfigSchema);
