const express = require("express");
const { body } = require("express-validator");
const {
  createSellerProduct,
  listProducts,
  listSellerProducts,
} = require("../controllers/productController");
const { authenticate, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");

const router = express.Router();

router.get("/", listProducts);
router.get("/seller", authenticate, authorize("seller"), listSellerProducts);
router.post(
  "/seller",
  authenticate,
  authorize("seller"),
  [body("title").trim().notEmpty(), body("sku").trim().notEmpty(), body("price").isNumeric()],
  validate,
  createSellerProduct
);

module.exports = router;
