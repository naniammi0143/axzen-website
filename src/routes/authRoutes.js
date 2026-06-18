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
    body("role").isIn(["customer", "seller", "admin", "superadmin"]),
    body("firebaseToken").isString().notEmpty(),
  ],
  validate,
  phoneLogin
);

module.exports = router;
