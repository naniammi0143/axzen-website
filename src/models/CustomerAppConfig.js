const mongoose = require("mongoose");

const customerAppConfigSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "default" },
    heroTitle: {type:String,default:'Good finds. Great little everyday moments.'},
    heroSubtitle: {type:String,default:'Discover products and independent stores. Find the things that feel like you.'},
    heroCta: {type:String,default:'Find your favourites'},
    supportEmail: {type:String,default:'axzeninfotech@gmail.com'},
    supportPhone: {type:String,default:''},
    showStores: {type:Boolean,default:true},
    showOffers: {type:Boolean,default:true},
    showBestSellers: {type:Boolean,default:true},
    showReviews: {type:Boolean,default:true},
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
