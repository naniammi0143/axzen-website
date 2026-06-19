import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  RecaptchaVerifier,
  getAuth,
  signInWithPhoneNumber,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBfdpqGOahFlX-vFROEFMvVEX9anZV5TG4",
  authDomain: "axzen-c70e1.firebaseapp.com",
  projectId: "axzen-c70e1",
  storageBucket: "axzen-c70e1.firebasestorage.app",
  messagingSenderId: "619605129554",
  appId: "1:619605129554:web:c74e25667a949dac07228b",
  measurementId: "G-X2QK2EGX7P",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const phoneForms = document.querySelectorAll(".firebase-phone-form");
const dashboardSection = document.querySelector("#dashboard");
const dashboardRole = document.querySelector("#dashboardRole");
const dashboardTitle = document.querySelector("#dashboardTitle");
const dashboardSummary = document.querySelector("#dashboardSummary");
const dashboardMetrics = document.querySelector("#dashboardMetrics");
const dashboardPanels = document.querySelector("#dashboardPanels");
const logoutButton = document.querySelector("#logoutButton");
const protectedContent = document.querySelector("#protectedContent");
const loginSection = document.querySelector("#login");
const loginNavLinks = document.querySelectorAll("a[href='#login']");
const sellerBrandText = document.querySelector("#sellerBrandText");
const sellerRegisterLink = document.querySelector("#sellerRegisterLink");
const sellerLoginLink = document.querySelector("#sellerLoginLink");
const sellerAboutLink = document.querySelector("#sellerAboutLink");

loginNavLinks.forEach((link) => {
  link.dataset.loginLabel = link.textContent;
});

const confirmationResults = new Map();
const recaptchaVerifiers = new Map();

