const express = require("express");
const {
  adminOverview,
  approveProduct,
  approveSeller,
  cleanProductImages,
  createEmployee,
  exportCsv,
  financeSummary,
  getCustomerAppConfig,
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
  performanceDiagnostics,
  rejectProduct,
  rejectSeller,
  updateCustomerAppConfig,
  uploadCustomerAppAds,
  deleteCustomerAppAd,
  createFestivalOffer,
  createPageAd,
  updateFestivalOffer,
  deleteFestivalOffer,
  updatePageAd,
  deletePageAd,
  reportCustomers,
  reportCompliance,
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
const { authenticate, authorize, authorizeAdminAccess } = require("../middleware/auth");
const { multipartForm } = require("../middleware/multipartUpload");
const { assignTask, listAgents, listPartnerDashboard } = require("../controllers/deliveryAgentController");
const { activateRelease, listReleases, uploadRelease } = require("../controllers/deliveryAppReleaseController");

const router = express.Router();

router.use(authenticate);
router.get('/reviews',authorizeAdminAccess('customerapp'),require('../controllers/storeController').listModeration);
router.patch('/reviews/:id',authorizeAdminAccess('customerapp'),require('../controllers/storeController').moderate);

router.get("/overview", authorizeAdminAccess("dashboard"), adminOverview);
router.get("/performance", authorizeAdminAccess("dashboard"), performanceDiagnostics);

router.get("/sellers/:id/documents/:documentId",authorizeAdminAccess("sellers"),require("../controllers/sellerController").downloadKycDocument);
router.post("/sellers", authorize("admin", "superadmin"), authorizeAdminAccess("sellers"), require("../controllers/sellerAccessController").createStore);
router.get("/sellers", authorizeAdminAccess("sellers"), listSellers);
router.get("/sellers/:id/detail", authorizeAdminAccess("sellers"), sellerDetail);
router.patch("/sellers/:id", authorizeAdminAccess("sellers"), updateSeller);
router.patch("/sellers/:id/approve", authorizeAdminAccess("sellers"), approveSeller);
router.patch("/sellers/:id/reject", authorizeAdminAccess("sellers"), rejectSeller);

router.get("/products", authorizeAdminAccess("products"), listProducts);
router.patch("/products/:id", authorizeAdminAccess("products"), updateProduct);
router.patch("/products/:id/approve", authorizeAdminAccess("products"), approveProduct);
router.post("/products/:id/clean-images", authorizeAdminAccess("products"), cleanProductImages);
router.patch("/products/:id/reject", authorizeAdminAccess("products"), rejectProduct);

router.get("/orders", authorizeAdminAccess("orders"), listOrders);
router.patch("/orders/:id/shipment",authorizeAdminAccess("delivery"),(req,res,next)=>{req.deliveryOperation=true;next();},updateOrder);
router.patch("/orders/:id", authorizeAdminAccess("orders"), updateOrder);

router.get("/customers", authorizeAdminAccess("customers"), listCustomers);
router.get("/customers/:id/detail", authorizeAdminAccess("customers"), customerDetail);
router.patch("/customers/:id", authorizeAdminAccess("customers"), updateCustomer);

router.get("/customer-app", authorizeAdminAccess("customerapp"), getCustomerAppConfig);
router.patch("/customer-app", authorizeAdminAccess("customerapp"), updateCustomerAppConfig);
router.post("/customer-app/ads", authorizeAdminAccess("customerapp"), multipartForm({ maxBytes: 40 * 1024 * 1024 }), uploadCustomerAppAds);
router.delete("/customer-app/ads", authorizeAdminAccess("customerapp"), deleteCustomerAppAd);
router.post("/customer-app/page-ads", authorizeAdminAccess("customerapp"), createPageAd);
router.patch("/customer-app/page-ads/:id", authorizeAdminAccess("customerapp"), updatePageAd);
router.delete("/customer-app/page-ads/:id", authorizeAdminAccess("customerapp"), deletePageAd);
router.post("/customer-app/offers", authorizeAdminAccess("customerapp"), createFestivalOffer);
router.patch("/customer-app/offers/:id", authorizeAdminAccess("customerapp"), updateFestivalOffer);
router.delete("/customer-app/offers/:id", authorizeAdminAccess("customerapp"), deleteFestivalOffer);

router.get("/payments", authorizeAdminAccess("finance"), listPayments);
router.get("/finance/report", authorizeAdminAccess("finance"), paymentCommissionReport);
router.patch("/finance/orders/:id/payout", authorizeAdminAccess("finance"), updateOrderPayoutStatus);
router.get("/settlements", authorizeAdminAccess("finance"), listSettlements);
router.patch("/settlements/:id", authorizeAdminAccess("finance"), updateSettlement);
router.get("/finance/summary", authorizeAdminAccess("finance"), financeSummary);

router.get("/deliveries", authorizeAdminAccess("delivery"), listDeliveries);
router.patch("/deliveries/:orderId", authorizeAdminAccess("delivery"), updateDelivery);
router.get("/delivery-agents", authorizeAdminAccess("delivery"), listAgents);
router.patch("/deliveries/:orderId/agent", authorizeAdminAccess("delivery"), assignTask);
router.get("/delivery-partners", authorize("superadmin"), listPartnerDashboard);
router.get("/delivery-app/releases", authorize("superadmin"), listReleases);
router.post(
  "/delivery-app/releases",
  authorize("superadmin"),
  multipartForm({
    maxBytes: 4 * 1024 * 1024,
    maxFileBytes: 4 * 1024 * 1024,
    allowedMimeTypes: ["application/zip", "application/x-zip-compressed", "application/octet-stream"],
    fileTypeMessage: "Only ZIP update packages are allowed.",
  }),
  uploadRelease,
);
router.patch("/delivery-app/releases/:id/activate", authorize("superadmin"), activateRelease);

router.get("/employees", authorizeAdminAccess("employees"), listEmployees);
router.post("/employees", authorizeAdminAccess("employees"), createEmployee);
router.patch("/employees/:id", authorizeAdminAccess("employees"), updateEmployee);

router.get("/reports", authorizeAdminAccess("reports"), reports);
router.get("/reports/sales", authorizeAdminAccess("reports"), reportSales);
router.get("/reports/sellers", authorizeAdminAccess("reports"), reportSellers);
router.get("/reports/products", authorizeAdminAccess("reports"), reportProducts);
router.get("/reports/payments", authorizeAdminAccess("reports"), reportPayments);
router.get("/reports/shipments", authorizeAdminAccess("reports"), reportShipments);
router.get("/reports/returns", authorizeAdminAccess("reports"), reportReturns);
router.get("/reports/customers", authorizeAdminAccess("reports"), reportCustomers);
router.get("/reports/compliance", authorizeAdminAccess("reports"), reportCompliance);
router.get("/reports/export/:type", authorizeAdminAccess("reports"), exportCsv);

router.get("/audit-logs", authorizeAdminAccess("audit"), listAuditLogs);

module.exports = router;
