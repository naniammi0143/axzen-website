const Product = require("../models/Product");
const Seller = require("../models/Seller");
const Settlement = require("../models/Settlement");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { formatRupees } = require("../utils/money");

const approveSeller = asyncHandler(async (req, res) => {
  const seller = await Seller.findByIdAndUpdate(
    req.params.id,
    { kycStatus: "approved" },
    { new: true }
  );
  success(res, { seller });
});

const approveProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { status: "active" },
    { new: true }
  );
  success(res, { product });
});

const financeSummary = asyncHandler(async (req, res) => {
  const settlements = await Settlement.aggregate([
    {
      $group: {
        _id: "$status",
        amountPaise: { $sum: "$payoutPaise" },
        count: { $sum: 1 },
      },
    },
  ]);

  success(res, {
    currency: "INR",
    payouts: settlements.map((item) => ({
      status: item._id,
      count: item.count,
      amountPaise: item.amountPaise,
      amount: formatRupees(item.amountPaise),
    })),
  });
});

module.exports = {
  approveProduct,
  approveSeller,
  financeSummary,
};
