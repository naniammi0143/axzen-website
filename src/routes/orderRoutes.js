const express = require("express");
const {
  createOrder,
  listCustomerOrders,
  listSellerOrders,
} = require("../controllers/orderController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/customer", authenticate, authorize("customer"), listCustomerOrders);
router.post("/", authenticate, authorize("customer"), createOrder);
router.get("/seller", authenticate, authorize("seller"), listSellerOrders);

module.exports = router;
