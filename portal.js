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
const sellerSidebarCompany = document.querySelector("#sellerSidebarCompany");
const sellerTopbarInitial = document.querySelector("#sellerTopbarInitial");
const sellerProfilePopover = document.querySelector("[data-seller-profile-popover]");
let sellerProductsCache = [];
let sellerOrdersCache = [];
let storefrontProductsCache = [];
let sellerOrderPollTimer = null;

const CART_KEY = "axzenCustomerCart";
const ADDRESS_KEY = "axzenCustomerAddress";
const SELLER_OWNER_KEY = "axzenSellerOwnerMode";
const DELIVERY_CHARGE_PAISE = 4000;
const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

const sellerSectionLabels = {
  dashboard: "Dashboard",
  products: "Products",
  orders: "Orders",
  shipments: "Shipments",
  payments: "Payments",
  inventory: "Inventory",
  returns: "Returns",
  employees: "Employees",
  profile: "Profile",
  support: "Support",
};

const sellerHashSections = {
  "#sellerProducts": "products",
  "#orderInvoicePanel": "orders",
  "#sellerShipments": "shipments",
  "#sellerPayments": "payments",
  "#sellerInventory": "inventory",
  "#sellerReturns": "returns",
  "#sellerEmployees": "employees",
  "#sellerAbout": "profile",
  "#sellerSupport": "support",
};

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
  const isOwnerMode = isSellerLoggedIn && localStorage.getItem(SELLER_OWNER_KEY) === "true";
  sellerBrandText.textContent = isSellerLoggedIn ? seller.businessName || seller.fullName || "Seller" : "Seller";
  document.body.classList.toggle("seller-session-active", isSellerLoggedIn);
  document.body.classList.toggle("seller-owner-mode", isOwnerMode);
  if (sellerSidebarCompany) sellerSidebarCompany.textContent = isSellerLoggedIn ? seller.businessName || seller.fullName || "Seller company" : "Seller company";
  if (sellerTopbarInitial) sellerTopbarInitial.textContent = (seller.businessName || seller.fullName || "Seller").trim().charAt(0).toUpperCase();
  if (sellerRegisterLink) sellerRegisterLink.hidden = isSellerLoggedIn;
  if (sellerLoginLink) sellerLoginLink.hidden = isSellerLoggedIn;
  if (sellerAboutLink) sellerAboutLink.hidden = !isSellerLoggedIn;
}

function getSellerSectionFromHash() {
  if (sellerHashSections[window.location.hash]) return sellerHashSections[window.location.hash];
  if (window.location.pathname.toLowerCase().includes("/seller/orders") || document.body.classList.contains("seller-page")) return "orders";
  return "dashboard";
}

function setSellerSection(section = "dashboard", updateHash = false) {
  if (!dashboardSection?.classList.contains("seller-dashboard-app")) return;
  const ownerMode = localStorage.getItem(SELLER_OWNER_KEY) === "true";
  const requestedSection = sellerSectionLabels[section] ? section : "dashboard";
  const cleanSection = ownerMode || requestedSection === "orders" ? requestedSection : "orders";
  dashboardSection.dataset.sellerSection = cleanSection;
  document.querySelector(".seller-dashboard-topbar h1")?.replaceChildren(document.createTextNode(sellerSectionLabels[cleanSection]));
  document.querySelectorAll("[data-seller-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.sellerNav === cleanSection);
  });
  document.querySelectorAll("[data-seller-section]").forEach((node) => {
    node.classList.toggle("is-active", node.dataset.sellerSection === cleanSection);
  });
  if (updateHash) {
    const target = document.querySelector(`[data-seller-nav="${cleanSection}"]`)?.getAttribute("href") || "#dashboard";
    history.replaceState(null, "", target);
  }
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

function getCustomerCart() {
  try {
    const cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(cart) ? cart : [];
  } catch {
    return [];
  }
}

function saveCustomerCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function getSavedCustomerAddress() {
  try {
    return JSON.parse(localStorage.getItem(ADDRESS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveCustomerAddress(address) {
  localStorage.setItem(ADDRESS_KEY, JSON.stringify(address));
}

function getCartTotalPaise(cart = getCustomerCart()) {
  return cart.reduce((total, item) => total + (Number(item.pricePaise) || 0) * (Number(item.quantity) || 1), 0);
}

function getCartItemCount(cart = getCustomerCart()) {
  return cart.reduce((total, item) => total + (Number(item.quantity) || 1), 0);
}

function getCartSellerIds(cart = getCustomerCart()) {
  return [...new Set(cart.map((item) => String(item.sellerId || "")).filter(Boolean))];
}

function cartSupportsCod(cart = getCustomerCart()) {
  return cart.length > 0 && cart.every((item) => item.codEnabled !== false);
}

function cartSupportsOnlinePayment(cart = getCustomerCart()) {
  return cart.length > 0 && cart.every((item) => item.onlinePaymentEnabled !== false);
}

function getCheckoutAvailability(cart = getCustomerCart()) {
  const sellerIds = getCartSellerIds(cart);
  const singleSeller = sellerIds.length === 1;
  return {
    singleSeller,
    codAvailable: singleSeller && cartSupportsCod(cart),
    onlineAvailable: singleSeller && cartSupportsOnlinePayment(cart),
    blockReason:
      sellerIds.length > 1
        ? "Checkout supports one seller per order. Place separate orders for each seller."
        : "This seller has not enabled payment collection.",
  };
}

function setCartMessage(message, isError = false) {
  document.querySelectorAll("[data-cart-message]").forEach((node) => {
    node.textContent = message;
    node.classList.toggle("error", isError);
    node.hidden = !message;
  });
}

function renderCartSummary(showCheckout = false) {
  const summaries = document.querySelectorAll(".cart-summary");
  if (!summaries.length) return;
  const cart = getCustomerCart();
  const itemCount = getCartItemCount(cart);
  const subtotal = getCartTotalPaise(cart);
  const canCheckout = itemCount > 0;

  summaries.forEach((summary) => {
    summary.innerHTML = `
      <h3>Cart</h3>
      <p>${itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"} selected` : "Your cart is empty"}</p>
      <strong>${rupees(subtotal)}</strong>
      ${
        cart.length
          ? `<div class="cart-items">
              ${cart
                .map(
                  (item) => `
                    <div class="cart-line">
                      <span>${escapeHtml(item.title)}</span>
                      <small>${escapeHtml(item.sellerName || "Axzen seller")} | Qty ${Number(item.quantity) || 1}</small>
                      <b>${rupees((Number(item.pricePaise) || 0) * (Number(item.quantity) || 1))}</b>
                      <button type="button" data-cart-remove="${escapeHtml(item.id)}">Remove</button>
                    </div>
                  `
                )
                .join("")}
            </div>`
          : `<div class="mini-list"><span>Add products to continue checkout</span><span>OTP login</span><span>Seller order notification</span></div>`
      }
      <button type="button" data-checkout ${canCheckout ? "" : "disabled"}>Proceed to checkout</button>
      <p class="cart-message" data-cart-message hidden></p>
      ${showCheckout ? renderCheckoutPanel(cart) : ""}
    `;
  });
}

function renderCheckoutPanel(cart = getCustomerCart()) {
  const address = getSavedCustomerAddress();
  const isCustomerLoggedIn = localStorage.getItem("axzenToken") && localStorage.getItem("axzenRole") === "customer";
  const { codAvailable, onlineAvailable, blockReason } = getCheckoutAvailability(cart);
  const canPlaceOrder = codAvailable || onlineAvailable;

  if (!isCustomerLoggedIn) {
    return `
      <div class="checkout-panel">
        <h4>Login required</h4>
        <p>Login with phone OTP to continue checkout and place your order.</p>
        <a class="primary-button" href="#login">Login with phone OTP</a>
      </div>
    `;
  }

  return `
    <form class="checkout-panel" data-checkout-form>
      <div>
        <h4>Delivery address</h4>
        <p>Update address before placing the order.</p>
      </div>
      <div class="checkout-grid">
        <label>Full name<input name="fullName" value="${escapeHtml(address.fullName || "")}" required></label>
        <label>Mobile<input name="phone" type="tel" value="${escapeHtml(address.phone || localStorage.getItem("axzenPhone") || "")}" required></label>
        <label class="wide">Address<textarea name="address" required>${escapeHtml(address.address || "")}</textarea></label>
        <label>City<input name="city" value="${escapeHtml(address.city || "")}" required></label>
        <label>State<input name="state" value="${escapeHtml(address.state || "")}" required></label>
        <label>Pincode<input name="pincode" inputmode="numeric" value="${escapeHtml(address.pincode || "")}" required></label>
      </div>
      <div class="checkout-payment">
        <h4>Payment</h4>
        ${
          codAvailable
            ? `<label class="payment-option selected">
                <input type="radio" name="paymentMethod" value="cod" checked>
                <span>
                  <strong>Cash on Delivery</strong>
                  <small>Available for this seller</small>
                </span>
              </label>`
            : `<p class="payment-note">Cash on Delivery is not available for this seller.</p>`
        }
        <label class="payment-option ${onlineAvailable ? "" : "disabled"}">
          <input type="radio" name="paymentMethod" value="razorpay" ${!codAvailable && onlineAvailable ? "checked" : ""} ${
            onlineAvailable ? "" : "disabled"
          }>
          <span>
            <strong>Online payment</strong>
            <small>${onlineAvailable ? "Pay securely with Razorpay test checkout." : blockReason}</small>
          </span>
        </label>
      </div>
      <div class="checkout-total">
        <span>Product total</span><b>${rupees(getCartTotalPaise(cart))}</b>
        <span>Delivery charge</span><b>${rupees(DELIVERY_CHARGE_PAISE)}</b>
        <strong>Customer paid</strong><strong>${rupees(getCartTotalPaise(cart) + DELIVERY_CHARGE_PAISE)}</strong>
      </div>
      <button type="submit" data-place-order ${canPlaceOrder ? "" : "disabled"}>${codAvailable ? "Place order" : "Pay online and place order"}</button>
    </form>
  `;
}

function addProductToCart(productId) {
  const product = storefrontProductsCache.find((item) => String(item.id) === String(productId));
  if (!product) {
    setCartMessage("Product details are still loading. Try again in a moment.", true);
    return;
  }

  const cart = getCustomerCart();
  const existing = cart.find((item) => String(item.id) === String(product.id));
  if (existing) {
    existing.quantity = Math.min((Number(existing.quantity) || 1) + 1, 10);
  } else {
    cart.push({
      id: product.id,
      productId: product.id,
      sellerId: product.sellerId,
      sellerName: product.sellerName,
      sku: product.sku,
      title: product.title,
      pricePaise: product.pricePaise,
      codEnabled: product.codEnabled !== false,
      onlinePaymentEnabled: product.onlinePaymentEnabled !== false,
      quantity: 1,
    });
  }
  saveCustomerCart(cart);
  renderCartSummary(false);
  setCartMessage(`${product.title || "Product"} added to cart.`);
}

function buildOrderItems(cart = getCustomerCart()) {
  return cart.map((item) => ({
    productId: item.productId || item.id,
    sellerId: item.sellerId,
    sku: item.sku,
    title: item.title,
    pricePaise: item.pricePaise,
    quantity: item.quantity,
  }));
}

function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Razorpay checkout.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Unable to load Razorpay checkout."));
    document.head.appendChild(script);
  });
}

async function collectRazorpayPayment({ token, payload, shippingAddress }) {
  const response = await fetch("/api/orders/razorpay/order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Unable to start online payment.");

  if (result.mockPayment) {
    return {
      razorpayOrderId: result.razorpayOrder?.id || `mock_order_${Date.now()}`,
      razorpayPaymentId: `mock_pay_${Date.now()}`,
      razorpaySignature: "mock_signature",
      mockPayment: true,
    };
  }

  await loadRazorpayCheckout();

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: result.keyId,
      amount: result.amountPaise,
      currency: "INR",
      name: "Axzen",
      description: "Axzen order payment",
      order_id: result.razorpayOrder?.id,
      prefill: {
        name: shippingAddress.fullName || "",
        contact: shippingAddress.phone || localStorage.getItem("axzenPhone") || "",
      },
      theme: {
        color: "#0b2f57",
      },
      handler(payment) {
        resolve({
          razorpayOrderId: payment.razorpay_order_id,
          razorpayPaymentId: payment.razorpay_payment_id,
          razorpaySignature: payment.razorpay_signature,
        });
      },
      modal: {
        ondismiss() {
          reject(new Error("Online payment was cancelled."));
        },
      },
    });
    checkout.open();
  });
}

async function placeCustomerOrder(form) {
  const cart = getCustomerCart();
  const token = localStorage.getItem("axzenToken");
  if (!cart.length || !token) return;

  const formData = new FormData(form);
  const shippingAddress = {
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    city: formData.get("city"),
    state: formData.get("state"),
    pincode: formData.get("pincode"),
  };
  saveCustomerAddress(shippingAddress);
  const paymentMethod = formData.get("paymentMethod") || "cod";
  const orderPayload = {
    items: buildOrderItems(cart),
    deliveryCharge: DELIVERY_CHARGE_PAISE / 100,
    paymentMethod,
    shippingAddress,
  };

  const submitButton = form.querySelector("[data-place-order]");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = paymentMethod === "razorpay" ? "Opening payment..." : "Placing order...";
  }

  try {
    if (paymentMethod === "razorpay") {
      const payment = await collectRazorpayPayment({ token, payload: orderPayload, shippingAddress });
      Object.assign(orderPayload, payment, { paymentMethod: "razorpay" });
      if (submitButton) submitButton.textContent = "Payment done. Placing order...";
    }

    const response = await fetch("/api/customer/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(orderPayload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to place order.");
    saveCustomerCart([]);
    renderCartSummary(false);
    setCartMessage(
      paymentMethod === "razorpay"
        ? `Payment successful. Order placed. ${result.order?.statusLabel || "Seller accepted order"}.`
        : `Order placed. ${result.order?.statusLabel || "Seller accepted order"}.`
    );
    await loadRoleOrders("customer");
  } catch (error) {
    setCartMessage(error.message || "Unable to place order.", true);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Place order";
    }
  }
}

function renderStorefrontProduct(product) {
  const image = product.image || product.images?.[0] || "";
  const title = product.title || product.name || "Product";
  const sellerName = product.sellerName || product.seller || "Axzen seller";
  const category = product.category || "Product";
  return `
    <article class="commerce-product">
      ${
        image
          ? `<img class="commerce-product-image commerce-product-photo" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">`
          : `<div class="commerce-product-image">${escapeHtml(category)}</div>`
      }
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(sellerName)} | ${escapeHtml(category)}</p>
      <strong>${escapeHtml(product.price || "Rs. 0")}</strong>
      <button type="button" data-add-cart="${escapeHtml(product.id)}">Add to cart</button>
    </article>
  `;
}

async function loadStorefrontCatalog() {
  const grid = document.querySelector(".commerce-products");
  if (!grid) return;
  try {
    const response = await fetch("/api/customer/catalog");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load products.");
    if (result.products?.length) {
      storefrontProductsCache = result.products;
      grid.innerHTML = result.products.map(renderStorefrontProduct).join("");
    }
  } catch (error) {
    console.warn(error.message || "Customer catalog unavailable.");
  } finally {
    renderCartSummary(false);
  }
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
    <article class="dashboard-panel seller-payment-settings" id="sellerPayments" data-seller-section="payments">
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
  const modules = [
    ["sellerShipments", "Shipments", "Delivery labels and shipment readiness"],
    ["sellerInventory", "Inventory", "Stock, low-stock alerts and product availability"],
    ["sellerReturns", "Returns", "Return requests, refund status and issue handling"],
    ["sellerEmployees", "Employees", "Add seller staff, assign work and manage access"],
    ["sellerSupport", "Support", "Admin support and seller helpdesk"],
  ];
  return `
    <article class="dashboard-panel seller-about-panel" id="sellerAbout" data-seller-section="profile">
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
        .map(([id, title, detail]) => `<article class="dashboard-panel seller-module-card" id="${escapeHtml(id)}" data-seller-section="${escapeHtml(title.toLowerCase())}"><span>${escapeHtml(title)}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></article>`)
        .join("")}
    </section>
  `;
}

function renderSellerProductManager(products = []) {
  return `
    <article class="dashboard-panel seller-product-manager" id="sellerProducts" data-seller-section="products">
      <div class="seller-about-heading">
        <div>
          <p class="eyebrow">Products</p>
          <h3>Product catalogue</h3>
          <p>Search products like the customer app. Add new products with up to 5 Cloudinary images.</p>
        </div>
        <div class="seller-product-actions">
          <input type="search" data-seller-product-search placeholder="Search products, SKU, category">
          <button type="button" data-toggle-product-form>Add product</button>
          <span>${products.length} products</span>
        </div>
      </div>
      <form class="seller-product-form" data-seller-product-create hidden>
        <label>Product title<input name="title" required placeholder="Product name"></label>
        <label>SKU<input name="sku" required placeholder="SKU-001"></label>
        <label>Category
          <select name="categoryChoice" data-product-category-choice required>
            <option value="">Select category</option>
            <option value="Grocery">Grocery</option>
            <option value="Fashion">Fashion</option>
            <option value="Electronics">Electronics</option>
            <option value="Home">Home</option>
            <option value="Beauty">Beauty</option>
            <option value="Food">Food</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label class="seller-other-category" hidden>Other category<input name="categoryOther" placeholder="Enter category"></label>
        <label>Price<input name="price" type="number" min="0" step="0.01" required placeholder="999"></label>
        <label>Stock<input name="stock" type="number" min="0" step="1" placeholder="10"></label>
        <label class="seller-product-file">Product images
          <input name="productImages" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple required>
          <small>Maximum 5 images, 5MB each.</small>
        </label>
        <button type="submit">Submit product for approval</button>
      </form>
      <div class="seller-product-upload-message" data-seller-product-message aria-live="polite"></div>
      <div class="seller-catalog-grid" data-seller-product-list>
        ${renderSellerProductList(products)}
      </div>
    </article>
  `;
}

function renderSellerProductList(products = []) {
  if (!products.length) return `<p class="order-invoice-empty">No products uploaded yet.</p>`;
  return products
    .map((product) => {
      const images = product.images || [];
      return `
        <article class="customer-product-card seller-catalog-card">
          ${
            images[0]
              ? `<img class="product-image product-photo" src="${escapeHtml(images[0])}" alt="${escapeHtml(product.title)}" loading="lazy">`
              : `<div class="product-image">${escapeHtml(product.category || "Product")}</div>`
          }
          <div class="product-info">
            <span>${escapeHtml(product.sellerName || "Your store")}</span>
            <strong>${escapeHtml(product.title)}</strong>
            <p>${escapeHtml(product.sku)} | ${escapeHtml(product.category || "General")}</p>
            <b>${rupees(product.pricePaise)}</b>
            <small>${escapeHtml(product.status || "pending_approval")} | stock ${escapeHtml(product.stock ?? 0)} | ${images.length} image${images.length === 1 ? "" : "s"}</small>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadSellerProducts() {
  if (!dashboardPanels || !document.querySelector("#sellerProducts")) return;
  const token = localStorage.getItem("axzenToken");
  try {
    const response = await fetch("/api/seller/products", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load products.");
    const list = document.querySelector("[data-seller-product-list]");
    const count = document.querySelector("#sellerProducts .seller-product-actions > span");
    sellerProductsCache = result.products || [];
    if (list) list.innerHTML = renderSellerProductList(sellerProductsCache);
    if (count) count.textContent = `${result.products?.length || 0} products`;
  } catch (error) {
    const message = document.querySelector("[data-seller-product-message]");
    if (message) {
      message.textContent = error.message || "Unable to load products.";
      message.classList.add("error");
    }
  }
}

function filterSellerProducts(term = "") {
  const list = document.querySelector("[data-seller-product-list]");
  if (!list) return;
  const clean = term.trim().toLowerCase();
  const filtered = clean
    ? sellerProductsCache.filter((product) =>
        [product.title, product.sku, product.category, product.status].some((value) => String(value || "").toLowerCase().includes(clean))
      )
    : sellerProductsCache;
  list.innerHTML = renderSellerProductList(filtered);
}

function playSellerOrderNotification(orderCount = 1) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const beep = (delay, frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.34);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 0.36);
    };
    beep(0, 880);
    if (orderCount > 1) beep(0.42, 1040);
  } catch (error) {
    console.warn("Seller notification sound unavailable.");
  }
}

function notifyNewSellerOrders(orders = []) {
  const latestOrderTime = orders.reduce((latest, order) => Math.max(latest, new Date(order.createdAt || order.updatedAt || 0).getTime()), 0);
  const storageKey = "axzenSellerLastOrderSeen";
  const previous = Number(localStorage.getItem(storageKey) || 0);
  const newOrders = orders.filter((order) => new Date(order.createdAt || order.updatedAt || 0).getTime() > previous);
  if (previous && newOrders.length) playSellerOrderNotification(newOrders.length);
  if (latestOrderTime) localStorage.setItem(storageKey, String(latestOrderTime));
}

function stopSellerOrderPolling() {
  if (sellerOrderPollTimer) {
    window.clearInterval(sellerOrderPollTimer);
    sellerOrderPollTimer = null;
  }
}

function startSellerOrderPolling() {
  stopSellerOrderPolling();
  sellerOrderPollTimer = window.setInterval(() => {
    if (localStorage.getItem("axzenRole") === "seller" && !dashboardSection?.hidden) {
      loadRoleOrders("seller");
    }
  }, 20000);
}

const sellerOrderTabs = [
  ["new", "New"],
  ["accepted", "Accepted"],
  ["packed", "Packed"],
  ["shipped", "Shipped"],
  ["delivered", "Delivered"],
  ["cancelled", "Cancelled"],
  ["returned", "Returned"],
];

function normalizeSellerOrderStatus(status = "") {
  if (["placed", "pending"].includes(status)) return "new";
  if (["confirmed", "accepted"].includes(status)) return "accepted";
  return status || "new";
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function sellerOrderFirstItem(order = {}) {
  return order.items?.[0] || {};
}

function sellerOrderCustomerName(order = {}) {
  return order.customer?.name || order.shippingAddress?.fullName || "Customer";
}

function sellerOrderProductTitle(order = {}) {
  return sellerOrderFirstItem(order).title || "Product";
}

function sellerStatusBadge(value = "") {
  const normalized = normalizeSellerOrderStatus(value);
  return `<span class="seller-status-badge ${escapeHtml(normalized)}">${escapeHtml(normalized.replace(/_/g, " "))}</span>`;
}

function sellerPaymentBadge(order = {}) {
  const status = order.paymentStatus || "pending";
  const label = status === "pending" && order.paymentMethod === "cod" ? "COD pending" : status;
  return `<span class="seller-status-badge payment-${escapeHtml(status)}">${escapeHtml(label.replace(/_/g, " "))}</span>`;
}

function getSellerOrderActions(order = {}) {
  const status = normalizeSellerOrderStatus(order.status);
  if (status === "new") {
    return [
      ["accept", "Accept"],
      ["reject", "Reject"],
    ];
  }
  if (status === "accepted") return [["pack", "Pack Order"]];
  if (status === "packed") return [["pack-and-ship", "Packing Complete"]];
  if (status === "shipped") return [["track", "Track Shipment"]];
  if (status === "delivered") return [["settlement", "View Settlement"]];
  return [];
}

function getSellerFilteredOrders() {
  const panel = document.querySelector("#orderInvoicePanel");
  const activeTab = panel?.dataset.activeTab || "new";
  const search = (panel?.querySelector("[data-seller-order-search]")?.value || "").trim().toLowerCase();
  const paymentStatus = panel?.querySelector("[data-seller-payment-filter]")?.value || "";
  const orderStatus = panel?.querySelector("[data-seller-status-filter]")?.value || "";
  const date = panel?.querySelector("[data-seller-date-filter]")?.value || "";

  return sellerOrdersCache.filter((order) => {
    const tabMatch = activeTab === "all" || normalizeSellerOrderStatus(order.status) === activeTab;
    const paymentMatch = !paymentStatus || order.paymentStatus === paymentStatus;
    const statusMatch = !orderStatus || normalizeSellerOrderStatus(order.status) === orderStatus;
    const dateMatch = !date || new Date(order.createdAt).toISOString().slice(0, 10) === date;
    const haystack = [order.orderId, sellerOrderCustomerName(order), sellerOrderProductTitle(order), sellerOrderFirstItem(order).sku]
      .join(" ")
      .toLowerCase();
    return tabMatch && paymentMatch && statusMatch && dateMatch && (!search || haystack.includes(search));
  });
}

function renderSellerOrdersRows() {
  const tbody = document.querySelector("[data-seller-orders-body]");
  const empty = document.querySelector("[data-seller-orders-empty]");
  if (!tbody) return;
  const orders = getSellerFilteredOrders();

  if (empty) empty.hidden = orders.length > 0;
  tbody.innerHTML = orders
    .map((order) => {
      const item = sellerOrderFirstItem(order);
      const actions = getSellerOrderActions(order)
        .map(([action, label]) => `<button type="button" data-seller-order-action="${action}" data-order-id="${escapeHtml(order._id || order.orderId)}">${escapeHtml(label)}</button>`)
        .join("");
      return `
        <tr>
          <td><button class="seller-order-link" type="button" data-order-details="${escapeHtml(order._id || order.orderId)}">${escapeHtml(order.orderId)}</button></td>
          <td>${formatDate(order.createdAt)}</td>
          <td>${escapeHtml(sellerOrderCustomerName(order))}</td>
          <td>${escapeHtml(sellerOrderProductTitle(order))}</td>
          <td>${Number(item.quantity) || 1}</td>
          <td>${rupees(order.customerPaid || order.productTotal)}</td>
          <td>${sellerPaymentBadge(order)}</td>
          <td>${sellerStatusBadge(order.status)}</td>
          <td>${sellerStatusBadge(order.shipmentStatus || order.deliveryStatus || "created")}</td>
          <td><div class="seller-order-actions">${actions}<button type="button" data-order-details="${escapeHtml(order._id || order.orderId)}">Details</button></div></td>
        </tr>
      `;
    })
    .join("");
}

function renderSellerOrderDrawer(order = {}) {
  const item = sellerOrderFirstItem(order);
  const address = order.shippingAddress || {};
  const timeline = order.timeline?.length
    ? order.timeline
    : [
        {
          status: order.status || "accepted",
          note: "Order received in seller panel.",
          at: order.createdAt,
        },
      ];

  return `
    <aside class="seller-order-drawer is-open" data-seller-order-drawer>
      <div class="seller-order-drawer-card">
        <button class="seller-drawer-close" type="button" data-close-order-drawer>Close</button>
        <p class="eyebrow">Order details</p>
        <h3>${escapeHtml(order.orderId)}</h3>
        <div class="seller-drawer-grid">
          <section>
            <h4>Customer details</h4>
            <p>${escapeHtml(sellerOrderCustomerName(order))}</p>
            <p>${escapeHtml(order.customer?.phone || address.phone || "-")}</p>
            <p>${escapeHtml([address.address, address.city, address.state, address.pincode].filter(Boolean).join(", ") || "-")}</p>
          </section>
          <section>
            <h4>Product details</h4>
            <p>${escapeHtml(item.title || "Product")}</p>
            <p>SKU: ${escapeHtml(item.sku || "-")} | Qty: ${Number(item.quantity) || 1}</p>
            <p>${rupees((Number(item.pricePaise) || 0) * (Number(item.quantity) || 1))}</p>
          </section>
          <section>
            <h4>Payment details</h4>
            <p>Method: ${escapeHtml(order.paymentMethod || "-")}</p>
            <p>Status: ${escapeHtml(order.paymentStatus || "pending")}</p>
            <p>Transaction: ${escapeHtml(order.transactionId || "-")}</p>
            <p>Amount: ${rupees(order.customerPaid || order.productTotal)}</p>
          </section>
          <section>
            <h4>Shipment details</h4>
            <p>Status: ${escapeHtml(order.shipmentStatus || order.deliveryStatus || "created")}</p>
            <p>Courier: ${escapeHtml(order.courierName || "-")}</p>
            <p>AWB: ${escapeHtml(order.awbNumber || "-")}</p>
            ${order.trackingUrl ? `<a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Open tracking</a>` : ""}
          </section>
        </div>
        <div class="seller-order-timeline">
          <h4>Order timeline</h4>
          ${timeline
            .map(
              (event) => `
                <div>
                  <strong>${escapeHtml(event.status)}</strong>
                  <span>${escapeHtml(event.note || "")}</span>
                  <small>${formatDate(event.at)}</small>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    </aside>
  `;
}

function openSellerOrderDrawer(orderId) {
  const order = sellerOrdersCache.find((entry) => String(entry._id || entry.orderId) === String(orderId));
  if (!order) return;
  document.querySelector("[data-seller-order-drawer]")?.remove();
  document.body.insertAdjacentHTML("beforeend", renderSellerOrderDrawer(order));
}

function showSellerOrdersToast(message, isError = false) {
  const panel = document.querySelector("#orderInvoicePanel");
  const toast = panel?.querySelector("[data-seller-order-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 3500);
}

function renderOrderInvoicePanel(orders = [], role = "customer") {
  if (role === "seller") {
    sellerOrdersCache = orders;
    const counts = sellerOrderTabs.reduce((acc, [key]) => {
      acc[key] = orders.filter((order) => normalizeSellerOrderStatus(order.status) === key).length;
      return acc;
    }, {});
    const totalAmount = orders.reduce((sum, order) => sum + Number(order.customerPaid || order.productTotal || 0), 0);
    const pendingCount = orders.filter((order) => ["new", "accepted"].includes(normalizeSellerOrderStatus(order.status))).length;
    return `
      <article class="dashboard-panel seller-orders-page" id="orderInvoicePanel" data-seller-section="orders" data-active-tab="new">
        <div class="seller-orders-header">
          <div>
            <p class="eyebrow">Seller orders</p>
            <h3>Orders</h3>
            <p>Accept, pack, ship and track seller orders from one workspace.</p>
          </div>
          <div class="seller-orders-kpis">
            <span><small>Total orders</small><strong>${orders.length}</strong></span>
            <span><small>Open orders</small><strong>${pendingCount}</strong></span>
            <span><small>Sales value</small><strong>${rupees(totalAmount)}</strong></span>
          </div>
        </div>
        <div class="seller-new-order-alert" ${pendingCount ? "" : "hidden"}>
          <strong>${pendingCount} order${pendingCount === 1 ? "" : "s"} need attention</strong>
          <span>New customer orders are automatically accepted and ready for packing.</span>
        </div>
        <div class="seller-order-tabs">
          ${sellerOrderTabs
            .map(
              ([key, label]) => `
                <button type="button" class="${key === "new" ? "active" : ""}" data-seller-order-tab="${key}">
                  ${escapeHtml(label)} <span>${counts[key] || 0}</span>
                </button>
              `
            )
            .join("")}
        </div>
        <div class="seller-order-filters">
          <input type="search" data-seller-order-search placeholder="Search order ID, customer, product">
          <input type="date" data-seller-date-filter>
          <select data-seller-payment-filter>
            <option value="">Payment status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
          <select data-seller-status-filter>
            <option value="">Order status</option>
            ${sellerOrderTabs.map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`).join("")}
          </select>
          <button type="button" data-clear-seller-order-filters>Clear</button>
        </div>
        <div class="seller-order-toast" data-seller-order-toast hidden></div>
        <div class="seller-orders-table-wrap">
          <table class="seller-orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Amount</th>
                <th>Payment Status</th>
                <th>Order Status</th>
                <th>Shipment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody data-seller-orders-body></tbody>
          </table>
        </div>
        <div class="seller-orders-empty" data-seller-orders-empty hidden>
          No report data found for selected filters.
        </div>
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
  const endpoint = role === "seller" ? "/api/seller/orders" : "/api/orders/customer";
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
      notifyNewSellerOrders(result.orders || []);
      dashboardPanels.insertAdjacentHTML("beforeend", renderSellerPaymentSettings(sellerResult?.seller || {}));
    }
    dashboardPanels.insertAdjacentHTML("beforeend", renderOrderInvoicePanel(result.orders || [], role));
    if (role === "seller") {
      renderSellerOrdersRows();
      setSellerSection(getSellerSectionFromHash());
    }
  } catch (error) {
    document.querySelector("#orderInvoicePanel")?.remove();
    document.querySelector(".seller-payment-settings")?.remove();
    dashboardPanels.insertAdjacentHTML("beforeend", renderOrderInvoicePanel([], role));
    if (role === "seller") {
      renderSellerOrdersRows();
      setSellerSection(getSellerSectionFromHash());
    }
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

async function updateSellerOrderAction(orderId, action) {
  const token = localStorage.getItem("axzenToken");
  const response = await fetch(`/api/seller/orders/${encodeURIComponent(orderId)}/${encodeURIComponent(action)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason: "Rejected by seller." }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || "Unable to update order.");
  return result;
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
  if (user.role !== "seller") stopSellerOrderPolling();

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
    stopSellerOrderPolling();
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
        <article class="dashboard-panel" ${user.role === "seller" ? 'data-seller-section="dashboard"' : ""}>
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
    dashboardPanels.insertAdjacentHTML("afterbegin", renderSellerProductManager());
  }

  if (protectedContent) {
    protectedContent.hidden = false;
  }

  loadRoleOrders(user.role);
  if (user.role === "seller") {
    setSellerSection(getSellerSectionFromHash());
    loadSellerProducts();
    startSellerOrderPolling();
  }

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
  if (result.user.role === "seller") {
    localStorage.removeItem(SELLER_OWNER_KEY);
  }
  if (result.user.seller) {
    localStorage.setItem("axzenSellerStatus", JSON.stringify(result.user.seller));
  } else {
    localStorage.removeItem("axzenSellerStatus");
  }
  await loadDashboard(result.user.role, result.token);
  if (result.user.role === "customer") renderCartSummary(true);
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
  const addCartButton = event.target.closest("[data-add-cart]");
  if (addCartButton) {
    addProductToCart(addCartButton.dataset.addCart);
    return;
  }

  const removeCartButton = event.target.closest("[data-cart-remove]");
  if (removeCartButton) {
    const nextCart = getCustomerCart().filter((item) => String(item.id) !== String(removeCartButton.dataset.cartRemove));
    saveCustomerCart(nextCart);
    renderCartSummary(false);
    setCartMessage("Product removed from cart.");
    return;
  }

  const checkoutButton = event.target.closest("[data-checkout]");
  if (checkoutButton) {
    renderCartSummary(true);
    if (!(localStorage.getItem("axzenToken") && localStorage.getItem("axzenRole") === "customer")) {
      setCartMessage("Login with phone OTP to continue checkout.", true);
      loginSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  const profileMenuButton = event.target.closest("[data-seller-profile-menu]");
  if (profileMenuButton) {
    if (sellerProfilePopover) sellerProfilePopover.hidden = !sellerProfilePopover.hidden;
    return;
  }

  const ownerLoginButton = event.target.closest("[data-login-owner]");
  if (ownerLoginButton) {
    localStorage.setItem(SELLER_OWNER_KEY, "true");
    document.body.classList.add("seller-owner-mode");
    if (sellerProfilePopover) sellerProfilePopover.hidden = true;
    setSellerSection("dashboard", true);
    dashboardSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const sellerLogoutButton = event.target.closest("[data-seller-logout]");
  if (sellerLogoutButton) {
    logoutButton?.click();
    return;
  }

  const orderTab = event.target.closest("[data-seller-order-tab]");
  if (orderTab) {
    const panel = document.querySelector("#orderInvoicePanel");
    if (panel) panel.dataset.activeTab = orderTab.dataset.sellerOrderTab;
    document.querySelectorAll("[data-seller-order-tab]").forEach((tab) => tab.classList.toggle("active", tab === orderTab));
    renderSellerOrdersRows();
    return;
  }

  const clearOrderFilters = event.target.closest("[data-clear-seller-order-filters]");
  if (clearOrderFilters) {
    const panel = document.querySelector("#orderInvoicePanel");
    panel?.querySelectorAll("input, select").forEach((field) => {
      field.value = "";
    });
    renderSellerOrdersRows();
    return;
  }

  const orderDetails = event.target.closest("[data-order-details]");
  if (orderDetails) {
    openSellerOrderDrawer(orderDetails.dataset.orderDetails);
    return;
  }

  const drawerClose = event.target.closest("[data-close-order-drawer]");
  if (drawerClose) {
    document.querySelector("[data-seller-order-drawer]")?.remove();
    return;
  }

  const orderAction = event.target.closest("[data-seller-order-action]");
  if (orderAction) {
    const action = orderAction.dataset.sellerOrderAction;
    const orderId = orderAction.dataset.orderId;
    if (action === "track") {
      const order = sellerOrdersCache.find((entry) => String(entry._id || entry.orderId) === String(orderId));
      if (order?.trackingUrl) window.open(order.trackingUrl, "_blank", "noopener,noreferrer");
      else showSellerOrdersToast("Tracking URL is not available yet.", true);
      return;
    }
    if (action === "settlement") {
      openSellerOrderDrawer(orderId);
      showSellerOrdersToast("Settlement details are shown inside order details.");
      return;
    }
    orderAction.disabled = true;
    orderAction.textContent = "Updating...";
    try {
      await updateSellerOrderAction(orderId, action);
      showSellerOrdersToast("Order status updated successfully.");
      await loadRoleOrders("seller");
    } catch (error) {
      showSellerOrdersToast(error.message || "Unable to update order.", true);
      orderAction.disabled = false;
    }
    return;
  }

  const sellerNav = event.target.closest("[data-seller-nav]");
  if (sellerNav) {
    event.preventDefault();
    setSellerSection(sellerNav.dataset.sellerNav, true);
    dashboardSection?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const productFormToggle = event.target.closest("[data-toggle-product-form]");
  if (productFormToggle) {
    const form = document.querySelector("[data-seller-product-create]");
    if (form) {
      form.hidden = !form.hidden;
      productFormToggle.textContent = form.hidden ? "Add product" : "Close form";
    }
    return;
  }

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

document.addEventListener("input", (event) => {
  const productSearch = event.target.closest("[data-seller-product-search]");
  if (productSearch) {
    filterSellerProducts(productSearch.value);
  }

  if (event.target.closest("[data-seller-order-search]")) {
    renderSellerOrdersRows();
  }

  const checkoutForm = event.target.closest("[data-checkout-form]");
  if (checkoutForm) {
    const formData = new FormData(checkoutForm);
    saveCustomerAddress({
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      address: formData.get("address"),
      city: formData.get("city"),
      state: formData.get("state"),
      pincode: formData.get("pincode"),
    });
  }
});

document.addEventListener("change", (event) => {
  const categoryChoice = event.target.closest("[data-product-category-choice]");
  if (categoryChoice) {
    const otherField = categoryChoice.form?.querySelector(".seller-other-category");
    if (otherField) otherField.hidden = categoryChoice.value !== "Other";
    return;
  }

  if (
    event.target.closest("[data-seller-payment-filter]") ||
    event.target.closest("[data-seller-status-filter]") ||
    event.target.closest("[data-seller-date-filter]")
  ) {
    renderSellerOrdersRows();
  }
});

document.addEventListener("submit", async (event) => {
  const checkoutForm = event.target.closest("[data-checkout-form]");
  if (checkoutForm) {
    event.preventDefault();
    await placeCustomerOrder(checkoutForm);
    return;
  }

  const productForm = event.target.closest("[data-seller-product-create]");
  if (!productForm) return;

  event.preventDefault();
  const message = document.querySelector("[data-seller-product-message]");
  const submitButton = productForm.querySelector("button[type='submit']");
  const imageInput = productForm.querySelector("[name='productImages']");
  const files = [...(imageInput?.files || [])];

  if (files.length > 5) {
    if (message) {
      message.textContent = "Upload maximum 5 product images.";
      message.classList.add("error");
    }
    return;
  }

  if (message) {
    message.textContent = "Uploading product images...";
    message.classList.remove("error");
  }
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Uploading...";
  }

  try {
    const token = localStorage.getItem("axzenToken");
    const formData = new FormData(productForm);
    const categoryChoice = formData.get("categoryChoice");
    formData.set("category", categoryChoice === "Other" ? formData.get("categoryOther") || "General" : categoryChoice || "General");
    formData.delete("categoryChoice");
    formData.delete("categoryOther");
    const response = await fetch("/api/seller/products", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to upload product.");
    productForm.reset();
    if (message) message.textContent = "Product submitted for admin approval.";
    await loadSellerProducts();
  } catch (error) {
    if (message) {
      message.textContent = error.message || "Unable to upload product.";
      message.classList.add("error");
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Submit product for approval";
    }
  }
});

window.addEventListener("hashchange", () => {
  setSellerSection(getSellerSectionFromHash());
});

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    stopSellerOrderPolling();
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
    localStorage.removeItem("axzenPhone");
    localStorage.removeItem("axzenSellerStatus");
    localStorage.removeItem(SELLER_OWNER_KEY);
    document.body.classList.remove("admin-session-active");
    document.body.classList.remove("seller-owner-mode");

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
    renderCartSummary(false);
  });
}

const savedToken = localStorage.getItem("axzenToken");
const savedRole = localStorage.getItem("axzenRole");
const pageRole = document.querySelector(".firebase-phone-form")?.dataset.role;

loadStorefrontCatalog();

if (savedToken && savedRole && savedRole === pageRole) {
  loadDashboard(savedRole, savedToken).catch(() => {
    stopSellerOrderPolling();
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
    localStorage.removeItem("axzenPhone");
    localStorage.removeItem("axzenSellerStatus");
    updateLoginNavigation(false);
    updateSellerHeader(null);
  });
}
