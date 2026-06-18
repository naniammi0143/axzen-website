const express = require("express");
const {
  createOrder,
  createRazorpayCheckoutOrder,
  getDeliveryLabel,
  getOrderInvoice,
  listCustomerOrders,
  listSellerOrders,
  verifyRazorpayPayment,
} = require("../controllers/orderController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.get("/customer", authenticate, authorize("customer"), listCustomerOrders);
router.post("/razorpay/order", authenticate, authorize("customer"), createRazorpayCheckoutOrder);
router.post("/razorpay/verify", authenticate, authorize("customer"), verifyRazorpayPayment);
router.post("/", authenticate, authorize("customer"), createOrder);
router.get("/seller", authenticate, authorize("seller"), listSellerOrders);
router.get("/:id/invoice", authenticate, getOrderInvoice);
router.get("/:id/delivery-label", authenticate, getDeliveryLabel);

module.exports = router;
