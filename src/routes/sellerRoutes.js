const express = require("express");
const { getProfile, registerSeller, updateProfile } = require("../controllers/sellerController");
const { authenticate, authorize } = require("../middleware/auth");
const { multipartForm } = require("../middleware/multipartUpload");

const router = express.Router();

router.post("/register", multipartForm(), registerSeller);
router.get("/me", authenticate, authorize("seller"), getProfile);
router.put("/me", authenticate, authorize("seller"), updateProfile);

module.exports = router;
