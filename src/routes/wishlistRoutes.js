const express = require("express");
const { getWishlist, saveWishlist } = require("../controllers/wishlistController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, authorize("customer"), getWishlist);
router.post("/", authenticate, authorize("customer"), saveWishlist);

module.exports = router;
