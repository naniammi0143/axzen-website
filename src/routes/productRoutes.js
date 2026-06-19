const express = require("express");
const { body } = require("express-validator");
const {
  createSellerProduct,
  listProducts,
  listSellerProducts,
  updateSellerInventory,
} = require("../controllers/productController");
const { authenticate, authorize } = require("../middleware/auth");
const { multipartForm } = require("../middleware/multipartUpload");
const validate = require("../middleware/validate");

const router = express.Router();

router.get("/", listProducts);
router.get("/seller", authenticate, authorize("seller"), listSellerProducts);
router.patch("/seller/:id/inventory", authenticate, authorize("seller"), updateSellerInventory);
router.post(
  "/seller",
  authenticate,
  authorize("seller"),
  multipartForm({ optional: true, maxBytes: 30 * 1024 * 1024 }),
  [body("title").trim().notEmpty(), body("sku").trim().notEmpty(), body("price").isNumeric()],
  validate,
  createSellerProduct
);

module.exports = router;
