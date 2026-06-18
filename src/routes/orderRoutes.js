const express = require("express");
const {
  createOrder,
  getOrderInvoice,
  listCustomerOrders,
  listSellerOrders,
} = require("../controllers/orderController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/customer", authenticate, authorize("customer"), listCustomerOrders);
router.post("/", authenticate, authorize("customer"), createOrder);
router.get("/seller", authenticate, authorize("seller"), listSellerOrders);
router.get("/:id/invoice", authenticate, getOrderInvoice);

module.exports = router;
