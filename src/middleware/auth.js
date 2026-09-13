const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AdminUser = require("../models/AdminUser");
const User = require("../models/User");

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ ok: false, message: "Authentication token required." });
    return;
  }

  try {
    const claims = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    const user = await User.findById(claims.id).select("name phone role status").lean();
    if (!user || user.status === "blocked" || user.role !== claims.role ||
        (!["customer", "seller"].includes(user.role) && user.status !== "active")) {
      return res.status(401).json({ ok: false, message: "Your session is no longer active. Please sign in again." });
    }
    req.user = { ...claims, name: user.name, phone: user.phone };
    next();
  } catch (error) {
    res.status(401).json({ ok: false, message: "Invalid or expired token." });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ ok: false, message: "You do not have permission for this action." });
      return;
    }

    next();
  };
}

const adminAccess = {
  dashboard: ["superadmin", "admin", "support", "finance", "delivery_manager"],
  sellers: ["superadmin", "admin"],
  products: ["superadmin", "admin"],
  orders: ["superadmin", "admin", "support", "delivery_manager"],
  customers: ["superadmin", "admin", "support"],
  customerapp: ["superadmin", "admin"],
  finance: ["superadmin", "finance"],
  delivery: ["superadmin", "admin", "delivery_manager"],
  employees: ["superadmin", "admin"],
  reports: ["superadmin", "admin", "finance"],
  audit: ["superadmin"],
};

function authorizeAdminAccess(area) {
  return async (req, res, next) => {
    try {
    const allowed = adminAccess[area] || [];

    if (!req.user) {
      res.status(403).json({ ok: false, message: "This admin section is not allowed for your role." });
      return;
    }

    if (req.user.role === "superadmin") {
      next();
      return;
    }

    const profile = await AdminUser.findOne({ userId: req.user.id }).select("permissions").lean();
    const permissions = profile?.permissions || [];
    if (profile ? permissions.includes("*") || permissions.includes(area) : allowed.includes(req.user.role)) {
      next();
      return;
    }

    res.status(403).json({ ok: false, message: "This admin section is not allowed for your role." });
    } catch (error) { next(error); }
  };
}

module.exports = {
  authenticate,
  authorize,
  authorizeAdminAccess,
};
