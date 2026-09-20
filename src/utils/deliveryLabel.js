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
  return [address.fullName || address.name, address.line1, address.line2, address.address, address.city, address.state, address.pincode, address.phone]
    .filter(Boolean)
    .join(", ");
}

function buildDeliveryLabelHtml(order) {
  const seller = order.sellerId || {};
  const sellerAddress = [seller.businessName || order.sellerName, seller.pickupAddress, seller.city, seller.state, seller.pincode, seller.phone]
    .filter(Boolean)
    .join(", ");
  const codAmount = order.paymentMethod === "cod" && !["paid", "refunded"].includes(order.paymentStatus) && !["cancelled", "returned"].includes(order.status) ? Number(order.customerPaid || order.finance?.customerPaidPaise || order.finance?.totalPaise || 0) : 0;
  const reference = order.awbNumber || order.orderId;
  const destination = order.shippingAddress?.pincode || "------";
  const itemText = (order.items || [])
    .map((item) => `${item.title || item.name || "Item"} x ${item.quantity || item.qty || 1}`)
    .join(", ");
  const itemCount = (order.items || []).reduce((sum, item) => sum + (Number(item.quantity || item.qty) || 1), 0);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(order.orderId)} Delivery Label</title>
  <style>
    * { box-sizing: border-box; overflow-wrap: anywhere; }
    @page { size: 4in 6in; margin: 0; }
    body { margin: 0; color: #0b1220; background: #e7edf3; font-family: Arial, Helvetica, sans-serif; }
    .label { width: min(4in, 100%); min-height: 6in; margin: 20px auto; background: #fff; border: 1.5px solid #0b1220; }
    .top { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 3px solid #0b1220; }
    img { width: 102px; height: auto; object-fit: contain; }
    .service { text-align: right; }
    .service strong { display: block; font-size: 17px; letter-spacing: .08em; }
    .service span { font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .route { display: grid; grid-template-columns: 1fr auto; align-items: stretch; border-bottom: 1.5px solid #0b1220; }
    .route > div { padding: 10px 14px; }
    .route small, .box span, .meta small { display: block; color: #475569; font-size: 9px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .route strong { display: block; margin-top: 3px; font-size: 21px; }
    .payment { min-width: 112px; display: grid; place-items: center; padding: 10px; color: #fff; background: #0b1220; font-size: 17px; font-weight: 900; text-align: center; }
    .grid { display: grid; grid-template-columns: 1.18fr .82fr; border-bottom: 1.5px solid #0b1220; }
    .box { min-height: 122px; padding: 12px 14px; }
    .box + .box { border-left: 1.5px solid #0b1220; }
    .box strong { display: block; margin: 6px 0; font-size: 16px; }
    .box p { margin: 0; font-size: 10.5px; line-height: 1.45; }
    .reference-wrap { padding: 11px 14px 8px; border-bottom: 1.5px solid #0b1220; text-align: center; }
    .reference-caption { font-size: 10px; color: #475569; }
    .reference-wrap strong { display: block; margin-top: 5px; font: 700 12px/1.2 monospace; letter-spacing: .12em; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1.5px solid #0b1220; }
    .meta div { padding: 9px 10px; border-right: 1px solid #0b1220; }
    .meta div:last-child { border-right: 0; }
    .meta strong { display: block; margin-top: 4px; font-size: 11px; }
    .items { padding: 10px 14px; font-size: 10px; line-height: 1.45; }
    .items strong { display: block; margin-bottom: 4px; font-size: 11px; }
    .footer { display: flex; justify-content: space-between; padding: 9px 14px; border-top: 1px dashed #0b1220; font-size: 9px; font-weight: 700; }
    button { display: block; margin: 14px auto; padding: 11px 18px; color: #fff; background: #102a43; border: 0; border-radius: 8px; font-weight: 800; cursor: pointer; }
    @media print {
      body { background: #fff; }
      .label { margin: 0; width: 4in; min-height: 6in; border: 0; }
      button { display: none; }
    }
    @media (max-width: 640px) {
      .label { margin: 0 auto; }
    }
  </style>
</head>
<body>
  <main class="label">
    <section class="top">
      <div>
        <img src="/assets/brand/wordmark.svg" alt="Axzen logo">
        <small>Marketplace fulfilment</small>
      </div>
      <div class="service"><strong>STANDARD</strong><span>${escapeHtml(order.courierName || "Courier allocation pending")}</span></div>
    </section>
    <section class="route"><div><small>Destination pincode</small><strong>${escapeHtml(destination)}</strong></div><div class="payment">${codAmount ? `COD<br>${money(codAmount)}` : (["cancelled", "returned"].includes(order.status) ? "DO NOT SHIP" : order.paymentStatus === "paid" ? "PAID" : order.paymentStatus === "refunded" ? "REFUNDED" : "PAYMENT PENDING")}</div></section>
    <section class="grid">
      <article class="box">
        <span>Ship To Customer</span>
        <strong>${escapeHtml(order.shippingAddress?.fullName || order.shippingAddress?.name || order.customerId?.name || "Customer")}</strong>
        <p>${escapeHtml(addressText(order.shippingAddress) || order.customerId?.phone || "Customer address not added")}</p>
      </article>
      <article class="box">
        <span>Return / Ship From</span>
        <strong>${escapeHtml(seller.businessName || order.sellerName || "Seller")}</strong>
        <p>${escapeHtml(sellerAddress || "Pickup address not added")}</p>
      </article>
    </section>
    <section class="reference-wrap"><div class="reference-caption"><small>${order.awbNumber ? "AWB / tracking reference" : "Order reference · courier not assigned"}</small></div><strong>${escapeHtml(reference)}</strong></section>
    <section class="meta"><div><small>Order ID</small><strong>${escapeHtml(order.orderId)}</strong></div><div><small>Pieces</small><strong>${itemCount}</strong></div><div><small>Weight</small><strong>${escapeHtml(order.packageDetails?.weight ? `${order.packageDetails.weight} kg` : "Not set")}</strong></div></section>
    <section class="items"><strong>Package contents</strong>${escapeHtml(itemText || "Items")}</section>
    <footer class="footer"><span>Axzen marketplace</span><span>${escapeHtml(order.status || "created").replaceAll("_", " ")}</span></footer>
    <button onclick="window.print()">Print label</button>
  </main>
</body>
</html>`;
}

module.exports = {
  buildDeliveryLabelHtml,
};
