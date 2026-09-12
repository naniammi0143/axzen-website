const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { address, invalid } = require("../utils/checkoutRules");
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .select("name email phone addresses")
    .lean();
  success(res, {
    user: {
      id: user._id,
      name: user.name,
      email: user.email || "",
      phone: user.phone,
      addresses: user.addresses || [],
    },
  });
});
const updateProfile = asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (name.length < 2 || name.length > 100)
      throw invalid("Enter your full name.");
    update.name = name;
  }
  if (req.body.addresses !== undefined) {
    if (!Array.isArray(req.body.addresses) || req.body.addresses.length > 10)
      throw invalid("You can save up to 10 addresses.");
    update.addresses = req.body.addresses.map((a) => ({
      ...address(a),
      label: ["Home", "Work", "Other"].includes(a.label) ? a.label : "Home",
    }));
  }
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { $set: update },
    { new: true, runValidators: true },
  )
    .select("name email phone addresses")
    .lean();
  success(res, {
    user: {
      id: user._id,
      name: user.name,
      email: user.email || "",
      phone: user.phone,
      addresses: user.addresses || [],
    },
  });
});
module.exports = { getProfile, updateProfile };