function setLoginMessage(form, message, isError = false) {
  const messageElement = form.querySelector(".login-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("error", isError);
  messageElement.style.display = "block";
}

function updateLoginNavigation(isLoggedIn) {
  const dashboardTarget = dashboardSection ? "#dashboard" : "#protectedContent";

  loginNavLinks.forEach((link) => {
    link.textContent = isLoggedIn ? "Dashboard" : link.dataset.loginLabel || "Login";
    link.setAttribute("href", isLoggedIn ? dashboardTarget : "#login");
  });
}

function updateSellerHeader(user = null) {
  if (!sellerBrandText) return;
  const seller = user?.seller || {};
  const isSellerLoggedIn = user?.role === "seller";
  sellerBrandText.textContent = isSellerLoggedIn ? seller.businessName || seller.fullName || "Seller" : "Seller";
  if (sellerRegisterLink) sellerRegisterLink.hidden = isSellerLoggedIn;
  if (sellerLoginLink) sellerLoginLink.hidden = isSellerLoggedIn;
  if (sellerAboutLink) sellerAboutLink.hidden = !isSellerLoggedIn;
}

function formatPhoneNumber(value) {
  const trimmed = value.trim();

  if (trimmed.startsWith("+")) {
    return trimmed;
  }

  return `+91${trimmed.replace(/\D/g, "")}`;
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function orderTotal(order) {
  return order.customerPaid || order.finance?.customerPaidPaise || order.finance?.totalPaise || 0;
}

async function openOrderInvoice(orderId) {
  const token = localStorage.getItem("axzenToken");
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/invoice`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Unable to open invoice.");
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Please allow popups to print the invoice.");
  }
  printWindow.document.open();
  printWindow.document.write(result.invoiceHtml);
  printWindow.document.close();
  printWindow.focus();
}

async function openDeliveryLabel(orderId) {
  const token = localStorage.getItem("axzenToken");
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/delivery-label`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Unable to open delivery label.");
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Please allow popups to print the delivery label.");
  }
  printWindow.document.open();
  printWindow.document.write(result.labelHtml);
  printWindow.document.close();
  printWindow.focus();
}

function renderSellerPaymentSettings(seller = {}) {
  return `
    <article class="dashboard-panel seller-payment-settings">
      <div class="order-invoice-heading">
        <div>
          <p class="eyebrow">Seller Payment Agent</p>
          <h3>Payment options</h3>
        </div>
        <span>${seller.codEnabled ? "COD on" : "COD off"}</span>
      </div>
      <div class="seller-payment-toggle-grid">
        <button type="button" data-seller-setting="codEnabled" data-value="${seller.codEnabled ? "false" : "true"}">
          <span>Cash on Delivery</span>
          <strong>${seller.codEnabled ? "Enabled" : "Disabled"}</strong>
          <small>Seller can allow or stop COD orders.</small>
        </button>
        <button type="button" data-seller-setting="onlinePaymentEnabled" data-value="${seller.onlinePaymentEnabled ? "false" : "true"}">
          <span>Online Payment</span>
          <strong>${seller.onlinePaymentEnabled ? "Enabled" : "Disabled"}</strong>
          <small>Ready for Razorpay/payment gateway integration.</small>
        </button>
      </div>
    </article>
  `;
}

function sellerDetailTile(label, value) {
  return `
    <article>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </article>
  `;
}

function renderSellerWorkspace(user = {}) {
  const seller = user.seller || {};
  const address = [seller.pickupAddress, seller.city, seller.state, seller.pincode].filter(Boolean).join(", ");
  const agreementLabels = [
    ["Marketplace terms", seller.agreements?.marketplaceTerms],
    ["KYC consent", seller.agreements?.kycConsent],
    ["Tax compliance", seller.agreements?.taxCompliance],
    ["Payout policy", seller.agreements?.payoutPolicy],
  ];
  const modules = ["Dashboard", "Products", "Orders", "Shipments", "Payments", "Inventory", "Returns", "Profile", "Support"];
  return `
    <nav class="seller-workspace-tabs" aria-label="Seller workspace sections">
      ${modules.map((item) => `<a href="#seller${item}">${escapeHtml(item)}</a>`).join("")}
    </nav>
    <article class="dashboard-panel seller-about-panel" id="sellerAbout">
      <div class="seller-about-heading">
        <div>
          <p class="eyebrow">About seller</p>
          <h3>${escapeHtml(seller.businessName || "Seller profile")}</h3>
          <p>Registration, KYC, payment and agreement details saved with Axzen.</p>
        </div>
        <span>${escapeHtml(seller.approvalStatus || "pending")}</span>
      </div>
      <div class="seller-detail-grid">
        ${sellerDetailTile("Company / store", seller.businessName)}
        ${sellerDetailTile("Contact person", seller.fullName || user.name)}
        ${sellerDetailTile("Mobile", seller.phone || user.phone)}
        ${sellerDetailTile("Email", seller.email || user.email)}
        ${sellerDetailTile("Business type", seller.businessType)}
        ${sellerDetailTile("GST", seller.gstNumber || "Optional / not added")}
        ${sellerDetailTile("PAN", seller.panNumber)}
        ${sellerDetailTile("Aadhaar", seller.aadhaarNumber || "Optional / not added")}
        ${sellerDetailTile("Pickup address", address)}
        ${sellerDetailTile("Bank status", seller.bankStatus || "saved")}
        ${sellerDetailTile("Payout", seller.payoutEnabled ? "Enabled" : "Pending approval")}
        ${sellerDetailTile("COD", seller.codEnabled ? "Enabled" : "Disabled")}
        ${sellerDetailTile("Online payment", seller.onlinePaymentEnabled ? "Enabled" : "Disabled")}
        ${sellerDetailTile("KYC status", seller.kycStatus || "pending")}
      </div>
      <div class="seller-agreement-summary">
        ${agreementLabels.map(([label, accepted]) => `<span class="${accepted ? "accepted" : ""}">${accepted ? "Yes" : "Pending"} - ${escapeHtml(label)}</span>`).join("")}
      </div>
    </article>
    <section class="seller-module-grid">
      ${modules
        .filter((item) => item !== "Dashboard" && item !== "Profile")
        .map((item) => `<article id="seller${item}"><span>${escapeHtml(item)}</span><strong>${escapeHtml(item)} workspace</strong><small>Manage ${escapeHtml(item.toLowerCase())} from this seller panel.</small></article>`)
        .join("")}
    </section>
  `;
}

function renderOrderInvoicePanel(orders = [], role = "customer") {
  if (role === "seller") {
    return `
      <article class="dashboard-panel order-invoice-panel seller-payout-panel" id="orderInvoicePanel">
        <div class="order-invoice-heading">
          <div>
            <p class="eyebrow">Seller orders</p>
            <h3>Order payout details</h3>
          </div>
          <span>${orders.length} orders</span>
        </div>
        ${
          orders.length
            ? `<div class="seller-payout-list">
                ${orders
                  .map(
                    (order) => `
                      <div class="seller-payout-card">
                        <div class="seller-payout-title">
                          <strong>${escapeHtml(order.orderId)}</strong>
                          <span>${escapeHtml(order.status || "placed")} | payout ${escapeHtml(order.payoutStatus || "pending")}</span>
                        </div>
                        <div class="seller-payout-breakup">
                          <span><small>Product total</small><b>${rupees(order.productTotal)}</b></span>
                          <span><small>Platform fee</small><b>- ${rupees(order.platformFee)}</b></span>
                          <span><small>Online payment charge</small><b>- ${rupees(order.paymentCharge)}</b></span>
                          <span class="net"><small>Seller payout</small><b>${rupees(order.sellerPayout)}</b></span>
                        </div>
                        <button class="seller-label-button" type="button" data-print-label="${escapeHtml(order._id || order.orderId)}">Print delivery label</button>
                      </div>
                    `
                  )
                  .join("")}
              </div>`
            : `<p class="order-invoice-empty">No seller orders yet. Order payout details will appear here after customers place orders.</p>`
        }
      </article>
    `;
  }

  return `
    <article class="dashboard-panel order-invoice-panel" id="orderInvoicePanel">
      <div class="order-invoice-heading">
        <div>
          <p class="eyebrow">${role === "seller" ? "Seller orders" : "Customer orders"}</p>
          <h3>Invoices and bills</h3>
        </div>
        <span>${orders.length} orders</span>
      </div>
      ${
        orders.length
          ? `<div class="order-invoice-list">
              ${orders
                .map(
                  (order) => `
                    <div class="order-invoice-card">
                      <div>
                        <strong>${escapeHtml(order.invoiceNumber || `INV-${order.orderId}`)}</strong>
                        <span>${escapeHtml(order.orderId)}</span>
                      </div>
                      <div>
                        <small>${escapeHtml(order.sellerName || "Axzen seller")}</small>
                        <b>${rupees(orderTotal(order))}</b>
                      </div>
                      <button type="button" data-print-invoice="${escapeHtml(order._id || order.orderId)}">Print invoice</button>
                    </div>
                  `
                )
                .join("")}
            </div>`
          : `<p class="order-invoice-empty">No orders yet. Your printable invoices will appear here after orders are placed.</p>`
      }
    </article>
  `;
}

async function loadRoleOrders(role) {
  if (!["customer", "seller"].includes(role) || !dashboardPanels) return;
  const token = localStorage.getItem("axzenToken");
  const endpoint = role === "seller" ? "/api/orders/seller" : "/api/orders/customer";
  try {
    const [ordersResponse, sellerResponse] = await Promise.all([
      fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
      role === "seller"
        ? fetch("/api/sellers/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          })
        : Promise.resolve(null),
    ]);
    const result = await ordersResponse.json();
    const sellerResult = sellerResponse ? await sellerResponse.json() : null;
    if (!ordersResponse.ok) throw new Error(result.message || "Unable to load orders.");
    document.querySelector("#orderInvoicePanel")?.remove();
    document.querySelector(".seller-payment-settings")?.remove();
    if (role === "seller") {
      dashboardPanels.insertAdjacentHTML("beforeend", renderSellerPaymentSettings(sellerResult?.seller || {}));
    }
    dashboardPanels.insertAdjacentHTML("beforeend", renderOrderInvoicePanel(result.orders || [], role));
  } catch (error) {
    document.querySelector("#orderInvoicePanel")?.remove();
    document.querySelector(".seller-payment-settings")?.remove();
    dashboardPanels.insertAdjacentHTML("beforeend", renderOrderInvoicePanel([], role));
  }
}

async function updateSellerSetting(key, value) {
  const token = localStorage.getItem("axzenToken");
  const response = await fetch("/api/sellers/me", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ [key]: value === "true" }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "Unable to update seller settings.");
  }
  await loadRoleOrders("seller");
}

