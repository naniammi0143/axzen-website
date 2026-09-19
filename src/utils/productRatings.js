const Review = require("../models/Review");

// Public ratings come from published purchases, never legacy editable totals.
async function publishedProductRatings(productIds) {
  if (!productIds.length) return new Map();
  const rows = await Review.aggregate([
    { $match: { productId: { $in: productIds }, status: "published" } },
    { $group: { _id: "$productId", ratingAverage: { $avg: "$rating" }, ratingCount: { $sum: 1 } } },
  ]);
  return new Map(rows.map(row => [String(row._id), {
    ratingAverage: Number(row.ratingAverage.toFixed(1)),
    ratingCount: row.ratingCount,
  }]));
}
module.exports = { publishedProductRatings };
