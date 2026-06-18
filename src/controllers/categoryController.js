const Category = require("../models/Category");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");

const listCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ status: "active" }).sort({ name: 1 });
  success(res, { categories });
});

module.exports = { listCategories };
