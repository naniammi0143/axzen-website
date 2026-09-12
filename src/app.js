const path = require("path");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const env = require("./config/env");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const cartRoutes = require("./routes/cartRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const orderRoutes = require("./routes/orderRoutes");
const productRoutes = require("./routes/productRoutes");
const sellerRoutes = require("./routes/sellerRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const { createSellerTicket, listAdminTickets, listSellerTickets, updateAdminTicket } = require("./controllers/supportController");
const { getDashboard } = require("./controllers/dashboardController");
const { saveCart } = require("./controllers/cartController");
const {
  acceptSellerOrder,
  createOrder,
  listSellerOrders,
  packAndShipSellerOrder,
  packSellerOrder,
  rejectSellerOrder,
} = require("./controllers/orderController");
const { createSellerProduct, listProducts, listSellerProducts, updateSellerInventory } = require("./controllers/productController");
const { getPublicSeller, getPublicSellerCategories, getPublicSellerProducts, getPublicSellerReviews, listSellerFestivalOffers, joinSellerFestivalOffer } = require("./controllers/sellerController");
const { financeSummary, publicCustomerAppConfig } = require("./controllers/adminController");
const { verifyWhatsappWebhook, receiveWhatsappWebhook } = require("./controllers/whatsappController");
const {
  followSeller,
  listCustomerFollows,
  listCustomerNotifications,
  markCustomerNotificationsRead,
  sellerFollowerSummary,
  sendSellerFollowerNotification,
  unfollowSeller,
} = require("./controllers/notificationController");
const { errorHandler, notFound } = require("./middleware/errorHandler");
const { authenticate, authorize } = require("./middleware/auth");
const { multipartForm } = require("./middleware/multipartUpload");

const app = express();
const rootDir = path.join(__dirname, "..");

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Not allowed by CORS."));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", (req, res) => {
  res.status(403).json({ ok: false, message: "Uploads are private." });
});
app.use('/api', (req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
app.use('/assets', express.static(path.join(rootDir,'assets'), {maxAge:'1d'}));
app.use((req,res,next)=>{
  // Publish only browser assets at the root; never serve server source, configuration or uploads.
  const forbidden = new Set(["/server.js", "/package.json", "/package-lock.json", "/vercel.json"]);
  if (!forbidden.has(req.path) && (/^\/[a-z0-9-]+\.(?:css|js|html|webmanifest)$/i.test(req.path) || /^\/customer\/[a-z0-9-]+\.(?:js|css)$/i.test(req.path))) {
    res.setHeader('Cache-Control','no-cache');
    return res.sendFile(path.join(rootDir,req.path),error=>{if(error)next();});
  }
  next();
});

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    service: "Axzen API",
    response: {
      data: {},
      error: null,
    },
  });
});
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "Axzen API" });
});
app.get("/api/whatsapp/webhook", verifyWhatsappWebhook);
app.post("/api/whatsapp/webhook", receiveWhatsappWebhook);

app.use("/api/auth", authRoutes);
app.use("/api/users", authRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", orderRoutes);
app.use("/api/settlements", adminRoutes);
app.use("/api/delivery", orderRoutes);
app.use("/api/admin", adminRoutes);
app.get(
  "/api/dashboard/:role",
  authenticate,
  (req, res, next) => authorize(req.params.role)(req, res, next),
  getDashboard
);

// Compatibility routes used by the current frontend while the UI is being split into portals.
app.get("/api/customer/catalog", listProducts);
app.get("/api/customer/app-config", publicCustomerAppConfig);
app.get("/api/customer/sellers/:sellerId", getPublicSeller);
app.get("/api/customer/sellers/:sellerId/products", getPublicSellerProducts);
app.get("/api/customer/sellers/:sellerId/categories", getPublicSellerCategories);
app.get("/api/customer/sellers/:sellerId/reviews", getPublicSellerReviews);
app.post("/api/customer/cart", authenticate, authorize("customer"), saveCart);
app.post("/api/customer/orders", authenticate, authorize("customer"), createOrder);
const customerProfile = require("./controllers/customerController");
app.get("/api/customer/me",authenticate,authorize("customer"),customerProfile.getProfile);
app.put("/api/customer/me",authenticate,authorize("customer"),customerProfile.updateProfile);
app.get("/api/customer/follows", authenticate, authorize("customer"), listCustomerFollows);
app.post("/api/customer/follows/:sellerId", authenticate, authorize("customer"), followSeller);
app.delete("/api/customer/follows/:sellerId", authenticate, authorize("customer"), unfollowSeller);
app.get("/api/customer/notifications", authenticate, authorize("customer"), listCustomerNotifications);
app.post("/api/customer/notifications/read", authenticate, authorize("customer"), markCustomerNotificationsRead);
app.get("/api/seller/orders", authenticate, authorize("seller"), listSellerOrders);
app.post("/api/seller/orders/:id/accept", authenticate, authorize("seller"), acceptSellerOrder);
app.post("/api/seller/orders/:id/reject", authenticate, authorize("seller"), rejectSellerOrder);
app.post("/api/seller/orders/:id/pack", authenticate, authorize("seller"), packSellerOrder);
app.post("/api/seller/orders/:id/pack-and-ship", authenticate, authorize("seller"), packAndShipSellerOrder);
app.get("/api/seller/offers", authenticate, authorize("seller"), listSellerFestivalOffers);
app.post("/api/seller/offers/:id/join", authenticate, authorize("seller"), joinSellerFestivalOffer);
app.get("/api/seller/products", authenticate, authorize("seller"), listSellerProducts);
app.post("/api/seller/products", authenticate, authorize("seller"), multipartForm({ optional: true, maxBytes: 30 * 1024 * 1024 }), createSellerProduct);
app.patch("/api/seller/products/:id/inventory", authenticate, authorize("seller"), updateSellerInventory);
app.get("/api/seller/followers", authenticate, authorize("seller"), sellerFollowerSummary);
app.post("/api/seller/followers/notify", authenticate, authorize("seller"), sendSellerFollowerNotification);
app.get("/api/seller/support-tickets", authenticate, authorize("seller"), listSellerTickets);
app.post("/api/seller/support-tickets", authenticate, authorize("seller"), createSellerTicket);
app.get("/api/admin/helpdesk", authenticate, authorize("admin", "superadmin", "support"), listAdminTickets);
app.patch("/api/admin/helpdesk/:id", authenticate, authorize("admin", "superadmin", "support"), updateAdminTicket);
app.get("/api/admin/finance/summary", authenticate, authorize("admin", "superadmin"), financeSummary);

function resolvePage(req) {
  const host = String(req.hostname || "").toLowerCase();
  const route = String(req.path || "/").toLowerCase();

  if (route === "/seller/register" || (host === "seller.axzen.in" && route === "/register")) return "seller-register.html";
  if (route === "/admin" || host === "admin.axzen.in") return "admin.html";
  if (route === "/seller" || route === "/seller/orders" || host === "seller.axzen.in") return "seller.html";
  if (host === "api.axzen.in") return null;
  return "index.html";
}

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    notFound(req, res);
    return;
  }

  if (req.path.startsWith("/src/") || req.path.includes(".")) return res.status(404).json({ok:false,message:"Not found."});
  res.setHeader("Cache-Control","no-cache");
  const page = resolvePage(req);

  if (!page) {
    res.json({ ok: true, service: "Axzen API", health: "/api/health" });
    return;
  }

  res.sendFile(path.join(rootDir, page));
});

app.use(errorHandler);

module.exports = app;
