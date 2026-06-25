const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AdminUser = require("../models/AdminUser");

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ ok: false, message: "Authentication token required." });
    return;
  }

  try {
    req.user = jwt.verify(token, env.jwtSecret);
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
    const allowed = adminAccess[area] || [];

    if (!req.user) {
      res.status(403).json({ ok: false, message: "This admin section is not allowed for your role." });
      return;
    }

    if (allowed.includes(req.user.role)) {
      next();
      return;
    }

    const profile = await AdminUser.findOne({ userId: req.user.id }).select("permissions").lean();
    const permissions = profile?.permissions || [];
    if (permissions.includes("*") || permissions.includes(area)) {
      next();
      return;
    }

    res.status(403).json({ ok: false, message: "This admin section is not allowed for your role." });
  };
}

module.exports = {
  authenticate,
  authorize,
  authorizeAdminAccess,
};
