const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");

const dashboards = {
  customer: {
    title: "Customer App",
    summary: "Browse products, manage cart, place orders, track delivery, and manage support.",
    metrics: [["Active orders", "03"], ["Saved sellers", "09"], ["Wallet balance", "Rs. 1,250"], ["Support tickets", "01"]],
    panels: [
      { title: "Shopping flow", items: [["Browse products", "Live marketplace catalogue"], ["Cart", "Saved per customer"], ["Orders", "Tracking and invoices"]] },
      { title: "Account tools", items: [["Addresses", "Home and office"], ["Wishlist", "Saved products"], ["Support", "Returns and refunds"]] },
    ],
  },
  seller: {
    title: "Seller Workspace",
    summary: "Complete store profile, upload products, manage inventory, view orders, and track earnings.",
    metrics: [["Live products", "24"], ["New orders", "18"], ["Low stock", "05"], ["Next payout", "Rs. 18,420"]],
    panels: [
      { title: "Catalogue", items: [["Add products", "Images, price, stock"], ["Inventory", "Stock and variants"], ["Approvals", "Admin moderation"]] },
      { title: "Earnings", items: [["Orders", "Seller order queue"], ["Payouts", "Settlement status"], ["Commission", "Category rules"]] },
    ],
  },
  admin: {
    title: "Company Admin Control",
    summary: "Approve sellers, approve products, manage orders, commissions, delivery, and settlements.",
    metrics: [["Active sellers", "48"], ["Pending approvals", "12"], ["Orders today", "326"], ["Payout queue", "Rs. 2.8L"]],
    panels: [
      { title: "Seller control", items: [["Approve sellers", "KYC and bank checks"], ["Products", "Moderate listings"], ["Commissions", "Platform fee rules"]] },
      { title: "Operations", items: [["Orders", "Lifecycle monitoring"], ["Delivery", "Partner status"], ["Finance", "Settlements and refunds"]] },
    ],
  },
  superadmin: {
    title: "Superadmin Control",
    summary: "Create admins, manage permissions, change platform commission settings, and manage platform configuration.",
    metrics: [["Admins", "04"], ["Permissions", "12"], ["Commission rules", "08"], ["Platform settings", "Live"]],
    panels: [
      { title: "Admin users", items: [["Create admin", "Role permissions"], ["Audit access", "Login activity"], ["Disable users", "Security controls"]] },
      { title: "Platform settings", items: [["Commission", "Global and category rules"], ["Payments", "Provider settings"], ["Delivery", "Partner configuration"]] },
    ],
  },
};

const getDashboard = asyncHandler(async (req, res) => {
  success(res, {
    user: req.user,
    dashboard: dashboards[req.params.role],
  });
});

module.exports = {
  getDashboard,
};
