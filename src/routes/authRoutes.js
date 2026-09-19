const express = require("express");
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator");
const { phoneLogin } = require("../controllers/authController");
const validate = require("../middleware/validate");

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  "/phone-login",
  authLimiter,
  [
    body("role").isIn(["customer", "seller", "admin", "superadmin", "support", "finance", "delivery_manager"]),
    body("firebaseToken").isString().notEmpty(),
  ],
  validate,
  phoneLogin
);

const access = require('../controllers/sellerAccessController');
const { authenticate, authorize } = require('../middleware/auth');
router.post('/seller-password-login', authLimiter, access.passwordLogin);
router.put('/seller-password', authLimiter, authenticate, authorize('seller'), access.setSellerPassword);
const adminAccess = require('../controllers/adminAccessController');
router.post('/admin-password-login', authLimiter, adminAccess.passwordLogin);
router.put('/admin-password', authLimiter, authenticate, authorize('admin','superadmin'), adminAccess.changePassword);
module.exports = router;
