const express = require("express");
const {
  getProfile,
  getPublicSeller,
  getPublicSellerCategories,
  getPublicSellerProducts,
  getPublicSellerReviews,
  registerSeller,
  updateProfile,
} = require("../controllers/sellerController");
const { authenticate, authorize } = require("../middleware/auth");
const { multipartForm } = require("../middleware/multipartUpload");

const router = express.Router();

router.post("/register", multipartForm(), registerSeller);
router.get("/public/:sellerId", getPublicSeller);
router.get("/public/:sellerId/products", getPublicSellerProducts);
router.get("/public/:sellerId/categories", getPublicSellerCategories);
router.get("/public/:sellerId/reviews", getPublicSellerReviews);
router.get("/me", authenticate, authorize("seller"), getProfile);
router.put("/me", authenticate, authorize("seller"), updateProfile);

module.exports = router;
