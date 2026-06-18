const mongoose = require("mongoose");

const wishlistSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
  },
  { timestamps: true }
);

wishlistSchema.index({ customerId: 1 }, { unique: true });

module.exports = mongoose.model("Wishlist", wishlistSchema);
