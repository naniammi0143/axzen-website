const { formatRupees, getPaymentChargePercent } = require("./money");

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

function dateText(value) {
  return value ? new Date(value).toLocaleDateString("en-IN") : "-";
}

function valueFromOrder(order, field, legacyField = null) {
  if (Number.isFinite(Number(order[field]))) return Number(order[field]);
  if (legacyField && Number.isFinite(Number(order.finance?.[legacyField]))) return Number(order.finance[legacyField]);
  return 0;
}

function customerName(order) {
  const customer = order.customerId || {};
  return customer.name || order.shippingAddress?.name || customer.phone || "Customer";
}

function customerContact(order) {
  const customer = order.customerId || {};
  return [customer.phone, customer.email].filter(Boolean).join(" | ");
}

function addressText(address = {}) {
  if (!address || typeof address !== "object") return "";
  return [address.line1, address.line2, address.address, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(", ");
}

function itemAmount(item) {
  const price = Number(item.pricePaise ?? item.price ?? item.unitPricePaise ?? 0) || 0;
  const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
  return price * quantity;
}

function itemRows(items = []) {
  if (!items.length) {
    return '<tr><td colspan="5" class="muted">No item details available.</td></tr>';
  }

  return items
    .map((item, index) => {
      const price = Number(item.pricePaise ?? item.price ?? item.unitPricePaise ?? 0) || 0;
      const quantity = Number(item.quantity ?? item.qty ?? 1) || 1;
      return `
        <tr>
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(item.title || item.name || item.productName || "Product")}</strong>
            <span>${escapeHtml(item.sku || item.category || "")}</span>
          </td>
          <td>${money(price)}</td>
          <td>${escapeHtml(quantity)}</td>
          <td>${money(itemAmount(item))}</td>
        </tr>
      `;
    })
    .join("");
}

function buildInvoiceHtml(order, options = {}) {
  const showInternalSettlement = Boolean(options.showInternalSettlement);
  const invoiceNumber = order.invoiceNumber || `INV-${order.orderId}`;
  const productTotal = valueFromOrder(order, "productTotal", "productTotalPaise") || valueFromOrder(order, "productTotal", "subtotalPaise");
  const deliveryCharge = valueFromOrder(order, "deliveryCharge", "deliveryChargePaise") || valueFromOrder(order, "deliveryCharge", "deliveryFeePaise");
  const customerPaid = valueFromOrder(order, "customerPaid", "customerPaidPaise") || valueFromOrder(order, "customerPaid", "totalPaise") || productTotal + deliveryCharge;
  const commissionAmount = valueFromOrder(order, "commissionAmount", "commissionAmountPaise") || valueFromOrder(order, "commissionAmount", "commissionPaise");
  const savedPaymentCharge = valueFromOrder(order, "paymentCharge", "paymentChargePaise") || valueFromOrder(order, "paymentCharge", "onlinePaymentChargePaise");
  const paymentCharge = savedPaymentCharge || Math.min(Math.round((productTotal * getPaymentChargePercent()) / 100), Math.max(productTotal - commissionAmount, 0));
  const savedSellerPayout = savedPaymentCharge ? valueFromOrder(order, "sellerPayout", "sellerPayoutPaise") || valueFromOrder(order, "sellerPayout", "sellerEarningsPaise") : 0;
  const sellerPayout = Math.max(savedSellerPayout || productTotal - commissionAmount - paymentCharge, 0);
  const seller = order.sellerId || {};
  const sellerAddress = [seller.pickupAddress, seller.city, seller.state, seller.pincode].filter(Boolean).join(", ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <base href="/">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(invoiceNumber)} | Axzen Invoice</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; background: #f4f7fb; font-family: Inter, Arial, sans-serif; }
    .page { max-width: 980px; margin: 24px auto; padding: 28px; background: #fff; border-radius: 24px; box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12); }
    .topbar { display: flex; justify-content: space-between; gap: 18px; align-items: flex-start; border-bottom: 1px solid #e5e7eb; padding-bottom: 22px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand img { width: 156px; height: auto; object-fit: contain; }
    .brand h1 { margin: 0; font-size: 28px; letter-spacing: 0; }
    .brand p, .muted { color: #6b7280; }
    .print-button { border: 0; border-radius: 999px; padding: 12px 18px; color: #fff; background: #0f172a; font-weight: 800; cursor: pointer; }
    .invoice-meta { text-align: right; }
    .invoice-meta strong { display: block; font-size: 20px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 22px; }
    .box { padding: 18px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 18px; }
    .box span, .summary span { display: block; color: #64748b; font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
    .box h2 { margin: 8px 0 6px; font-size: 20px; }
    .box p { margin: 4px 0; color: #4b5563; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; overflow: hidden; border-radius: 16px; }
    th { text-align: left; padding: 12px; color: #64748b; background: #f1f5f9; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; }
    td { padding: 14px 12px; border-bottom: 1px solid #eef2f7; vertical-align: top; }
    td span { display: block; margin-top: 3px; color: #64748b; font-size: 12px; }
    td:nth-child(3), td:nth-child(4), td:nth-child(5), th:nth-child(3), th:nth-child(4), th:nth-child(5) { text-align: right; }
    .summary { display: grid; gap: 10px; width: min(380px, 100%); margin: 22px 0 0 auto; }
    .summary div { display: flex; justify-content: space-between; gap: 14px; padding: 10px 0; border-bottom: 1px solid #eef2f7; }
    .summary .total { padding: 14px; color: #fff; background: #0f172a; border-radius: 16px; border-bottom: 0; font-size: 18px; font-weight: 900; }
    .note { margin-top: 24px; padding: 16px; color: #475569; background: #f8fafc; border-radius: 16px; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; max-width: none; box-shadow: none; border-radius: 0; }
      .print-button { display: none; }
    }
    @media (max-width: 720px) {
      .page { margin: 0; border-radius: 0; padding: 18px; }
      .topbar, .grid { grid-template-columns: 1fr; display: grid; }
      .invoice-meta { text-align: left; }
      table { display: block; overflow-x: auto; }
    }
  </style>
</head>
<body>
  <main class="page">
    <section class="topbar">
      <div class="brand">
        <img src="/assets/logo.png" alt="Axzen logo">
        <div>
          <h1>Tax Invoice</h1>
          <p>Axzen e-commerce marketplace invoice</p>
        </div>
      </div>
      <div class="invoice-meta">
        <button class="print-button" onclick="window.print()">Print invoice</button>
        <strong>${escapeHtml(invoiceNumber)}</strong>
        <p class="muted">Invoice date: ${escapeHtml(dateText(order.invoiceDate || order.createdAt))}</p>
        <p class="muted">Order ID: ${escapeHtml(order.orderId)}</p>
      </div>
    </section>

    <section class="grid">
      <article class="box">
        <span>Seller</span>
        <h2>${escapeHtml(seller.businessName || order.sellerName || "Seller")}</h2>
        <p>${escapeHtml(seller.fullName || "")}</p>
        <p>${escapeHtml(sellerAddress || "Seller address not added")}</p>
        <p>GST: ${escapeHtml(seller.gstNumber || "Not added")} | PAN: ${escapeHtml(seller.panNumber || "Not added")}</p>
      </article>
      <article class="box">
        <span>Bill To Customer</span>
        <h2>${escapeHtml(customerName(order))}</h2>
        <p>${escapeHtml(customerContact(order) || "Customer contact not added")}</p>
        <p>${escapeHtml(addressText(order.shippingAddress) || "Shipping address not added")}</p>
      </article>
    </section>

    <table>
      <thead>
        <tr><th>#</th><th>Item</th><th>Rate</th><th>Qty</th><th>Amount</th></tr>
      </thead>
      <tbody>${itemRows(order.items)}</tbody>
    </table>

    <section class="summary">
      <div><span>Product total</span><strong>${money(productTotal)}</strong></div>
      <div><span>Delivery charge</span><strong>${money(deliveryCharge)}</strong></div>
      <div class="total"><span>Customer paid</span><strong>${money(customerPaid)}</strong></div>
    </section>

    ${
      showInternalSettlement
        ? `<section class="summary internal-summary">
            <div><span>Platform commission</span><strong>${money(commissionAmount)}</strong></div>
            <div><span>Online payment charge</span><strong>${money(paymentCharge)}</strong></div>
            <div class="total"><span>Seller net payout</span><strong>${money(sellerPayout)}</strong></div>
          </section>`
        : ""
    }

    <section class="grid">
      <article class="box">
        <span>Payment</span>
        <h2>${escapeHtml(order.paymentStatus || "pending")}</h2>
        <p>Method: ${escapeHtml(order.paymentMethod || "-")}</p>
        <p>Transaction ID: ${escapeHtml(order.transactionId || "-")}</p>
      </article>
      <article class="box">
        <span>Order Status</span>
        <h2>${escapeHtml(order.status || "-")}</h2>
        <p>Payout status: ${escapeHtml(order.payoutStatus || "pending")}</p>
        <p>Delivery status: ${escapeHtml(order.deliveryStatus || "created")}</p>
      </article>
    </section>

    <p class="note">This invoice was generated by Axzen. Delivery charges are shown separately from product total.</p>
  </main>
</body>
</html>`;
}

module.exports = {
  buildInvoiceHtml,
};
