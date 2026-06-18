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
        { key: "kycStatus", label: "KYC status", options: ["pending", "approved", "rejected"] },
        { key: "status", label: "Store status", options: ["active", "inactive", "blocked"] },
      ]) +
        table(
          [
            { label: "Store", render: (row) => `<strong>${escapeHtml(row.businessName)}</strong><small>${escapeHtml(row.city)}</small>` },
            { label: "Phone", render: (row) => escapeHtml(row.phone) },
            { label: "KYC", render: (row) => statusBadge(row.kycStatus) },
            { label: "Status", render: (row) => statusBadge(row.status) },
            { label: "Commission", render: (row) => `${(Number(row.commissionBps || 0) / 100).toFixed(2)}%` },
          ],
          data.items,
          (row) => `
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
            { label: "Amount", render: (row) => rupees(row.finance?.totalPaise) },
          ],
          data.items,
          (row) => `
            <button data-action="order-next" data-id="${row._id}" data-status="${nextOrderStatus(row.status)}">Next</button>
            <button data-action="order-cancel" data-id="${row._id}">Cancel</button>
            <button data-action="order-invoice" data-id="${row._id}" data-order="${escapeHtml(row.orderId)}">Invoice</button>
          `
        )
    );
  }

  function nextOrderStatus(status) {
    const flow = ["pending", "confirmed", "packed", "shipped", "out_for_delivery", "delivered"];
    const normalized = status === "placed" ? "pending" : status === "accepted" ? "confirmed" : status;
    return flow[Math.min(flow.indexOf(normalized) + 1, flow.length - 1)] || "confirmed";
  }

  function renderPayments(payments, settlements, summary) {
    qs('[data-view-panel="payments"]').innerHTML =
      `<div class="admin-stats">${card("Captured payments", summary.captured?.formatted || "Rs. 0", "Customer paid")} ${card("Refunds", summary.refunds?.formatted || "Rs. 0", "Refund adjustment")} ${card("Payout groups", summary.payouts?.length || 0, "Settlement status")}</div>` +
      panel(
        "Customer payments",
        table(
          [
            { label: "Order", render: (row) => escapeHtml(row.orderId) },
            { label: "Provider", render: (row) => escapeHtml(row.provider) },
            { label: "Amount", render: (row) => rupees(row.amountPaise) },
            { label: "Refund", render: (row) => rupees(row.refundPaise) },
            { label: "Status", render: (row) => statusBadge(row.status) },
          ],
          payments.items
        )
      ) +
      panel(
        "Seller payouts",
        table(
          [
            { label: "Order", render: (row) => escapeHtml(row.orderId) },
            { label: "Gross", render: (row) => rupees(row.grossPaise) },
            { label: "Commission", render: (row) => rupees(row.commissionPaise) },
            { label: "Payout", render: (row) => rupees(row.payoutPaise) },
            { label: "Status", render: (row) => statusBadge(row.status) },
          ],
          settlements.items,
          (row) => `<button data-action="settlement-paid" data-id="${row._id}">Mark paid</button><button data-action="settlement-hold" data-id="${row._id}">Hold</button>`
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
        const [payments, settlements, summary] = await Promise.all([api("/api/admin/payments"), api("/api/admin/settlements"), api("/api/admin/finance/summary")]);
        return renderPayments(payments, settlements, summary);
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
        const response = await fetch(`/api/admin/reports/export/${type}`, {
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
      if (action === "seller-approve") return patch(`/api/admin/sellers/${id}/approve`, {});
      if (action === "seller-reject") return patch(`/api/admin/sellers/${id}/reject`, {});
      if (action === "seller-toggle") return patch(`/api/admin/sellers/${id}`, { status: target.dataset.status });
      if (action === "product-approve") return patch(`/api/admin/products/${id}/approve`, {});
      if (action === "product-reject") return patch(`/api/admin/products/${id}/reject`, { rejectionReason: "Rejected by admin" });
      if (action === "product-block") return patch(`/api/admin/products/${id}`, { status: "blocked" });
      if (action === "order-next") return patch(`/api/admin/orders/${id}`, { status: target.dataset.status });
      if (action === "order-cancel") return patch(`/api/admin/orders/${id}`, { status: "cancelled" });
      if (action === "order-invoice") return patch(`/api/admin/orders/${id}`, { invoiceNumber: `INV-${target.dataset.order || Date.now()}` });
      if (action === "customer-toggle") return patch(`/api/admin/customers/${id}`, { status: target.dataset.status });
      if (action === "settlement-paid") return patch(`/api/admin/settlements/${id}`, { status: "paid" });
      if (action === "settlement-hold") return patch(`/api/admin/settlements/${id}`, { status: "hold" });
      if (action === "delivery-next") return patch(`/api/admin/deliveries/${id}`, { status: "out_for_delivery" });
      if (action === "delivery-failed") return patch(`/api/admin/deliveries/${id}`, { status: "failed", failedReason: "Marked failed by admin" });
      if (action === "employee-block") return patch(`/api/admin/employees/${id}`, { status: "blocked" });
    });
  }

  window.AxzenAdminPanel = {
    init({ token, user }) {
      state.token = token;
      state.user = user;
      qs("#adminRoleLabel").textContent = `${user.role.replaceAll("_", " ")} access`;
      bindEvents();
      loadView("dashboard");
    },
  };
})();