function getRecaptcha(form) {
  const role = form.dataset.role;
  const containerId = `recaptcha-${role}`;

  if (recaptchaVerifiers.has(role)) {
    return recaptchaVerifiers.get(role);
  }

  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
  });
  recaptchaVerifiers.set(role, verifier);
  return verifier;
}

function renderDashboard(payload) {
  const { user, dashboard } = payload;
  updateSellerHeader(user);

  if (loginSection) {
    loginSection.hidden = true;
  }
  updateLoginNavigation(true);

  if (document.body.classList.contains("admin-page") && window.AxzenAdminPanel) {
    document.body.classList.add("admin-session-active");

    if (protectedContent) {
      protectedContent.hidden = false;
    }

    window.AxzenAdminPanel.init({
      token: localStorage.getItem("axzenToken"),
      user,
    });
    protectedContent?.scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (
    user.role === "seller" &&
    (!user.seller || !user.seller.isActive || user.seller.approvalStatus !== "approved" || user.seller.kycStatus !== "approved")
  ) {
    const sellerStatus = user.seller || {};
    dashboardRole.textContent = "Seller approval status";
    dashboardTitle.textContent = sellerStatus.businessName || "Registration under review";
    dashboardSummary.textContent = "Your seller account is waiting for Axzen admin approval. You can open the seller panel after approval is complete.";
    dashboardMetrics.innerHTML = [
      ["Approval", sellerStatus.approvalStatus || "pending", "Under review"],
      ["KYC", sellerStatus.kycStatus || "pending", "Document check"],
      ["Account", sellerStatus.status || "inactive", "Activates after approval"],
      ["Products", "Locked", "Unlocks after approval"],
    ]
      .map(
        ([label, value, hint]) => `
          <article class="seller-status-card">
            <span>${label}</span>
            <strong>${value}</strong>
            <small>${hint}</small>
          </article>
        `
      )
      .join("");
    dashboardPanels.innerHTML = `
      <article class="dashboard-panel seller-pending-panel">
        <div class="seller-pending-header">
          <span class="status-pill">Waiting for admin approval</span>
          <h3>We are reviewing your seller account</h3>
          <p>Your store is saved. Axzen team will verify KYC and activate your seller panel after approval.</p>
        </div>
        <div class="seller-approval-steps">
          <article class="done"><span>1</span><strong>Registration submitted</strong><small>Seller profile saved</small></article>
          <article class="${sellerStatus.kycStatus === "approved" ? "done" : "active"}"><span>2</span><strong>KYC review</strong><small>Documents under verification</small></article>
          <article><span>3</span><strong>Admin approval</strong><small>Account activation pending</small></article>
          <article><span>4</span><strong>Seller panel</strong><small>Products unlock after approval</small></article>
        </div>
        <div class="seller-pending-actions">
          <a class="primary-button" href="#sellerAbout">About registration</a>
          <button class="secondary-button logout-button" type="button" id="sellerPendingLogout">Logout</button>
        </div>
      </article>
      ${renderSellerWorkspace(user)}
    `;

    dashboardPanels.querySelector("#sellerPendingLogout")?.addEventListener("click", () => logoutButton?.click());

    if (protectedContent) {
      protectedContent.hidden = true;
    }

    if (dashboardSection) {
      dashboardSection.hidden = false;
      dashboardSection.scrollIntoView({ behavior: "smooth" });
    }
    return;
  }

  dashboardRole.textContent = `${user.role} dashboard`;
  dashboardTitle.textContent = dashboard.title;
  dashboardSummary.textContent = dashboard.summary;
  dashboardMetrics.innerHTML = dashboard.metrics
    .map(
      ([label, value]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
  dashboardPanels.innerHTML = dashboard.panels
    .map(
      (panel) => `
        <article class="dashboard-panel">
          <h3>${panel.title}</h3>
          <ul>
            ${panel.items
              .map(([title, detail]) => `<li><strong>${title}</strong><span>${detail}</span></li>`)
              .join("")}
          </ul>
        </article>
      `
    )
    .join("");

  if (user.role === "seller") {
    dashboardPanels.insertAdjacentHTML("afterbegin", renderSellerWorkspace(user));
  }

  if (protectedContent) {
    protectedContent.hidden = false;
  }

  loadRoleOrders(user.role);

  if (dashboardSection) {
    dashboardSection.hidden = false;
    dashboardSection.scrollIntoView({ behavior: "smooth" });
  }
}

async function loadDashboard(role, token) {
  const response = await fetch(`/api/dashboard/${role}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Unable to load dashboard.");
  }

  renderDashboard(result);
}

async function createPhoneSession(role, phone, firebaseToken) {
  const response = await fetch("/api/auth/phone-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role,
      phone,
      firebaseToken,
    }),
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Unable to create login session.");
  }

  localStorage.setItem("axzenToken", result.token);
  localStorage.setItem("axzenRole", result.user.role);
  localStorage.setItem("axzenPhone", result.user.phone);
  if (result.user.seller) {
    localStorage.setItem("axzenSellerStatus", JSON.stringify(result.user.seller));
  } else {
    localStorage.removeItem("axzenSellerStatus");
  }
  await loadDashboard(result.user.role, result.token);
}

phoneForms.forEach((form) => {
  const role = form.dataset.role;
  const sendButton = form.querySelector("[data-send-otp]");
  const verifyButton = form.querySelector("[data-verify-otp]");
  const phoneInput = form.querySelector("[name='phone']");
  const otpInput = form.querySelector("[name='otp']");
  const otpGroup = form.querySelector(".otp-field");

  sendButton.addEventListener("click", async () => {
    const phone = formatPhoneNumber(phoneInput.value);

    if (phone.length < 12) {
      setLoginMessage(form, "Please enter a valid phone number.", true);
      return;
    }

    sendButton.disabled = true;
    sendButton.textContent = "Sending OTP...";
    form.classList.add("is-sending");

    try {
      const confirmationResult = await signInWithPhoneNumber(auth, phone, getRecaptcha(form));
      confirmationResults.set(role, { confirmationResult, phone });
      form.classList.remove("is-sending");
      form.classList.add("otp-sent");
      phoneInput.readOnly = true;
      sendButton.hidden = true;
      otpGroup.hidden = false;
      verifyButton.hidden = false;
      otpInput.focus();
      setLoginMessage(form, `OTP sent to ${phone}.`);
    } catch (error) {
      form.classList.remove("is-sending", "otp-sent");
      sendButton.hidden = false;
      setLoginMessage(form, error.message, true);
      sendButton.disabled = false;
      sendButton.textContent = "Send OTP";
    }
  });

  verifyButton.addEventListener("click", async () => {
    const session = confirmationResults.get(role);
    const otp = otpInput.value.trim();

    if (!session || otp.length < 4) {
      setLoginMessage(form, "Enter the OTP sent to your phone.", true);
      return;
    }

    verifyButton.disabled = true;
    verifyButton.textContent = "Verifying...";

    let credential;

    try {
      credential = await session.confirmationResult.confirm(otp);
    } catch (error) {
      setLoginMessage(form, "OTP is incorrect or expired. Enter the latest SMS OTP.", true);
      verifyButton.disabled = false;
      verifyButton.textContent = "Verify and continue";
      return;
    }

    try {
      const firebaseToken = await credential.user.getIdToken();
      setLoginMessage(form, "Phone verified. Opening your dashboard.");
      await createPhoneSession(role, session.phone, firebaseToken);
    } catch (error) {
      setLoginMessage(form, error.message || "Phone verified, but dashboard login failed.", true);
    } finally {
      verifyButton.disabled = false;
      verifyButton.textContent = "Verify and continue";
    }
  });
});

document.addEventListener("click", async (event) => {
  const invoiceButton = event.target.closest("[data-print-invoice]");
  const labelButton = event.target.closest("[data-print-label]");
  const settingButton = event.target.closest("[data-seller-setting]");
  if (!invoiceButton && !labelButton && !settingButton) return;

  if (settingButton) {
    settingButton.disabled = true;
    try {
      await updateSellerSetting(settingButton.dataset.sellerSetting, settingButton.dataset.value);
    } catch (error) {
      alert(error.message || "Unable to update seller settings.");
      settingButton.disabled = false;
    }
    return;
  }

  if (labelButton) {
    labelButton.disabled = true;
    const originalText = labelButton.textContent;
    labelButton.textContent = "Opening...";
    try {
      await openDeliveryLabel(labelButton.dataset.printLabel);
    } catch (error) {
      alert(error.message || "Unable to open delivery label.");
    } finally {
      labelButton.disabled = false;
      labelButton.textContent = originalText;
    }
    return;
  }

  invoiceButton.disabled = true;
  const originalText = invoiceButton.textContent;
  invoiceButton.textContent = "Opening...";
  try {
    await openOrderInvoice(invoiceButton.dataset.printInvoice);
  } catch (error) {
    alert(error.message || "Unable to open invoice.");
  } finally {
    invoiceButton.disabled = false;
    invoiceButton.textContent = originalText;
  }
});

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
    localStorage.removeItem("axzenPhone");
    localStorage.removeItem("axzenSellerStatus");
    document.body.classList.remove("admin-session-active");

    if (dashboardSection) {
      dashboardSection.hidden = true;
    }

    if (protectedContent) {
      protectedContent.hidden = true;
    }

    if (loginSection) {
      loginSection.hidden = false;
      loginSection.scrollIntoView({ behavior: "smooth" });
    }
    updateLoginNavigation(false);
    updateSellerHeader(null);
  });
}

const savedToken = localStorage.getItem("axzenToken");
const savedRole = localStorage.getItem("axzenRole");
const pageRole = document.querySelector(".firebase-phone-form")?.dataset.role;

if (savedToken && savedRole && savedRole === pageRole) {
  loadDashboard(savedRole, savedToken).catch(() => {
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
    localStorage.removeItem("axzenPhone");
    localStorage.removeItem("axzenSellerStatus");
    updateLoginNavigation(false);
    updateSellerHeader(null);
  });
}
