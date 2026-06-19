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
const { createSellerProduct, listProducts, listSellerProducts } = require("./controllers/productController");
const { financeSummary } = require("./controllers/adminController");
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
      if (!origin || env.allowedOrigins.includes(origin)) {
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
app.use(express.static(rootDir, { index: false }));

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
app.post("/api/customer/cart", authenticate, authorize("customer"), saveCart);
app.post("/api/customer/orders", authenticate, authorize("customer"), createOrder);
app.get("/api/seller/orders", authenticate, authorize("seller"), listSellerOrders);
app.post("/api/seller/orders/:id/accept", authenticate, authorize("seller"), acceptSellerOrder);
app.post("/api/seller/orders/:id/reject", authenticate, authorize("seller"), rejectSellerOrder);
app.post("/api/seller/orders/:id/pack", authenticate, authorize("seller"), packSellerOrder);
app.post("/api/seller/orders/:id/pack-and-ship", authenticate, authorize("seller"), packAndShipSellerOrder);
app.get("/api/seller/products", authenticate, authorize("seller"), listSellerProducts);
app.post("/api/seller/products", authenticate, authorize("seller"), multipartForm({ optional: true, maxBytes: 30 * 1024 * 1024 }), createSellerProduct);
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

  const page = resolvePage(req);

  if (!page) {
    res.json({ ok: true, service: "Axzen API", health: "/api/health" });
    return;
  }

  res.sendFile(path.join(rootDir, page));
});

app.use(errorHandler);

module.exports = app;
