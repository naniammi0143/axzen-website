const express = require("express");
const {
  adminOverview,
  approveProduct,
  approveSeller,
  exportCsv,
  financeSummary,
  listAuditLogs,
  listCustomers,
  listDeliveries,
  listEmployees,
  listOrders,
  listPayments,
  listProducts,
  listSellers,
  listSettlements,
  paymentCommissionReport,
  rejectProduct,
  rejectSeller,
  reportCustomers,
  reportPayments,
  reportProducts,
  reportReturns,
  reportSales,
  reportSellers,
  reportShipments,
  reports,
  sellerDetail,
  customerDetail,
  updateCustomer,
  updateDelivery,
  updateEmployee,
  updateOrder,
  updateOrderPayoutStatus,
  updateProduct,
  updateSeller,
  updateSettlement,
} = require("../controllers/adminController");
const { authenticate, authorizeAdminAccess } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

router.get("/overview", authorizeAdminAccess("dashboard"), adminOverview);

router.get("/sellers", authorizeAdminAccess("sellers"), listSellers);
router.get("/sellers/:id/detail", authorizeAdminAccess("sellers"), sellerDetail);
router.patch("/sellers/:id", authorizeAdminAccess("sellers"), updateSeller);
router.patch("/sellers/:id/approve", authorizeAdminAccess("sellers"), approveSeller);
router.patch("/sellers/:id/reject", authorizeAdminAccess("sellers"), rejectSeller);

router.get("/products", authorizeAdminAccess("products"), listProducts);
router.patch("/products/:id", authorizeAdminAccess("products"), updateProduct);
router.patch("/products/:id/approve", authorizeAdminAccess("products"), approveProduct);
router.patch("/products/:id/reject", authorizeAdminAccess("products"), rejectProduct);

router.get("/orders", authorizeAdminAccess("orders"), listOrders);
router.patch("/orders/:id", authorizeAdminAccess("orders"), updateOrder);

router.get("/customers", authorizeAdminAccess("customers"), listCustomers);
router.get("/customers/:id/detail", authorizeAdminAccess("customers"), customerDetail);
router.patch("/customers/:id", authorizeAdminAccess("customers"), updateCustomer);

router.get("/payments", authorizeAdminAccess("finance"), listPayments);
router.get("/finance/report", authorizeAdminAccess("finance"), paymentCommissionReport);
router.patch("/finance/orders/:id/payout", authorizeAdminAccess("finance"), updateOrderPayoutStatus);
router.get("/settlements", authorizeAdminAccess("finance"), listSettlements);
router.patch("/settlements/:id", authorizeAdminAccess("finance"), updateSettlement);
router.get("/finance/summary", authorizeAdminAccess("finance"), financeSummary);

router.get("/deliveries", authorizeAdminAccess("delivery"), listDeliveries);
router.patch("/deliveries/:orderId", authorizeAdminAccess("delivery"), updateDelivery);

router.get("/employees", authorizeAdminAccess("employees"), listEmployees);
router.patch("/employees/:id", authorizeAdminAccess("employees"), updateEmployee);

router.get("/reports", authorizeAdminAccess("reports"), reports);
router.get("/reports/sales", authorizeAdminAccess("reports"), reportSales);
router.get("/reports/sellers", authorizeAdminAccess("reports"), reportSellers);
router.get("/reports/products", authorizeAdminAccess("reports"), reportProducts);
router.get("/reports/payments", authorizeAdminAccess("reports"), reportPayments);
router.get("/reports/shipments", authorizeAdminAccess("reports"), reportShipments);
router.get("/reports/returns", authorizeAdminAccess("reports"), reportReturns);
router.get("/reports/customers", authorizeAdminAccess("reports"), reportCustomers);
router.get("/reports/export/:type", authorizeAdminAccess("reports"), exportCsv);

router.get("/audit-logs", authorizeAdminAccess("audit"), listAuditLogs);

module.exports = router;
