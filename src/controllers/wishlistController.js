const Wishlist = require("../models/Wishlist");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");

const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOne({ customerId: req.user.id }).populate("products");
  success(res, { wishlist: wishlist || { products: [] } });
});

const saveWishlist = asyncHandler(async (req, res) => {
  const wishlist = await Wishlist.findOneAndUpdate(
    { customerId: req.user.id },
    { products: req.body.products || [] },
    { new: true, upsert: true }
  );
  success(res, { wishlist });
});

module.exports = { getWishlist, saveWishlist };
