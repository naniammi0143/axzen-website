(function () {
  const state = {
    token: "",
    user: null,
    view: "dashboard",
    search: "",
    cache: {},
  };

  const titles = {
    dashboard: "Dashboard",
    sellers: "Seller Management",
    products: "Product Approval",
    orders: "Order Management",
    payments: "Payments and Commission",
    customers: "Customers",
    delivery: "Delivery Management",
    employees: "Employee Roles",
    reports: "Reports",
    audit: "Audit Logs",
  };

  const endpoints = {
    sellers: "/api/admin/sellers",
    products: "/api/admin/products",
    orders: "/api/admin/orders",
    payments: "/api/admin/payments",
    customers: "/api/admin/customers",
    delivery: "/api/admin/deliveries",
    employees: "/api/admin/employees",
    audit: "/api/admin/audit-logs",
  };

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rupees(paise) {
    return `Rs. ${((Number(paise) || 0) / 100).toLocaleString("en-IN", {
      maximumFractionDigits: 2,
    })}`;
  }

  function toast(message, isError = false) {
    const node = qs("#adminToast");
    if (!node) return;
    node.textContent = message;
    node.classList.toggle("error", isError);
    node.classList.add("show");
    window.setTimeout(() => node.classList.remove("show"), 2800);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.token}`,
        ...(options.headers || {}),
      },
    });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const result = isJson ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(result.message || "Request failed.");
    }
    return result;
  }

  function statusBadge(status) {
    const clean = String(status || "unknown");
    return `<span class="status-badge ${escapeHtml(clean.replaceAll("_", "-"))}">${escapeHtml(clean.replaceAll("_", " "))}</span>`;
  }

  function emptyState(text = "No records found.") {
    return `<div class="empty-state">${escapeHtml(text)}</div>`;
  }

  function table(columns, rows, actions) {
    if (!rows?.length) return emptyState();
    return `
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>${columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join("")}${actions ? "<th>Actions</th>" : ""}</tr></thead>
          <tbody>
            ${rows
              .map(
                (row) => `
                  <tr>
                    ${columns.map((col) => `<td>${col.render ? col.render(row) : escapeHtml(row[col.key])}</td>`).join("")}
                    ${actions ? `<td><div class="row-actions">${actions(row)}</div></td>` : ""}
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function panel(title, body, extra = "") {
    return `
      <article class="admin-panel">
        <div class="panel-heading">
          <h2>${escapeHtml(title)}</h2>
          ${extra}
        </div>
        ${body}
      </article>
    `;
  }

  function filterBar(view, filters = []) {
    return `
      <div class="filter-bar">
        ${filters
          .map(
            (filter) => `
              <select data-filter="${escapeHtml(filter.key)}">
                <option value="">${escapeHtml(filter.label)}</option>
                ${filter.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option.replaceAll("_", " "))}</option>`).join("")}
              </select>
            `
          )
          .join("")}
        <button class="secondary-button" type="button" data-refresh-view="${escapeHtml(view)}">Apply</button>
      </div>
    `;
  }

  function card(label, value, hint) {
    return `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(hint || "")}</small></article>`;
  }

  function dateValue(value) {
    return value ? new Date(value).toLocaleDateString() : "-";
  }

  function moneyText(value) {
    if (value && typeof value === "object" && value.formatted) return value.formatted;
    return rupees(value);
  }

  function sellerMetric(label, value, hint = "") {
    return `
      <article class="seller-detail-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        ${hint ? `<small>${escapeHtml(hint)}</small>` : ""}
      </article>
    `;
  }

  function sellerProfileChip(label, value) {
    return `
      <button class="seller-profile-chip" type="button">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "-")}</strong>
      </button>
    `;
  }

  function sellerLicenseButton(label, value, status = "available") {
    return `
      <button class="seller-license-button ${escapeHtml(status)}" type="button">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value || "Not added")}</strong>
        <small>${escapeHtml(status === "available" ? "Available" : "Missing")}</small>
      </button>
    `;
  }

  function sellerDocumentButtons(documents = []) {
    if (!documents.length) return sellerLicenseButton("Uploaded KYC files", "No documents uploaded", "missing");
    return documents
      .map((document) =>
        sellerLicenseButton(
          `${document.type || "KYC"} document`,
          document.originalName || document.fileName || "Uploaded file",
          "available"
        )
      )
      .join("");
  }

  function sellerOrderRows(rows = []) {
    if (!rows.length) return emptyState("No matching orders yet.");
    return `
      <div class="seller-order-list">
        ${rows
          .map(
            (order) => `
              <button class="seller-order-row" type="button" data-action="order-view" data-order="${escapeHtml(order.orderId)}">
                <span>
                  <strong>${escapeHtml(order.orderId)}</strong>
                  <small>${escapeHtml(dateValue(order.createdAt))}</small>
                </span>
                ${statusBadge(order.status)}
                <b>${escapeHtml(moneyText(order.customerPaid))}</b>
              </button>
            `
          )
          .join("")}
      </div>
    `;
  }

  function sellerProductRows(rows = []) {
    if (!rows.length) return emptyState("No low-stock products.");
    return `
      <div class="seller-product-list">
        ${rows
          .map(
            (product) => `
              <div class="seller-product-row">
                <span>
                  <strong>${escapeHtml(product.title)}</strong>
                  <small>${escapeHtml(product.sku || product.category || "Product")}</small>
                </span>
                <b>${escapeHtml(product.stock ?? 0)} left</b>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function ensureSellerDetailModal() {
    let modal = qs("#sellerDetailOverlay");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "sellerDetailOverlay";
    modal.className = "seller-detail-overlay";
    modal.innerHTML = `
      <section class="seller-detail-modal" role="dialog" aria-modal="true" aria-labelledby="sellerDetailTitle">
        <button class="seller-detail-close" type="button" data-seller-detail-close>Close</button>
        <div id="sellerDetailContent" class="seller-detail-content">${emptyState("Loading seller details...")}</div>
      </section>
    `;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-seller-detail-close]")) {
        closeSellerDetail();
      }
    });
    return modal;
  }

  function closeSellerDetail() {
    qs("#sellerDetailOverlay")?.classList.remove("show");
    document.body.classList.remove("seller-detail-open");
  }

  function renderSellerDetail(data) {
    const seller = data.seller || {};
    const user = seller.userId || {};
    const summary = data.summary || {};
    const products = summary.productSummary || {};
    const bank = seller.bankDetails || {};
    const storeName = seller.businessName || seller.fullName || "Seller";
    const contactName = seller.fullName || user.name || storeName;
    const licenses = [
      { label: "GST license", value: seller.gstNumber },
      { label: "PAN license", value: seller.panNumber },
      { label: "Aadhaar / identity", value: seller.aadhaarNumber },
      { label: "Business type", value: seller.businessType },
      { label: "KYC status", value: seller.kycStatus },
      { label: "Bank verification", value: seller.bankStatus },
    ];
    return `
      <header class="seller-detail-hero">
        <div>
          <span class="eyebrow">Seller Command Window</span>
          <h2 id="sellerDetailTitle">${escapeHtml(storeName)}</h2>
          <p>${escapeHtml(contactName)} ${seller.city ? `- ${escapeHtml(seller.city)}` : ""}</p>
          <div class="seller-detail-badges">
            ${statusBadge(seller.approvalStatus || "pending")}
            ${statusBadge(seller.kycStatus || "pending")}
            ${statusBadge(seller.status || "inactive")}
          </div>
        </div>
        <div class="seller-detail-score">
          <span>Total earned</span>
          <strong>${escapeHtml(moneyText(summary.totalSellerPayout))}</strong>
          <small>${escapeHtml(summary.deliveredOrders || 0)} delivered orders</small>
        </div>
      </header>

      <section class="seller-detail-grid">
        ${sellerMetric("Total sales", moneyText(summary.totalCustomerPaid), "Customer paid")}
        ${sellerMetric("Seller earnings", moneyText(summary.totalSellerPayout), "Before payout status")}
        ${sellerMetric("Orders", summary.totalOrders || 0, `${summary.activeOrders || 0} active now`)}
        ${sellerMetric("Shipment ready", summary.shipmentReadyOrders || 0, `${summary.readyOrders || 0} ready orders`)}
        ${sellerMetric("Pending payout", moneyText(summary.sellerPayoutPending), "Needs finance action")}
        ${sellerMetric("Products", products.total || 0, `${products.active || 0} active, ${products.lowStock || 0} low stock`)}
      </section>

      <section class="seller-agent-grid">
        <article class="seller-agent-card wide">
          <div class="seller-agent-heading">
            <span>Profile Agent</span>
            <strong>Seller profile and KYC</strong>
          </div>
          <div class="seller-profile-chip-grid">
            ${sellerProfileChip("Contact person", contactName)}
            ${sellerProfileChip("Mobile", seller.phone || user.phone)}
            ${sellerProfileChip("Email", seller.email || user.email)}
            ${sellerProfileChip("Business type", seller.businessType)}
            ${sellerProfileChip("GST", seller.gstNumber || "Optional / not added")}
            ${sellerProfileChip("PAN", seller.panNumber)}
            ${sellerProfileChip("Pickup address", [seller.pickupAddress, seller.city, seller.state, seller.pincode].filter(Boolean).join(", "))}
            ${sellerProfileChip("Bank holder", bank.accountHolderName)}
            ${sellerProfileChip("IFSC", bank.ifsc)}
            ${sellerProfileChip("UPI", bank.upiId || "Optional / not added")}
            ${sellerProfileChip("COD", seller.codEnabled ? "Enabled" : "Disabled")}
            ${sellerProfileChip("Online payment", seller.onlinePaymentEnabled ? "Enabled" : "Disabled")}
          </div>
        </article>

        <article class="seller-agent-card">
          <div class="seller-agent-heading">
            <span>Sales Agent</span>
            <strong>Performance</strong>
          </div>
          <div class="seller-mini-stack">
            ${sellerMetric("Delivered sales", moneyText(summary.deliveredCustomerPaid), `${summary.deliveredOrders || 0} completed`)}
            ${sellerMetric("Platform commission", moneyText(summary.totalCommission), `${seller.commissionType || "percentage"} ${seller.commissionValue ?? ""}`)}
          </div>
        </article>

        <article class="seller-agent-card">
          <div class="seller-agent-heading">
            <span>Order Agent</span>
            <strong>Current workload</strong>
          </div>
          <div class="seller-status-pills">
            ${sellerProfileChip("Pending", summary.pendingOrders || 0)}
            ${sellerProfileChip("Ready", summary.readyOrders || 0)}
            ${sellerProfileChip("Packed", summary.shipmentReadyOrders || 0)}
            ${sellerProfileChip("Returned", summary.returnedOrders || 0)}
          </div>
        </article>

        <article class="seller-agent-card wide">
          <div class="seller-agent-heading">
            <span>License Agent</span>
            <strong>Seller licenses and documents</strong>
          </div>
          <div class="seller-license-grid">
            ${licenses
              .map((license) => sellerLicenseButton(license.label, license.value, license.value ? "available" : "missing"))
              .join("")}
            ${sellerDocumentButtons(seller.kycDocuments)}
          </div>
        </article>

        <article class="seller-agent-card">
          <div class="seller-agent-heading">
            <span>Shipment Agent</span>
            <strong>Ready for shipment</strong>
          </div>
          ${sellerOrderRows(data.shipmentReadyOrders || data.readyOrders)}
        </article>

        <article class="seller-agent-card">
          <div class="seller-agent-heading">
            <span>Finance Agent</span>
            <strong>Payout health</strong>
          </div>
          <div class="seller-mini-stack">
            ${sellerMetric("Payout paid", moneyText(summary.sellerPayoutPaid), "Released to seller")}
            ${sellerMetric("Payout status", seller.payoutEnabled ? "Enabled" : "Disabled", seller.payoutStatus || "active")}
          </div>
        </article>

        <article class="seller-agent-card">
          <div class="seller-agent-heading">
            <span>Inventory Agent</span>
            <strong>Low stock alerts</strong>
          </div>
          ${sellerProductRows(data.lowStockProducts)}
        </article>

        <article class="seller-agent-card wide">
          <div class="seller-agent-heading">
            <span>Recent Orders</span>
            <strong>Latest seller activity</strong>
          </div>
          ${sellerOrderRows(data.recentOrders)}
        </article>
      </section>
    `;
  }

  async function openSellerDetail(id) {
    const modal = ensureSellerDetailModal();
    const content = qs("#sellerDetailContent", modal);
    content.innerHTML = emptyState("Loading seller details...");
    modal.classList.add("show");
    document.body.classList.add("seller-detail-open");
    try {
      const data = await api(`/api/admin/sellers/${id}/detail`);
      content.innerHTML = renderSellerDetail(data);
    } catch (error) {
      content.innerHTML = emptyState(error.message);
      toast(error.message, true);
    }
  }

  async function openInvoice(id) {
    try {
      const data = await api(`/api/orders/${encodeURIComponent(id)}/invoice`);
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast("Please allow popups to print the invoice.", true);
        return;
      }
      printWindow.document.open();
      printWindow.document.write(data.invoiceHtml);
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      toast(error.message, true);
    }
  }

  async function openDeliveryLabel(id) {
    try {
      const data = await api(`/api/orders/${encodeURIComponent(id)}/delivery-label`);
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast("Please allow popups to print the delivery label.", true);
        return;
      }
      printWindow.document.open();
      printWindow.document.write(data.labelHtml);
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      toast(error.message, true);
    }
  }

  function financeFilters(data = {}) {
    const sellers = data.sellers || [];
    return `
      <form class="filter-bar finance-filter-bar" data-finance-filters>
        <label>From<input type="date" name="dateFrom"></label>
        <label>To<input type="date" name="dateTo"></label>
        <label>Seller
          <select name="sellerId">
            <option value="">All sellers</option>
            ${sellers.map((seller) => `<option value="${escapeHtml(seller._id)}">${escapeHtml(seller.businessName)}</option>`).join("")}
          </select>
        </label>
        <label>Payment
          <select name="paymentStatus">
            <option value="">All payments</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
        <label>Payout
          <select name="payoutStatus">
            <option value="">All payouts</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label>Order
          <select name="orderStatus">
            <option value="">All orders</option>
            <option value="placed">Placed</option>
            <option value="confirmed">Confirmed</option>
            <option value="packed">Packed</option>
            <option value="shipped">Shipped</option>
            <option value="out_for_delivery">Out for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="returned">Returned</option>
          </select>
        </label>
        <button class="secondary-button" type="submit">Apply</button>
        <button class="secondary-button" type="button" data-export="finance">Export CSV</button>
      </form>
    `;
  }

  function chartBars(rows, labelKey, valueKey) {
    if (!rows?.length) return emptyState("No chart data yet.");
    const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);
    return rows
      .map((row) => {
        const value = Number(row[valueKey]) || 0;
        return `
          <div class="chart-row">
            <span>${escapeHtml(row[labelKey] || row._id || "N/A")}</span>
            <div><i style="width:${Math.max((value / max) * 100, 4)}%"></i></div>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `;
      })
      .join("");
  }

  async function loadDashboard() {
    const data = await api("/api/admin/overview");
    state.cache.dashboard = data;
    const stats = data.stats || {};
    qs("#adminStats").innerHTML = [
      card("Total orders", stats.totalOrders, "All time"),
      card("Today orders", stats.todayOrders, "Since midnight"),
      card("Pending orders", stats.pendingOrders, "Need action"),
      card("Delivered", stats.deliveredOrders, "Completed"),
      card("Total revenue", stats.totalRevenue?.formatted || "Rs. 0", "Paid orders"),
      card("Today revenue", stats.todayRevenue?.formatted || "Rs. 0", "Paid today"),
      card("Monthly revenue", stats.monthlyRevenue?.formatted || "Rs. 0", "Current month"),
      card("Active sellers", stats.activeSellers, `${stats.pendingSellers || 0} pending`),
      card("Customers", stats.totalCustomers, `${stats.lowStockCount || 0} low stock`),
    ].join("");
    qs("#salesChart").innerHTML = chartBars(data.charts?.sales || [], "_id", "orders");
    qs("#categoryChart").innerHTML = chartBars(data.charts?.topCategories || [], "category", "products");
    qs("#recentOrdersTable").innerHTML = table(
      [
        { label: "Order", render: (row) => escapeHtml(row.orderId) },
        { label: "Seller", render: (row) => escapeHtml(row.sellerName) },
        { label: "Status", render: (row) => statusBadge(row.status) },
        { label: "Amount", render: (row) => rupees(row.finance?.totalPaise) },
      ],
      data.recentOrders
    );
    qs("#lowStockTable").innerHTML = table(
      [
        { label: "SKU", render: (row) => escapeHtml(row.sku) },
        { label: "Product", render: (row) => escapeHtml(row.title) },
        { label: "Stock", render: (row) => escapeHtml(row.stock) },
        { label: "Status", render: (row) => statusBadge(row.status) },
      ],
      data.lowStockProducts
    );
  }

  async function listView(view, extraQuery = "") {
    const endpoint = endpoints[view];
    const query = new URLSearchParams({ limit: "30" });
    if (state.search) query.set("search", state.search);
    extraQuery
      .split("&")
      .filter(Boolean)
      .forEach((pair) => {
        const [key, value] = pair.split("=");
        if (value) query.set(key, value);
      });
    return api(`${endpoint}?${query.toString()}`);
  }

  function renderSellers(data) {
    qs('[data-view-panel="sellers"]').innerHTML = panel(
      "Seller approvals and performance",
      filterBar("sellers", [
        { key: "approvalStatus", label: "Approval status", options: ["pending", "approved", "rejected"] },
        { key: "kycStatus", label: "KYC status", options: ["pending", "approved", "rejected"] },
        { key: "status", label: "Store status", options: ["active", "inactive", "blocked"] },
      ]) +
        table(
          [
            { label: "Store", render: (row) => `<strong>${escapeHtml(row.businessName)}</strong><small>${escapeHtml(row.city)}</small>` },
            { label: "Phone", render: (row) => escapeHtml(row.phone) },
            { label: "Approval", render: (row) => statusBadge(row.approvalStatus || "pending") },
            { label: "KYC", render: (row) => statusBadge(row.kycStatus) },
            { label: "Status", render: (row) => statusBadge(row.status) },
            { label: "Commission", render: (row) => `${escapeHtml(row.commissionType || "percentage")} ${escapeHtml(row.commissionValue ?? (Number(row.commissionBps || 0) / 100).toFixed(2))}` },
          ],
          data.items,
          (row) => `
            <button data-action="seller-view" data-id="${row._id}">View details</button>
            <button data-action="seller-approve" data-id="${row._id}">Approve</button>
            <button data-action="seller-reject" data-id="${row._id}">Reject</button>
            <button data-action="seller-toggle" data-id="${row._id}" data-status="${row.status === "active" ? "inactive" : "active"}">${row.status === "active" ? "Deactivate" : "Activate"}</button>
          `
        )
    );
  }

  function renderProducts(data) {
    qs('[data-view-panel="products"]').innerHTML = panel(
      "Product approval and catalogue control",
      filterBar("products", [{ key: "status", label: "Product status", options: ["pending_approval", "approved", "active", "rejected", "blocked"] }]) +
        table(
          [
            { label: "SKU", render: (row) => escapeHtml(row.sku) },
            { label: "Product", render: (row) => `<strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.sellerName)}</small>` },
            { label: "Category", render: (row) => escapeHtml(row.category) },
            { label: "Price", render: (row) => rupees(row.pricePaise) },
            { label: "Stock", render: (row) => escapeHtml(row.stock) },
            { label: "Status", render: (row) => statusBadge(row.status) },
          ],
          data.items,
          (row) => `
            <button data-action="product-approve" data-id="${row._id}">Approve</button>
            <button data-action="product-reject" data-id="${row._id}">Reject</button>
            <button data-action="product-block" data-id="${row._id}">Block</button>
          `
        )
    );
  }

  function renderOrders(data) {
    qs('[data-view-panel="orders"]').innerHTML = panel(
      "Order lifecycle",
      filterBar("orders", [{ key: "status", label: "Order status", options: ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered", "cancelled", "returned"] }]) +
        table(
          [
            { label: "Order", render: (row) => escapeHtml(row.orderId) },
            { label: "Seller", render: (row) => escapeHtml(row.sellerName) },
            { label: "Order status", render: (row) => statusBadge(row.status) },
            { label: "Payment", render: (row) => statusBadge(row.paymentStatus) },
            { label: "Tracking", render: (row) => escapeHtml(row.trackingId || "-") },
            { label: "Invoice", render: (row) => escapeHtml(row.invoiceNumber || `INV-${row.orderId}`) },
            { label: "Amount", render: (row) => rupees(row.customerPaid || row.finance?.totalPaise) },
          ],
          data.items,
          (row) => `
            <button data-action="order-next" data-id="${row._id}" data-status="${nextOrderStatus(row.status)}">Next</button>
            <button data-action="order-cancel" data-id="${row._id}">Cancel</button>
            <button data-action="order-invoice" data-id="${row._id}" data-order="${escapeHtml(row.orderId)}">Invoice</button>
            <button data-action="order-label" data-id="${row._id}" data-order="${escapeHtml(row.orderId)}">Label</button>
          `
        )
    );
  }

  function nextOrderStatus(status) {
    const flow = ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
    const normalized = status === "placed" ? "pending" : status === "accepted" ? "confirmed" : status;
    return flow[Math.min(flow.indexOf(normalized) + 1, flow.length - 1)] || "confirmed";
  }

  function renderPayments(data) {
    const summary = data.summary || {};
    qs('[data-view-panel="payments"]').innerHTML =
      `<div class="admin-stats">
        ${card("Total Customer Payments", summary.customerPayments?.formatted || "Rs. 0", "Product + delivery")}
        ${card("Platform Commission", summary.platformCommission?.formatted || "Rs. 0", "Product total only")}
        ${card("Online Payment Charges", summary.onlinePaymentCharges?.formatted || "Rs. 0", "Deducted before payout")}
        ${card("Payout Pending", summary.sellerPayoutPending?.formatted || "Rs. 0", "Seller queue")}
        ${card("Payout Paid", summary.sellerPayoutPaid?.formatted || "Rs. 0", "Completed")}
        ${card("Delivery Charges", summary.deliveryCharges?.formatted || "Rs. 0", "Separate from commission")}
      </div>` +
      panel(
        "Payment and commission report",
        financeFilters(data) +
        table(
          [
            { label: "Order ID", render: (row) => escapeHtml(row.orderId) },
            { label: "Seller", render: (row) => escapeHtml(row.sellerName) },
            { label: "Product Total", render: (row) => rupees(row.productTotal) },
            { label: "Delivery", render: (row) => rupees(row.deliveryCharge) },
            { label: "Customer Paid", render: (row) => rupees(row.customerPaid) },
            { label: "Commission", render: (row) => `${escapeHtml(row.commissionType)} ${escapeHtml(row.commissionValue)}` },
            { label: "Commission Amount", render: (row) => rupees(row.commissionAmount) },
            { label: "Payment Charge", render: (row) => rupees(row.paymentCharge) },
            { label: "Seller Payout", render: (row) => rupees(row.sellerPayout) },
            { label: "Payment", render: (row) => statusBadge(row.paymentStatus) },
            { label: "Payout", render: (row) => statusBadge(row.payoutStatus) },
            { label: "Transaction", render: (row) => escapeHtml(row.transactionId || "-") },
            { label: "Payout Date", render: (row) => escapeHtml(dateValue(row.payoutDate)) },
          ],
          data.items,
          (row) => `
            <button data-action="payout-paid" data-id="${row._id}">Mark paid</button>
            <button data-action="payout-failed" data-id="${row._id}">Mark failed</button>
            <button data-action="order-view" data-id="${row._id}" data-order="${escapeHtml(row.orderId)}">View</button>
          `
        )
      );
  }

  function renderCustomers(data) {
    qs('[data-view-panel="customers"]').innerHTML = panel(
      "Customer control",
      table(
        [
          { label: "Customer", render: (row) => `<strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.phone)}</small>` },
          { label: "Email", render: (row) => escapeHtml(row.email || "-") },
          { label: "Status", render: (row) => statusBadge(row.status) },
          { label: "Joined", render: (row) => new Date(row.createdAt).toLocaleDateString() },
        ],
        data.items,
        (row) => `<button data-action="customer-toggle" data-id="${row._id}" data-status="${row.status === "blocked" ? "active" : "blocked"}">${row.status === "blocked" ? "Unblock" : "Block"}</button>`
      )
    );
  }

  function renderDelivery(data) {
    qs('[data-view-panel="delivery"]').innerHTML = panel(
      "Delivery tracking",
      table(
        [
          { label: "Order", render: (row) => escapeHtml(row.orderId) },
          { label: "Partner", render: (row) => escapeHtml(row.partnerName || "-") },
          { label: "Tracking", render: (row) => escapeHtml(row.trackingNumber || "-") },
          { label: "Pincode", render: (row) => escapeHtml(row.deliveryPincode || "-") },
          { label: "Same day", render: (row) => (row.sameDayEligible ? "Yes" : "No") },
          { label: "Status", render: (row) => statusBadge(row.status) },
        ],
        data.items,
        (row) => `<button data-action="delivery-next" data-id="${row.orderId}">Move status</button><button data-action="delivery-failed" data-id="${row.orderId}">Failed</button>`
      )
    );
  }

  function renderEmployees(data) {
    qs('[data-view-panel="employees"]').innerHTML = panel(
      "Employee and admin roles",
      table(
        [
          { label: "Name", render: (row) => `<strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.phone)}</small>` },
          { label: "Role", render: (row) => statusBadge(row.role) },
          { label: "Status", render: (row) => statusBadge(row.status) },
          { label: "Created", render: (row) => new Date(row.createdAt).toLocaleDateString() },
        ],
        data.items,
        (row) => `<button data-action="employee-block" data-id="${row._id}">Block</button>`
      )
    );
  }

  function renderReports(data) {
    qs('[data-view-panel="reports"]').innerHTML =
      `<div class="report-actions">
        <button type="button" data-export="orders">Export orders CSV</button>
        <button type="button" data-export="sellers">Export sellers CSV</button>
        <button type="button" data-export="products">Export products CSV</button>
      </div>` +
      panel(
        "Seller-wise sales",
        table(
          [
            { label: "Seller", render: (row) => escapeHtml(row._id || "Unknown") },
            { label: "Orders", render: (row) => escapeHtml(row.orders) },
            { label: "Revenue", render: (row) => rupees(row.revenuePaise) },
          ],
          data.sellerWise
        )
      ) +
      panel(
        "Product-wise stock and price",
        table(
          [
            { label: "SKU", render: (row) => escapeHtml(row.sku) },
            { label: "Product", render: (row) => escapeHtml(row.title) },
            { label: "Category", render: (row) => escapeHtml(row.category) },
            { label: "Stock", render: (row) => escapeHtml(row.stock) },
            { label: "Status", render: (row) => statusBadge(row.status) },
          ],
          data.productWise
        )
      );
  }

  function renderAudit(data) {
    qs('[data-view-panel="audit"]').innerHTML = panel(
      "Admin action audit logs",
      table(
        [
          { label: "Action", render: (row) => escapeHtml(row.action) },
          { label: "Role", render: (row) => statusBadge(row.actorRole) },
          { label: "Entity", render: (row) => `${escapeHtml(row.entityType)} ${escapeHtml(row.entityId)}` },
          { label: "Time", render: (row) => new Date(row.createdAt).toLocaleString() },
        ],
        data.items
      )
    );
  }

  async function loadView(view = state.view) {
    state.view = view;
    qs("#adminPageTitle").textContent = titles[view] || "Admin";
    qsa("[data-admin-view]").forEach((button) => button.classList.toggle("active", button.dataset.adminView === view));
    qsa("[data-view-panel]").forEach((panelNode) => panelNode.classList.toggle("active", panelNode.dataset.viewPanel === view));

    try {
      if (view === "dashboard") return await loadDashboard();
      if (view === "payments") {
        return renderPayments(await api(`/api/admin/finance/report?${state.financeQuery || ""}`));
      }
      if (view === "reports") return renderReports(await api("/api/admin/reports"));
      const data = await listView(view, state.filterQuery || "");
      const renderers = { sellers: renderSellers, products: renderProducts, orders: renderOrders, customers: renderCustomers, delivery: renderDelivery, employees: renderEmployees, audit: renderAudit };
      renderers[view]?.(data);
    } catch (error) {
      qs(`[data-view-panel="${view}"]`).innerHTML = panel(titles[view], emptyState(error.message));
      toast(error.message, true);
    }
  }

  async function patch(path, body) {
    await api(path, { method: "PATCH", body: JSON.stringify(body) });
    toast("Updated successfully.");
    await loadView();
  }

  function bindEvents() {
    qsa("[data-admin-view]").forEach((button) =>
      button.addEventListener("click", () => {
        state.filterQuery = "";
        loadView(button.dataset.adminView);
      })
    );
    qs("#adminRefresh")?.addEventListener("click", () => loadView());
    qs("#adminSearch")?.addEventListener("input", (event) => {
      state.search = event.target.value.trim();
      window.clearTimeout(state.searchTimer);
      state.searchTimer = window.setTimeout(() => loadView(), 350);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeSellerDetail();
    });
    document.addEventListener("click", async (event) => {
      const refreshButton = event.target.closest("[data-refresh-view]");
      if (refreshButton) {
        const panelNode = qs(`[data-view-panel="${refreshButton.dataset.refreshView}"]`);
        const filters = qsa("[data-filter]", panelNode)
          .map((select) => `${select.dataset.filter}=${encodeURIComponent(select.value)}`)
          .join("&");
        state.filterQuery = filters;
        await loadView(refreshButton.dataset.refreshView);
        return;
      }

      const exportButton = event.target.closest("[data-export]");
      if (exportButton) {
        const type = exportButton.dataset.export;
        const query = type === "finance" && state.financeQuery ? `?${state.financeQuery}` : "";
        const response = await fetch(`/api/admin/reports/export/${type}${query}`, {
          headers: { Authorization: `Bearer ${state.token}` },
        });
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `axzen-${type}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }

      const target = event.target.closest("[data-action]");
      if (!target) return;
      const id = target.dataset.id;
      const action = target.dataset.action;
      if (action === "order-view") {
        closeSellerDetail();
        toast(`Open Orders page and search ${target.dataset.order}.`);
        state.search = target.dataset.order || "";
        const searchInput = qs("#adminSearch");
        if (searchInput) searchInput.value = state.search;
        return loadView("orders");
      }
      if (action === "payout-paid") return patch(`/api/admin/finance/orders/${id}/payout`, { payoutStatus: "paid" });
      if (action === "payout-failed") return patch(`/api/admin/finance/orders/${id}/payout`, { payoutStatus: "failed" });
      if (action === "seller-view") return openSellerDetail(id);
      if (action === "seller-approve") return patch(`/api/admin/sellers/${id}/approve`, {});
      if (action === "seller-reject") return patch(`/api/admin/sellers/${id}/reject`, {});
      if (action === "seller-toggle") return patch(`/api/admin/sellers/${id}`, { status: target.dataset.status });
      if (action === "product-approve") return patch(`/api/admin/products/${id}/approve`, {});
      if (action === "product-reject") return patch(`/api/admin/products/${id}/reject`, { rejectionReason: "Rejected by admin" });
      if (action === "product-block") return patch(`/api/admin/products/${id}`, { status: "blocked" });
      if (action === "order-next") return patch(`/api/admin/orders/${id}`, { status: target.dataset.status });
      if (action === "order-cancel") return patch(`/api/admin/orders/${id}`, { status: "cancelled" });
      if (action === "order-invoice") return openInvoice(id || target.dataset.order);
      if (action === "order-label") return openDeliveryLabel(id || target.dataset.order);
      if (action === "customer-toggle") return patch(`/api/admin/customers/${id}`, { status: target.dataset.status });
      if (action === "settlement-paid") return patch(`/api/admin/settlements/${id}`, { status: "paid" });
      if (action === "settlement-hold") return patch(`/api/admin/settlements/${id}`, { status: "hold" });
      if (action === "delivery-next") return patch(`/api/admin/deliveries/${id}`, { status: "out_for_delivery" });
      if (action === "delivery-failed") return patch(`/api/admin/deliveries/${id}`, { status: "failed", failedReason: "Marked failed by admin" });
      if (action === "employee-block") return patch(`/api/admin/employees/${id}`, { status: "blocked" });
    });

    document.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-finance-filters]");
      if (!form) return;
      event.preventDefault();
      const params = new URLSearchParams(new FormData(form));
      [...params.entries()].forEach(([key, value]) => {
        if (!value) params.delete(key);
      });
      state.financeQuery = params.toString();
      await loadView("payments");
    });
  }

  window.AxzenAdminPanel = {
    init({ token, user }) {
      state.token = token;
      state.user = user;
      qs("#adminRoleLabel").textContent = `${user.role.replaceAll("_", " ")} access`;
      if (!["superadmin", "finance"].includes(user.role)) {
        qs('[data-admin-view="payments"]')?.setAttribute("hidden", "hidden");
      }
      bindEvents();
      loadView("dashboard");
    },
  };
})();
