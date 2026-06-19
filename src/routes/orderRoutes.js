const express = require("express");
const {
  acceptSellerOrder,
  createOrder,
  createRazorpayCheckoutOrder,
  getDeliveryLabel,
  getOrderInvoice,
  packAndShipSellerOrder,
  packSellerOrder,
  rejectSellerOrder,
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
router.get("/seller/orders", authenticate, authorize("seller"), listSellerOrders);
router.post("/seller/orders/:id/accept", authenticate, authorize("seller"), acceptSellerOrder);
router.post("/seller/orders/:id/reject", authenticate, authorize("seller"), rejectSellerOrder);
router.post("/seller/orders/:id/pack", authenticate, authorize("seller"), packSellerOrder);
router.post("/seller/orders/:id/pack-and-ship", authenticate, authorize("seller"), packAndShipSellerOrder);
router.get("/:id/invoice", authenticate, getOrderInvoice);
router.get("/:id/delivery-label", authenticate, getDeliveryLabel);

module.exports = router;
