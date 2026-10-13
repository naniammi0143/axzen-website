const mongoose = require("mongoose");
const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const Order = require("../models/Order");
const Delivery = require("../models/Delivery");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { invalid } = require("../utils/checkoutRules");
const { text } = require("../utils/storeRules");
const { transition } = require("../services/orderWorkflow");
const { verifyPassword, loginPhone } = require("../utils/passwords");
const { sessionResponse } = require("./authController");

const activeStatuses = ["packed", "shipped", "out_for_delivery"];
const historyStatuses = ["delivered", "returned"];
const loginFailure = "Unable to sign in. Check your username and password.";

const passwordLogin = asyncHandler(async (req, res) => {
  if (
    typeof req.body.username !== "string" || req.body.username.length > 50 ||
    typeof req.body.password !== "string" || !req.body.password.length || req.body.password.length > 128
  ) throw invalid(loginFailure, 401);

  const username = req.body.username.trim().toLowerCase();
  const phone = loginPhone(username);
  const user = await User.findOne({
    ...(phone ? { phone } : { username }),
    role: "delivery_agent",
  }).select("+passwordHash +passwordFailedAttempts +passwordLockedUntil");
  const matches = await verifyPassword(req.body.password, user?.passwordHash);
  if (!user || user.status !== "active" || user.passwordLockedUntil > new Date())
    throw invalid(loginFailure, 401);
  if (!matches) {
    const updated = await User.findOneAndUpdate(
      { _id: user._id, passwordHash: user.passwordHash },
      { $inc: { passwordFailedAttempts: 1 } },
      { new: true },
    ).select("+passwordFailedAttempts");
    if (updated?.passwordFailedAttempts >= 5)
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordFailedAttempts: 0, passwordLockedUntil: new Date(Date.now() + 15 * 60 * 1000) } },
      );
    throw invalid(loginFailure, 401);
  }
  const profile = await AdminUser.findOne({ userId: user._id });
  if (!profile) throw invalid(loginFailure, 401);
  await User.updateOne(
    { _id: user._id, passwordHash: user.passwordHash },
    { $set: { passwordFailedAttempts: 0, passwordLockedUntil: null } },
  );
  success(res, sessionResponse(user, profile, { authMethod: "password" }));
});

function publicTask(order) {
  const address = order.shippingAddress || {};
  return {
    id: order._id,
    orderId: order.orderId,
    sellerName: order.sellerName,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    items: (order.items || []).map((item) => ({
      title: item.title || item.name || "Item",
      quantity: Number(item.quantity) || 1,
      image: item.image || item.imageUrl || "",
    })),
    shippingAddress: {
      fullName: address.fullName || "Customer",
      phone: address.phone || "",
      address: address.address || "",
      city: address.city || "",
      state: address.state || "",
      pincode: address.pincode || "",
    },
    paymentMethod: order.paymentMethod || "",
    paymentStatus: order.paymentStatus || "pending",
    amountToCollect:
      order.paymentMethod === "cod" && order.paymentStatus !== "paid"
        ? Number(order.customerPaid) || Number(order.finance?.totalPaise) || 0
        : 0,
    awbNumber: order.awbNumber || "",
    courierName: order.courierName || "",
    trackingUrl: order.trackingUrl || "",
    assignedAt: order.deliveryAgentAssignedAt,
    createdAt: order.createdAt,
    timeline: (order.timeline || []).slice(-8).map((entry) => ({
      status: entry.status,
      note: entry.note,
      at: entry.at,
    })),
  };
}

const listTasks = asyncHandler(async (req, res) => {
  const scope = String(req.query.scope || "active");
  const statuses = scope === "history" ? historyStatuses : scope === "all" ? [...activeStatuses, ...historyStatuses] : activeStatuses;
  const tasks = await Order.find({ deliveryAgentId: req.user.id, status: { $in: statuses } })
    .sort(scope === "history" ? { updatedAt: -1 } : { deliveryAgentAssignedAt: 1, createdAt: 1 })
    .limit(200)
    .lean();
  success(res, { tasks: tasks.map(publicTask) });
});

const getProfile = asyncHandler(async (req, res) => {
  const [user, assigned, delivered] = await Promise.all([
    User.findOne({ _id: req.user.id, role: "delivery_agent" }).select("name phone status").lean(),
    Order.countDocuments({ deliveryAgentId: req.user.id, status: { $in: activeStatuses } }),
    Order.countDocuments({ deliveryAgentId: req.user.id, status: "delivered" }),
  ]);
  if (!user) throw invalid("Delivery partner account not found.", 404);
  success(res, { user, summary: { assigned, delivered } });
});

const updateTaskStatus = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw invalid("Invalid delivery task.");
  const next = String(req.body.status || "");
  if (!["shipped", "out_for_delivery", "delivered", "returned"].includes(next))
    throw invalid("Choose a valid delivery update.");
  const note = text(req.body.note || "", 500, "delivery note", true);
  if (["delivered", "returned"].includes(next) && note.length < 3)
    throw invalid(next === "returned" ? "Enter the failed-delivery or return reason." : "Enter delivery confirmation details.");
  const tracking = {};
  for (const key of ["awbNumber", "courierName", "trackingUrl"])
    if (req.body[key] !== undefined) tracking[key] = req.body[key];
  const order = await transition(
    { _id: req.params.id, deliveryAgentId: req.user.id },
    next,
    { actor: req.user, note, courier: true, tracking },
  );
  success(res, { task: publicTask(order.toObject()) });
});

const listAgents = asyncHandler(async (_req, res) => {
  const agents = await User.find({ role: "delivery_agent", status: "active" })
    .select("name phone status")
    .sort({ name: 1 })
    .lean();
  success(res, { agents });
});

const assignTask = asyncHandler(async (req, res) => {
  const orderId = text(req.params.orderId || "", 100, "order ID");
  const agentId = String(req.body.agentId || "");
  const agent = mongoose.isValidObjectId(agentId)
    ? await User.findOne({ _id: agentId, role: "delivery_agent", status: "active" }).lean()
    : null;
  if (!agent) throw invalid("Choose an active delivery partner.");
  const order = await Order.findOneAndUpdate(
    { orderId, status: { $in: activeStatuses } },
    {
      $set: {
        deliveryAgentId: agent._id,
        deliveryAgentAssignedAt: new Date(),
        pickupAgentName: agent.name,
        pickupAgentPhone: agent.phone,
      },
    },
    { new: true, runValidators: true },
  );
  if (!order) throw invalid("Only packed or in-transit orders can be assigned.", 409);
  await Promise.all([
    Delivery.findOneAndUpdate(
      { orderId: order.orderId },
      {
        $set: {
          status: order.status,
          awbNumber: order.awbNumber,
          trackingNumber: order.awbNumber,
          courierName: order.courierName,
          partnerName: order.courierName,
          trackingUrl: order.trackingUrl,
          deliveryAgentId: agent._id,
          deliveryAgentName: agent.name,
          deliveryAgentPhone: agent.phone,
          assignedAt: order.deliveryAgentAssignedAt,
        },
      },
      { upsert: true, new: true, runValidators: true },
    ),
    AuditLog.create({
      actorId: req.user.id,
      actorRole: req.user.role,
      action: "delivery.assign",
      entityType: "order",
      entityId: String(order._id),
      message: `Assigned ${order.orderId} to ${agent.name}`,
      metadata: { agentId: String(agent._id) },
    }),
  ]);
  success(res, { order: publicTask(order.toObject()), agent });
});

module.exports = { assignTask, getProfile, listAgents, listTasks, passwordLogin, updateTaskStatus };
