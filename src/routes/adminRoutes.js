const express = require("express");
const {
  approveProduct,
  approveSeller,
  financeSummary,
} = require("../controllers/adminController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
const adminOnly = [authenticate, authorize("admin", "superadmin")];

router.patch("/sellers/:id/approve", adminOnly, approveSeller);
router.patch("/products/:id/approve", adminOnly, approveProduct);
router.get("/finance/summary", adminOnly, financeSummary);

module.exports = router;
