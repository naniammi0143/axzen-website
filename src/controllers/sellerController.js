const Seller = require("../models/Seller");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");

const getProfile = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  success(res, { seller });
});

const updateProfile = asyncHandler(async (req, res) => {
  const seller = await Seller.findOneAndUpdate(
    { userId: req.user.id },
    {
      $set: {
        businessName: req.body.businessName,
        category: req.body.category,
        city: req.body.city,
        phone: req.user.phone,
      },
    },
    { new: true, upsert: true }
  );

  success(res, { seller });
});

module.exports = {
  getProfile,
  updateProfile,
};
