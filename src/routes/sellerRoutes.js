const express = require("express");
const { getProfile, updateProfile } = require("../controllers/sellerController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/me", authenticate, authorize("seller"), getProfile);
router.put("/me", authenticate, authorize("seller"), updateProfile);

module.exports = router;
