const mongoose = require("mongoose");

const customerAppConfigSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "default" },
    saleTitle: { type: String, trim: true, default: "Exclusive coupon for you!" },
    saleSubtitle: { type: String, trim: true, default: "Flat 10% Off up to Rs. 100. Already applied on selected products." },
    saleCta: { type: String, trim: true, default: "Shop offers" },
    offerImageUrl: { type: String, trim: true, default: "" },
    offerImages: [{ type: String, trim: true }],
    festivalOffers: [
      {
        id: { type: String, trim: true },
        title: { type: String, trim: true, default: "Festival Offer" },
        imageUrl: { type: String, trim: true, default: "" },
        imageUrls: [{ type: String, trim: true }],
        linkUrl: { type: String, trim: true, default: "" },
        sellerId: { type: String, trim: true, default: "" },
        productIds: [{ type: String, trim: true }],
        discountPercent: { type: Number, default: 0 },
        sellerEntries: [
          {
            sellerId: { type: String, trim: true },
            productIds: [{ type: String, trim: true }],
            discountPercent: { type: Number, default: 0 },
          },
        ],
      },
    ],
    spotlightTitle: { type: String, trim: true, default: "Brands in Spotlight" },
    recommendedSellerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Seller" }],
    categoryOrder: [{ type: String, trim: true }],
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerAppConfig", customerAppConfigSchema);
