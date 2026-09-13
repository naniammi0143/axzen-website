const mongoose = require("mongoose");
const Order = require("../models/Order");
const Delivery = require("../models/Delivery");
const Settlement = require("../models/Settlement");
const Audit = require("../models/AuditLog");
const { invalid } = require("../utils/checkoutRules");
const { text, httpsUrl } = require("../utils/storeRules");
const transitions = {
  placed: ["accepted"],
  pending: ["accepted"],
  accepted: ["packed"],
  confirmed: ["packed"],
  packed: ["shipped"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};
function validateTransition(order, next, courier = false) {
  if (order.status === next) return;
  if (!(transitions[order.status] || []).includes(next))
    throw invalid(
      `Cannot move ${order.status} to ${next}. Refresh the order and follow the next step.`,
      409,
    );
  if (
    ["accepted", "packed"].includes(next) &&
    order.paymentMethod !== "cod" &&
    order.paymentStatus !== "paid"
  )
    throw invalid("Online payment must be confirmed before fulfilment.", 409);
  if (
    ["shipped", "out_for_delivery", "delivered", "returned"].includes(next) &&
    !courier
  )
    throw invalid(
      "Courier progress must be recorded by delivery operations.",
      403,
    );
  if (
    ["shipped", "out_for_delivery", "delivered"].includes(next) &&
    !order.awbNumber
  )
    throw invalid(
      "Add the actual courier tracking number before dispatch.",
      409,
    );
}
async function transition(
  filter,
  next,
  { actor, note, courier = false, tracking = {} } = {},
) {
  const reason = text(note || "", 500, "order note", true);
  let order;
  await mongoose.connection.transaction(async (session) => {
    order = await Order.findOne(filter).session(session);
    if (!order) throw invalid("Order not found.", 404);
    if (tracking.awbNumber !== undefined)
      order.awbNumber = text(tracking.awbNumber, 100, "tracking number", true);
    if (tracking.courierName !== undefined)
      order.courierName = text(tracking.courierName, 100, "courier name", true);
    if (tracking.trackingUrl !== undefined)
      order.trackingUrl = httpsUrl(tracking.trackingUrl, "tracking URL");
    validateTransition(order, next, courier);
    const changed = order.status !== next;
    order.status = next;
    if (next !== "accepted") order.deliveryStatus = next;
    if (next !== "accepted") order.shipmentStatus = next;
    // Delivery evidence does not establish payment settlement. COD collection is reconciled separately.
    if (next === "returned") {
      order.returnReason = reason;
      order.payoutStatus = "failed";
      if (order.paymentStatus === "paid") order.refundStatus = "scheduled";
      await Settlement.updateMany(
        { orderId: order.orderId },
        { $set: { status: "failed", payoutPaise: 0, payoutDate: null } },
        { session },
      );
    }
    if (changed || Object.keys(tracking).length)
      order.timeline.push({ status: next, note: reason, at: new Date() });
    await order.save({ session });
    await Delivery.updateOne(
      { orderId: order.orderId },
      {
        $set: {
          status: order.deliveryStatus,
          awbNumber: order.awbNumber,
          trackingNumber: order.awbNumber,
          courierName: order.courierName,
          partnerName: order.courierName,
          trackingUrl: order.trackingUrl,
        },
      },
      { session },
    );
    if (actor && (changed || Object.keys(tracking).length))
      await Audit.create(
        [
          {
            actorId: actor.id,
            actorRole: actor.role,
            action: "order.transition",
            entityType: "order",
            entityId: String(order._id),
            message: reason,
            metadata: { status: next },
          },
        ],
        { session },
      );
  });
  order.$session(null);
  return order;
}
module.exports = { transition, transitions, validateTransition };
