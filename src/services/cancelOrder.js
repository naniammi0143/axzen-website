const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Settlement = require("../models/Settlement");
const Delivery = require("../models/Delivery");
const { invalid } = require("../utils/checkoutRules");
async function cancelOrder(filter, reason) {
  let order;
  await mongoose.connection.transaction(async (session) => {
    order = await Order.findOne(filter).session(session);
    if (!order) throw invalid("Order not found.", 404);
    if (order.status === "cancelled") return;
    if (
      !["placed", "pending", "accepted", "confirmed"].includes(order.status) ||
      order.awbNumber
    )
      throw invalid(
        "This order is already being prepared for shipping. Contact support for a return request.",
        409,
      );
    order.status = "cancelled";
    order.deliveryStatus = "cancelled";
    order.cancelReason = String(reason || "Cancelled before shipping.").slice(
      0,
      500,
    );
    order.payoutStatus = "failed";
    if (order.paymentStatus === "paid" && order.paymentMethod !== "cod") {
      order.refundStatus = "scheduled";
      order.refundDueDate = null;
    }
    if (!order.stockRestored) {
      for (const i of order.items)
        await Product.updateOne(
          { _id: i.productId },
          { $inc: { stock: i.quantity } },
          { session },
        );
      order.stockRestored = true;
    }
    order.timeline.push({
      status: "cancelled",
      note: order.cancelReason,
      at: new Date(),
    });
    await order.save({ session });
    await Settlement.updateMany(
      { orderId: order.orderId },
      { $set: { status: "failed", payoutPaise: 0, payoutDate: null } },
      { session },
    );
    await Delivery.updateOne(
      { orderId: order.orderId },
      { $set: { status: "cancelled" } },
      { session },
    );
  });
  order.$session(null);
  return order;
}
module.exports = cancelOrder;
