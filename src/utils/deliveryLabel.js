const { formatRupees } = require("./money");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(value) {
  return formatRupees(Number(value) || 0);
}

function addressText(address = {}) {
  if (!address || typeof address !== "object") return "";
  return [address.name, address.line1, address.line2, address.address, address.city, address.state, address.pincode, address.phone]
    .filter(Boolean)
    .join(", ");
}

function buildDeliveryLabelHtml(order) {
  const seller = order.sellerId || {};
  const sellerAddress = [seller.businessName || order.sellerName, seller.pickupAddress, seller.city, seller.state, seller.pincode, seller.phone]
    .filter(Boolean)
    .join(", ");
  const codAmount = order.paymentMethod === "cod" && order.paymentStatus !== "paid" ? Number(order.customerPaid || order.finance?.customerPaidPaise || order.finance?.totalPaise || 0) : 0;
  const itemText = (order.items || [])
    .map((item) => `${item.title || item.name || "Item"} x ${item.quantity || item.qty || 1}`)
    .join(", ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(order.orderId)} Delivery Label</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #f4f7fb; font-family: Arial, sans-serif; }
    .label { width: min(720px, 100%); margin: 24px auto; padding: 22px; background: #fff; border: 2px solid #111827; border-radius: 18px; }
    .top { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 14px; }
    img { width: 136px; height: auto; object-fit: contain; }
    h1 { margin: 0; font-size: 24px; }
    .badge { display: inline-block; padding: 8px 12px; color: #fff; background: #111827; border-radius: 999px; font-weight: 900; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 16px; }
    .box { min-height: 128px; padding: 14px; border: 1px solid #111827; border-radius: 12px; }
    .box span { display: block; margin-bottom: 7px; color: #64748b; font-size: 12px; font-weight: 900; text-transform: uppercase; }
    .box strong { display: block; margin-bottom: 6px; font-size: 18px; }
    .order { margin-top: 14px; padding: 14px; background: #f8fafc; border: 1px dashed #111827; border-radius: 12px; }
    .order div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .order div:last-child { border-bottom: 0; }
    button { margin-top: 16px; padding: 12px 18px; color: #fff; background: #111827; border: 0; border-radius: 999px; font-weight: 900; }
    @media print {
      body { background: #fff; }
      .label { margin: 0; width: 100%; border-radius: 0; }
      button { display: none; }
    }
    @media (max-width: 640px) {
      .grid, .top { grid-template-columns: 1fr; display: grid; }
      .label { margin: 0; border-radius: 0; }
    }
  </style>
</head>
<body>
  <main class="label">
    <section class="top">
      <div>
        <img src="/assets/logo.png" alt="Axzen logo">
        <h1>Delivery Label</h1>
      </div>
      <span class="badge">${codAmount ? `COD ${money(codAmount)}` : "Prepaid"}</span>
    </section>
    <section class="grid">
      <article class="box">
        <span>Ship From Seller</span>
        <strong>${escapeHtml(seller.businessName || order.sellerName || "Seller")}</strong>
        <p>${escapeHtml(sellerAddress || "Pickup address not added")}</p>
      </article>
      <article class="box">
        <span>Ship To Customer</span>
        <strong>${escapeHtml(order.shippingAddress?.name || order.customerId?.name || "Customer")}</strong>
        <p>${escapeHtml(addressText(order.shippingAddress) || order.customerId?.phone || "Customer address not added")}</p>
      </article>
    </section>
    <section class="order">
      <div><span>Order ID</span><strong>${escapeHtml(order.orderId)}</strong></div>
      <div><span>Payment</span><strong>${escapeHtml(order.paymentMethod || "-")} / ${escapeHtml(order.paymentStatus || "-")}</strong></div>
      <div><span>Status</span><strong>${escapeHtml(order.status || "-")}</strong></div>
      <div><span>Items</span><strong>${escapeHtml(itemText || "Items")}</strong></div>
    </section>
    <button onclick="window.print()">Print label</button>
  </main>
</body>
</html>`;
}

module.exports = {
  buildDeliveryLabelHtml,
};
