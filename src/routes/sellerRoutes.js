const express = require("express");
const {
  getProfile,
  getPublicSeller,
  getPublicSellerCategories,
  getPublicSellerProducts,
  getPublicSellerReviews,
  registerSeller,
  updateProfile,
  listSellerFestivalOffers,
  joinSellerFestivalOffer,
} = require("../controllers/sellerController");
const { authenticate, authorize } = require("../middleware/auth");
const { multipartForm } = require("../middleware/multipartUpload");

const router = express.Router();
const store = require('../controllers/storeController');
router.get('/public/:sellerId/profile', store.profile);
router.get('/public/:sellerId/customer-reviews', store.reviews);
router.put('/me/store', authenticate, authorize('seller'), store.editStore);
router.get('/me/reviews', authenticate, authorize('seller'), store.myReviews);
router.put('/me/reviews/:id/reply', authenticate, authorize('seller'), store.reply);

router.post("/register", multipartForm(), registerSeller);
router.get("/public/:sellerId", getPublicSeller);
router.get("/public/:sellerId/products", getPublicSellerProducts);
router.get("/public/:sellerId/categories", getPublicSellerCategories);
router.get("/public/:sellerId/reviews", getPublicSellerReviews);
router.get("/me", authenticate, authorize("seller"), getProfile);
router.put("/me", authenticate, authorize("seller"), updateProfile);
router.get("/offers", authenticate, authorize("seller"), listSellerFestivalOffers);
router.post("/offers/:id/join", authenticate, authorize("seller"), joinSellerFestivalOffer);

module.exports = router;
