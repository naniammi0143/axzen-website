const express = require("express");
const { getCart, saveCart } = require("../controllers/cartController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/", authenticate, authorize("customer"), getCart);
router.post("/", authenticate, authorize("customer"), saveCart);

module.exports = router;
