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
const customerProfilePopover = document.querySelector("[data-customer-profile-popover]");
const customerMain = document.querySelector("[data-customer-main]");
const customerMainDefaultHtml = customerMain?.innerHTML || "";
const customerLocationChip = document.querySelector("[data-customer-location]");
const ownerLoginModal = document.querySelector("[data-owner-login-modal]");
let sellerProductsCache = [];
let sellerOrdersCache = [];
let sellerTicketsCache = [];
let customerOrdersCache = [];
let storefrontProductsCache = [];
let sellerOrderPollTimer = null;
let sellerSocket = null;
let sellerNotificationAudio = null;
let customerAppConfig = {};
let storeRailTimer = null;
let customerNotificationTimer = null;
let sellerFollowerCount = 0;
const sellerStoreCache = new Map();

const CART_KEY = "axzenCustomerCart";
const ADDRESS_KEY = "axzenCustomerAddress";
const CUSTOMER_FOLLOWS_KEY = "axzenCustomerFollows";
const CUSTOMER_RECENT_KEY = "axzenCustomerRecentProducts";
const CUSTOMER_LOCATION_KEY = "axzenCustomerLocation";
const CUSTOMER_WISHLIST_KEY = "axzenCustomerWishlist";
const SELLER_OWNER_KEY = "axzenSellerOwnerMode";
const SELLER_NOTIFICATION_MUTE_KEY = "axzenSellerNotificationsMuted";
const SELLER_NOTIFICATION_HISTORY_KEY = "axzenSellerNotificationHistory";
const SELLER_NOTIFICATION_UNREAD_KEY = "axzenSellerNotificationUnread";
const DELIVERY_CHARGE_PAISE = 4000;
const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const SELLER_SIREN_SRC = "/assets/siren.mp3";

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

function openLoginArea() {
  if (!loginSection) return;
  closeCustomerPopovers();
  loginSection.hidden = false;
  if (loginSection.classList.contains("customer-login-section")) {
    document.body.classList.add("customer-login-open");
    loginSection.querySelector("input[name='phone']")?.focus();
    return;
  }
  loginSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeLoginArea() {
  if (!loginSection?.classList.contains("customer-login-section")) return;
  loginSection.hidden = true;
  document.body.classList.remove("customer-login-open");
}

function closeCustomerPopovers(except = "") {
  if (except !== "profile" && customerProfilePopover) customerProfilePopover.hidden = true;
  if (except !== "notifications") {
    const notificationPanel = document.querySelector("[data-customer-notification-panel]");
    if (notificationPanel) notificationPanel.hidden = true;
  }
  if (except !== "cart") {
    const cart = document.querySelector("#cart");
    if (cart) cart.hidden = true;
  }
}

function updateLoginNavigation(isLoggedIn) {
  const dashboardTarget = dashboardSection ? "#dashboard" : "#protectedContent";

  loginNavLinks.forEach((link) => {
    if (link.closest("[data-customer-profile-popover]")) {
      link.textContent = isLoggedIn ? "Logout" : "Login / OTP";
      link.setAttribute("href", isLoggedIn ? "#logout" : "#login");
      return;
    }
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
  if (dashboardRole && dashboardSection?.classList.contains("seller-dashboard-app")) dashboardRole.hidden = !isOwnerMode;
  if (dashboardTitle && dashboardSection?.classList.contains("seller-dashboard-app")) dashboardTitle.hidden = !isOwnerMode;
  if (dashboardSummary && dashboardSection?.classList.contains("seller-dashboard-app")) dashboardSummary.hidden = !isOwnerMode;
  if (sellerSidebarCompany) sellerSidebarCompany.textContent = isSellerLoggedIn ? seller.businessName || seller.fullName || "Seller company" : "Seller company";
  if (sellerTopbarInitial) sellerTopbarInitial.textContent = (seller.businessName || seller.fullName || "Seller").trim().charAt(0).toUpperCase();
  if (sellerProfilePopover) sellerProfilePopover.hidden = true;
  document.querySelector("[data-login-owner]")?.toggleAttribute("hidden", isOwnerMode);
  document.querySelector("[data-return-seller-orders]")?.toggleAttribute("hidden", !isOwnerMode);
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

function readJsonArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key, value) {
  localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function getFollowedSellers() {
  return readJsonArray(CUSTOMER_FOLLOWS_KEY);
}

function saveFollowedSeller(seller) {
  const follows = getFollowedSellers().filter((item) => String(item.id) !== String(seller.id));
  follows.unshift({ id: seller.id, name: seller.name, followedAt: new Date().toISOString() });
  writeJsonArray(CUSTOMER_FOLLOWS_KEY, follows.slice(0, 50));
}

function removeFollowedSeller(sellerId) {
  writeJsonArray(
    CUSTOMER_FOLLOWS_KEY,
    getFollowedSellers().filter((item) => String(item.id) !== String(sellerId))
  );
}

function saveRecentProduct(productId) {
  const product = storefrontProductsCache.find((item) => String(item.id) === String(productId));
  if (!product) return;
  const recent = readJsonArray(CUSTOMER_RECENT_KEY).filter((item) => String(item.id) !== String(product.id));
  recent.unshift({
    id: product.id,
    title: product.title,
    sellerName: product.sellerName,
    price: product.price,
    image: product.image || product.images?.[0] || "",
    viewedAt: new Date().toISOString(),
  });
  writeJsonArray(CUSTOMER_RECENT_KEY, recent.slice(0, 12));
  renderRecentProducts();
}

function sellerInitials(name = "Seller") {
  return (
    String(name || "Seller")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "S"
  );
}

function sellerAvatarMarkup(name, logoUrl = "", className = "seller-mini-avatar") {
  return logoUrl
    ? `<img class="${className}" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(name)}">`
    : `<span class="${className}">${escapeHtml(sellerInitials(name))}</span>`;
}

function sellerVerifiedIcon() {
  return `<span class="seller-verified-icon" aria-label="Verified seller">&#10003;</span>`;
}

function compactCount(value = 0) {
  const number = Number(value) || 0;
  if (number >= 100000) return `${(number / 100000).toFixed(1)}L`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return String(number);
}

function renderCustomerNotificationPanel(notifications = [], unreadCount = 0) {
  const count = document.querySelector("[data-customer-notification-count]");
  const list = document.querySelector("[data-customer-notification-list]");
  if (count) {
    count.textContent = String(unreadCount || 0);
    count.hidden = !unreadCount;
  }
  if (!list) return;
  list.innerHTML = notifications.length
    ? notifications
        .slice(0, 12)
        .map(
          (item) => `
            <button type="button" data-customer-notification-link="${escapeHtml(item.link || "")}" class="${item.isRead ? "" : "unread"}">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.message || "")}</span>
              <small>${new Date(item.createdAt).toLocaleString()}</small>
            </button>
          `
        )
        .join("")
    : "<p>No notifications yet.</p>";
}

async function loadCustomerNotifications(showDesktop = false) {
  if (localStorage.getItem("axzenRole") !== "customer") return;
  const token = localStorage.getItem("axzenToken");
  if (!token) return;
  try {
    const response = await fetch("/api/customer/notifications", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load notifications.");
    renderCustomerNotificationPanel(result.notifications || [], result.unreadCount || 0);
    const latest = (result.notifications || []).find((item) => !item.isRead);
    if (showDesktop && latest && "Notification" in window && Notification.permission === "granted") {
      new Notification(latest.title, { body: latest.message || "New Axzen update" });
    }
  } catch (error) {
    console.warn(error.message || "Customer notifications unavailable.");
  }
}

function startCustomerNotificationPolling() {
  window.clearInterval(customerNotificationTimer);
  if (localStorage.getItem("axzenRole") !== "customer") return;
  if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  loadCustomerNotifications(false);
  customerNotificationTimer = window.setInterval(() => loadCustomerNotifications(true), 30000);
}

function stopCustomerNotificationPolling() {
  window.clearInterval(customerNotificationTimer);
  customerNotificationTimer = null;
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

function getCartFreeDelivery(cart = getCustomerCart()) {
  const sellerIds = getCartSellerIds(cart);
  const subtotal = getCartTotalPaise(cart);
  const firstItem = cart[0] || {};
  const threshold = Number(firstItem.freeDeliveryMinOrderPaise) || 0;
  const eligible = sellerIds.length === 1 && firstItem.freeDeliveryEnabled === true && subtotal >= threshold;
  return {
    enabled: sellerIds.length === 1 && firstItem.freeDeliveryEnabled === true,
    eligible,
    threshold,
    customerDeliveryChargePaise: eligible ? 0 : DELIVERY_CHARGE_PAISE,
    sellerDeliveryChargePaise: eligible ? DELIVERY_CHARGE_PAISE : 0,
  };
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

function showCustomerToast(message, isError = false) {
  let toast = document.querySelector("[data-customer-toast]");
  if (!toast) {
    document.body.insertAdjacentHTML("beforeend", `<div class="customer-toast" data-customer-toast hidden></div>`);
    toast = document.querySelector("[data-customer-toast]");
  }
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.hidden = false;
  window.clearTimeout(showCustomerToast.timer);
  showCustomerToast.timer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function getCustomerWishlist() {
  return readJsonArray(CUSTOMER_WISHLIST_KEY).map(String);
}

function saveCustomerWishlist(list = []) {
  writeJsonArray(CUSTOMER_WISHLIST_KEY, [...new Set(list.map(String))]);
}

function isWishlisted(productId) {
  return getCustomerWishlist().includes(String(productId));
}

function toggleCustomerWishlist(productId) {
  const product = storefrontProductsCache.find((item) => String(item.id) === String(productId));
  const wishlist = getCustomerWishlist();
  const exists = wishlist.includes(String(productId));
  const next = exists ? wishlist.filter((id) => id !== String(productId)) : [...wishlist, String(productId)];
  saveCustomerWishlist(next);
  document.querySelectorAll(`[data-wishlist-product="${CSS.escape(String(productId))}"]`).forEach((button) => {
    button.classList.toggle("active", !exists);
    button.setAttribute("aria-pressed", String(!exists));
  });
  showCustomerToast(`${product?.title || "Product"} ${exists ? "removed from wishlist" : "added to wishlist"}.`);
}

function renderCartSummary(showCheckout = false) {
  const summaries = document.querySelectorAll(".cart-summary");
  if (!summaries.length) return;
  const cart = getCustomerCart();
  const itemCount = getCartItemCount(cart);
  const subtotal = getCartTotalPaise(cart);
  const mrpTotal = cart.reduce((total, item) => total + (Number(item.mrpPaise || item.pricePaise) || 0) * (Number(item.quantity) || 1), 0);
  const discount = Math.max(mrpTotal - subtotal, 0);
  const freeDelivery = getCartFreeDelivery(cart);
  const customerPaid = subtotal + freeDelivery.customerDeliveryChargePaise;
  const canCheckout = itemCount > 0;

  summaries.forEach((summary) => {
    summary.innerHTML = `
      <div class="cart-page-head">
        <div>
          <p class="eyebrow">Shopping Cart</p>
          <h3>${itemCount ? `${itemCount} item${itemCount === 1 ? "" : "s"} in your cart` : "Your cart is empty"}</h3>
        </div>
        <button type="button" data-close-cart>Close</button>
      </div>
      <div class="cart-page-grid">
        <div class="cart-items">
          ${
            cart.length
              ? cart
                  .map(
                    (item) => {
                      const qty = Number(item.quantity) || 1;
                      const price = Number(item.pricePaise) || 0;
                      const mrp = Number(item.mrpPaise || item.pricePaise) || price;
                      return `
                        <article class="cart-line">
                          <div class="cart-line-media">
                            ${
                              item.image
                                ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">`
                                : `<span>${escapeHtml((item.title || "P").charAt(0))}</span>`
                            }
                          </div>
                          <div class="cart-line-info">
                            <strong>${escapeHtml(item.title)}</strong>
                            <small>${escapeHtml(item.sellerName || "Axzen seller")} | ${escapeHtml(item.unitLabel || "1 pc")}</small>
                            <div class="cart-line-price">
                              ${mrp > price ? `<del>${rupees(mrp)}</del>` : ""}
                              <b>${rupees(price)}</b>
                            </div>
                            <small class="stock-left">Delivery ${freeDelivery.eligible ? "free" : "charge applied"} for this order</small>
                          </div>
                          <div class="cart-line-actions">
                            <label>Qty
                              <select data-cart-qty="${escapeHtml(item.id)}">
                                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
                                  .map((value) => `<option value="${value}" ${value === qty ? "selected" : ""}>${value}</option>`)
                                  .join("")}
                              </select>
                            </label>
                            <button type="button" data-cart-remove="${escapeHtml(item.id)}">Remove</button>
                            <button type="button" data-buy-now="${escapeHtml(item.id)}">Buy this now</button>
                          </div>
                        </article>
                      `;
                    }
                  )
                  .join("")
              : `<div class="cart-empty-state"><strong>No items added yet.</strong><span>Add products to continue checkout.</span></div>`
          }
        </div>
        <aside class="cart-price-panel">
          <h4>Price Details</h4>
          <div><span>MRP total</span><b>${rupees(mrpTotal || subtotal)}</b></div>
          <div><span>Discount</span><b class="stock-left">-${rupees(discount)}</b></div>
          <div><span>Delivery charge</span><b>${freeDelivery.eligible ? "Free" : rupees(freeDelivery.customerDeliveryChargePaise)}</b></div>
          <div class="cart-total-row"><span>Total Amount</span><strong>${rupees(customerPaid)}</strong></div>
          ${discount ? `<p class="cart-savings">You saved ${rupees(discount)} on this order.</p>` : ""}
          <button type="button" data-checkout ${canCheckout ? "" : "disabled"}>${showCheckout ? "Update checkout" : "Proceed to checkout"}</button>
          <p class="cart-message" data-cart-message hidden></p>
          ${showCheckout ? renderCheckoutPanel(cart) : ""}
        </aside>
      </div>
    `;
  });
}

function renderCheckoutPanel(cart = getCustomerCart()) {
  const address = getSavedCustomerAddress();
  const isCustomerLoggedIn = localStorage.getItem("axzenToken") && localStorage.getItem("axzenRole") === "customer";
  const { codAvailable, onlineAvailable, blockReason } = getCheckoutAvailability(cart);
  const freeDelivery = getCartFreeDelivery(cart);
  const productTotal = getCartTotalPaise(cart);
  const customerPaid = productTotal + freeDelivery.customerDeliveryChargePaise;
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
        <span>Product total</span><b>${rupees(productTotal)}</b>
        <span>Delivery charge</span><b>${freeDelivery.eligible ? "Free" : rupees(DELIVERY_CHARGE_PAISE)}</b>
        ${
          freeDelivery.eligible
            ? `<span class="checkout-note">Free delivery applied. Delivery cost is covered by seller.</span><span></span>`
            : freeDelivery.enabled
              ? `<span class="checkout-note">Free delivery available above ${rupees(freeDelivery.threshold)}.</span><span></span>`
              : ""
        }
        <strong>Customer paid</strong><strong>${rupees(customerPaid)}</strong>
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
  if ((Number(product.stock) || 0) <= 0) {
    setCartMessage("This product is currently not available.", true);
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
      image: product.image || product.images?.[0] || "",
      mrpPaise: product.mrpPaise || product.pricePaise,
      pricePaise: product.pricePaise,
      unitLabel: product.unitLabel || "1 pc",
      codEnabled: product.codEnabled !== false,
      onlinePaymentEnabled: product.onlinePaymentEnabled !== false,
      freeDeliveryEnabled: product.freeDeliveryEnabled === true,
      freeDeliveryMinOrderPaise: Number(product.freeDeliveryMinOrderPaise) || 0,
      quantity: 1,
    });
  }
  saveCustomerCart(cart);
  renderCartSummary(false);
  setCartMessage(`${product.title || "Product"} added to cart.`);
  showCustomerToast(`${product.title || "Product"} added to cart.`);
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
  const freeDelivery = getCartFreeDelivery(cart);
  const orderPayload = {
    items: buildOrderItems(cart),
    deliveryCharge: freeDelivery.customerDeliveryChargePaise / 100,
    sellerDeliveryCharge: freeDelivery.sellerDeliveryChargePaise / 100,
    freeDeliveryApplied: freeDelivery.eligible,
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
  const sellerDetails = product.sellerStoreDetails || {};
  const sellerLogo = sellerDetails.profileImageUrl || "";
  const sellerFollowers = compactCount(product.sellerFollowerCount || 0);
  const category = product.category || "Product";
  const mrp = Number(product.mrpPaise) > Number(product.pricePaise) ? product.mrp || rupees(product.mrpPaise) : "";
  const rating = Number(product.ratingAverage || 0).toFixed(1);
  const stock = Number(product.stock) || 0;
  return `
    <article class="commerce-product" data-product-card="${escapeHtml(product.id)}">
      <div class="commerce-product-media">
        <span class="product-popular-badge">Popular</span>
        ${
          image
            ? `<img class="commerce-product-image commerce-product-photo" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">`
            : `<div class="commerce-product-image">${escapeHtml(category)}</div>`
        }
      </div>
      <div class="commerce-product-body">
        <button class="product-wishlist ${isWishlisted(product.id) ? "active" : ""}" type="button" data-wishlist-product="${escapeHtml(product.id)}" aria-pressed="${isWishlisted(product.id)}" aria-label="Add ${escapeHtml(title)} to wishlist">&hearts;</button>
        <h3>${escapeHtml(title)}</h3>
        <p class="commerce-product-category">${escapeHtml(category)}</p>
        <p class="commerce-product-seller">
          ${sellerAvatarMarkup(sellerName, sellerLogo)}
          <span class="seller-row-prefix">by</span>
          <button class="seller-hash-link" type="button" data-open-seller="${escapeHtml(product.sellerId)}">${escapeHtml(sellerName)}</button>
          ${sellerVerifiedIcon()}
          <span class="seller-row-meta">${rating} rating</span>
          <span class="seller-row-meta">${sellerFollowers} followers</span>
        </p>
        <div class="customer-price-row">
          ${mrp ? `<del>${escapeHtml(mrp)}</del>` : ""}
          <strong>${escapeHtml(product.price || "Rs. 0")}</strong>
        </div>
        <small>${escapeHtml(product.unitLabel || "1 pc")} | ${rating} rating (${Number(product.ratingCount) || 0})</small>
        <small class="${stock > 0 ? "stock-left" : "stock-out"}">${stock > 0 ? `${Math.min(stock, 5)} items left` : "Currently not available"}</small>
        <button type="button" data-add-cart="${escapeHtml(product.id)}" ${stock > 0 ? "" : "disabled"}>Add to cart</button>
      </div>
    </article>
  `;
}

function renderSellerStoreProductCard(product) {
  const image = product.image || product.images?.[0] || "";
  const title = product.title || product.name || "Product";
  const category = product.category || "Product";
  const rating = Number(product.ratingAverage || 0).toFixed(1);
  const ratingCount = Number(product.ratingCount || 0);
  const stock = Number(product.stock) || 0;
  return `
    <article class="seller-store-product-card" data-product-card="${escapeHtml(product.id)}">
      <button class="product-wishlist ${isWishlisted(product.id) ? "active" : ""}" type="button" data-wishlist-product="${escapeHtml(product.id)}" aria-pressed="${isWishlisted(product.id)}" aria-label="Add ${escapeHtml(title)} to wishlist">&hearts;</button>
      <div class="seller-store-product-media">
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">`
            : `<div class="seller-store-product-fallback">${escapeHtml(category)}</div>`
        }
      </div>
      <div class="seller-store-product-body">
        <h4>${escapeHtml(title)}</h4>
        <p>${escapeHtml(category)}</p>
        <strong>${escapeHtml(product.price || "Rs. 0")}</strong>
        <small>${rating} (${ratingCount})</small>
        <button type="button" data-add-cart="${escapeHtml(product.id)}" ${stock > 0 ? "" : "disabled"}>Add to cart</button>
      </div>
    </article>
  `;
}

function renderSellerTopCategory(category, products = []) {
  const categoryName = category.name || category;
  const firstProduct = products.find((product) => (product.category || "General") === categoryName) || {};
  const image = firstProduct.image || firstProduct.images?.[0] || "";
  return `
    <button type="button" class="seller-category-tile" data-open-category="${escapeHtml(categoryName)}">
      <span>
        ${
          image
            ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(categoryName)}">`
            : `<b>${escapeHtml(sellerInitials(categoryName))}</b>`
        }
      </span>
      <strong>${escapeHtml(categoryName)}</strong>
      <small>${escapeHtml(category.products || products.filter((product) => (product.category || "General") === categoryName).length || 0)} Products</small>
    </button>
  `;
}

function getStorefrontSellers() {
  const sellers = new Map();
  storefrontProductsCache.forEach((product) => {
    if (!product.sellerId) return;
    const storeDetails = product.sellerStoreDetails || {};
    const entry = sellers.get(String(product.sellerId)) || {
      id: product.sellerId,
      name: product.sellerName || "Axzen seller",
      category: product.sellerCategory || product.category || "General",
      city: product.sellerCity || "",
      fullName: product.sellerFullName || "",
      businessType: product.sellerBusinessType || "",
      email: product.sellerEmail || "",
      phone: product.sellerPhone || "",
      createdAt: product.sellerCreatedAt || "",
      profileImageUrl: storeDetails.profileImageUrl || "",
      offerBannerUrl: storeDetails.offerBannerUrl || "",
      tagline: storeDetails.tagline || "",
      about: storeDetails.about || "",
      offerTitle: storeDetails.offerTitle || "",
      offerSubtitle: storeDetails.offerSubtitle || "",
      ownerDisplayName: storeDetails.ownerDisplayName || "",
      memberSinceLabel: storeDetails.memberSinceLabel || "",
      supportEmail: storeDetails.supportEmail || "",
      supportPhone: storeDetails.supportPhone || "",
      followerCount: Number(product.sellerFollowerCount || 0),
      products: [],
    };
    entry.followerCount = Math.max(Number(entry.followerCount || 0), Number(product.sellerFollowerCount || 0));
    entry.products.push(product);
    sellers.set(String(product.sellerId), entry);
  });
  return [...sellers.values()];
}

function setCustomerSubpageMode(isSubpage) {
  document.body.classList.toggle("customer-subpage-open", Boolean(isSubpage));
}

function setCustomerHistory(route, value, replace = false) {
  const url = new URL(window.location.href);
  ["seller", "category", "follows"].forEach((key) => url.searchParams.delete(key));
  if (route && value) url.searchParams.set(route, value);
  const method = replace ? "replaceState" : "pushState";
  history[method]({ customerRoute: route || "home", value: value || "" }, "", `${url.pathname}${url.search}${url.hash}`);
}

function renderCustomerCategories(products = storefrontProductsCache) {
  const rail = document.querySelector("[data-customer-category-rail]");
  if (!rail) return;
  const baseCategories = ["Electronics", "Fashion", "Home & Living", "Beauty", "Sports", "Automotive"];
  const configured = Array.isArray(customerAppConfig.categoryOrder) && customerAppConfig.categoryOrder.length ? customerAppConfig.categoryOrder : baseCategories;
  const detected = [...new Set(products.map((product) => product.category || "General").filter(Boolean))];
  const categories = ["All", ...new Set([...configured, ...detected])].slice(0, 12);
  rail.innerHTML = categories
    .map(
      (category, index) => `
        <button type="button" class="${index === 0 ? "active" : ""}" data-customer-category-pill="${escapeHtml(category)}">
          <span class="category-chip-icon">${escapeHtml(category.charAt(0).toUpperCase())}</span>${escapeHtml(category)}
        </button>
      `
    )
    .join("");
}

function renderStorefrontProducts(products = storefrontProductsCache) {
  const grid = document.querySelector(".commerce-products");
  if (!grid) return;
  grid.innerHTML = products.length ? products.map(renderStorefrontProduct).join("") : `<p class="order-invoice-empty">No products found.</p>`;
}

function resetCustomerMain() {
  const target = document.querySelector("[data-customer-main]");
  if (target && !target.querySelector(".section-heading")) target.innerHTML = customerMainDefaultHtml;
  setCustomerSubpageMode(false);
}

function renderCustomerSaleBanner() {
  const banner = document.querySelector(".customer-sale-banner");
  if (!banner) return;
  const offerImage = customerAppConfig.offerImageUrl || "";
  banner.style.backgroundImage = offerImage
    ? `linear-gradient(90deg, rgba(5, 64, 43, 0.78), rgba(5, 64, 43, 0.42)), url("${offerImage.replaceAll('"', "%22")}")`
    : "";
  banner.innerHTML = `
    <div>
      <p class="eyebrow">Axzen offer</p>
      <h2>${escapeHtml(customerAppConfig.saleTitle || "Exclusive coupon for you!")}</h2>
      <p>${escapeHtml(customerAppConfig.saleSubtitle || "Flat 10% Off up to Rs. 100. Already applied on selected products.")}</p>
    </div>
    <a class="primary-button" href="#products">${escapeHtml(customerAppConfig.saleCta || "Shop offers")}</a>
  `;
}

function renderRecentProducts() {
  const section = document.querySelector("[data-customer-recent]");
  if (!section) return;
  const recent = readJsonArray(CUSTOMER_RECENT_KEY);
  section.hidden = recent.length === 0;
  if (!recent.length) return;
  section.innerHTML = `
    <div class="section-heading compact">
      <div>
        <p class="eyebrow">Your recent history</p>
        <h2>Continue from where you stopped</h2>
      </div>
    </div>
    <div class="customer-mini-rail">
      ${recent
        .map(
          (item) => `
            <button type="button" data-product-card="${escapeHtml(item.id)}">
              ${item.image ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}">` : `<span>${escapeHtml((item.title || "P").charAt(0))}</span>`}
              <strong>${escapeHtml(item.title || "Product")}</strong>
              <small>${escapeHtml(item.price || "")}</small>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderCategorySections(products = storefrontProductsCache) {
  const section = document.querySelector("[data-customer-category-sections]");
  if (!section) return;
  const categories = [...new Set(products.map((product) => product.category || "General").filter(Boolean))].slice(0, 8);
  section.innerHTML = categories
    .map((category) => {
      const categoryProducts = products.filter((product) => (product.category || "General") === category);
      return `
        <article class="customer-category-block" data-category-block="${escapeHtml(category)}">
          <header>
            <h2>${escapeHtml(category)}</h2>
            <button type="button" data-open-category="${escapeHtml(category)}">View all <span aria-hidden="true">></span></button>
          </header>
          <div class="commerce-products category-products-row">
            ${categoryProducts.slice(0, 5).map(renderStorefrontProduct).join("")}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderStoreRail() {
  const rail = document.querySelector(".store-rail");
  if (!rail) return;
  const configured = new Set((customerAppConfig.recommendedSellerIds || []).map(String));
  const sellers = getStorefrontSellers()
    .sort((a, b) => Number(configured.has(String(b.id))) - Number(configured.has(String(a.id))))
    .slice(0, 15);
  if (!sellers.length) return;
  rail.innerHTML = sellers
    .map(
      (seller) => `
        <article class="store-card" data-open-seller="${escapeHtml(seller.id)}">
          <div class="store-card-top">
            ${sellerAvatarMarkup(seller.name, seller.profileImageUrl, "store-card-logo")}
            <span class="store-status">Verified</span>
          </div>
          <h3 class="store-card-name">${escapeHtml(seller.name)} ${sellerVerifiedIcon()}</h3>
          <p class="store-meta">${compactCount(seller.followerCount)} followers &middot; ${seller.products.length} products &middot; ${Number(seller.ratingAverage || 4.8).toFixed(1)} rating</p>
          <div class="store-tags">${[...new Set(seller.products.map((product) => product.category || "General"))].slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          <button type="button" class="store-card-action" data-open-seller="${escapeHtml(seller.id)}">View Store</button>
        </article>
      `
    )
    .join("");
  window.clearInterval(storeRailTimer);
  storeRailTimer = window.setInterval(() => {
    if (!document.body.contains(rail) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    rail.scrollTo({ left: rail.scrollLeft >= maxScroll - 20 ? 0 : rail.scrollLeft + Math.min(260, rail.clientWidth), behavior: "smooth" });
  }, 5000);
}

function fallbackSellerStore(sellerId) {
  const seller = getStorefrontSellers().find((entry) => String(entry.id) === String(sellerId));
  if (!seller) return null;
  return {
    seller,
    products: seller.products,
    categories: [...new Set(seller.products.map((product) => product.category || "General"))].map((name) => ({
      name,
      products: seller.products.filter((product) => (product.category || "General") === name).length,
    })),
    reviews: { ratingAverage: 4.8, reviewCount: seller.products.reduce((sum, product) => sum + Number(product.ratingCount || 0), 0), bars: [], latestReview: null },
  };
}

async function loadCustomerSellerStore(sellerId) {
  const key = String(sellerId);
  if (sellerStoreCache.has(key)) return sellerStoreCache.get(key);
  try {
    const token = localStorage.getItem("axzenToken") || "";
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
    const [sellerResponse, productsResponse, categoriesResponse, reviewsResponse] = await Promise.all([
      fetch(`/api/customer/sellers/${encodeURIComponent(sellerId)}`, { headers: authHeaders }),
      fetch(`/api/customer/sellers/${encodeURIComponent(sellerId)}/products`),
      fetch(`/api/customer/sellers/${encodeURIComponent(sellerId)}/categories`),
      fetch(`/api/customer/sellers/${encodeURIComponent(sellerId)}/reviews`),
    ]);
    const [sellerResult, productsResult, categoriesResult, reviewsResult] = await Promise.all([
      sellerResponse.json(),
      productsResponse.json(),
      categoriesResponse.json(),
      reviewsResponse.json(),
    ]);
    if (!sellerResponse.ok || !productsResponse.ok) throw new Error(sellerResult.message || productsResult.message || "Unable to load seller store.");
    const seller = sellerResult.seller || {};
    const store = {
      seller: {
        id: seller.id || seller._id || sellerId,
        name: seller.businessName || seller.name || "Axzen seller",
        category: seller.category || "General",
        city: seller.city || "",
        fullName: seller.fullName || "",
        businessType: seller.businessType || "",
        gstNumber: seller.gstNumber || "",
        email: seller.email || "",
        phone: seller.phone || "",
        createdAt: seller.createdAt || "",
        followerCount: Number(seller.followerCount || 0),
        productCount: Number(seller.productCount || productsResult.products?.length || 0),
        isFollowing: seller.isFollowing === true,
        ...(seller.storeDetails || {}),
      },
      products: productsResult.products || [],
      categories: categoriesResult.categories || [],
      reviews: reviewsResult.reviews || {},
    };
    store.seller.products = store.products;
    sellerStoreCache.set(key, store);
    return store;
  } catch {
    return fallbackSellerStore(sellerId);
  }
}

async function openCustomerSellerPage(sellerId, options = {}) {
  const store = await loadCustomerSellerStore(sellerId);
  const seller = store?.seller;
  const target = document.querySelector("[data-customer-main]");
  if (!seller || !target) return;
  setCustomerSubpageMode(true);
  if (options.push !== false) setCustomerHistory("seller", seller.id);
  const products = store.products || seller.products || [];
  const categories = (store.categories || []).length ? store.categories : [...new Set(products.map((product) => product.category || "General"))].map((name) => ({ name, products: products.filter((product) => (product.category || "General") === name).length }));
  const reviews = store.reviews || {};
  const isFollowing = seller.isFollowing || getFollowedSellers().some((item) => String(item.id) === String(seller.id));
  const bestProducts = [...products].sort((a, b) => Number(b.ratingCount || 0) - Number(a.ratingCount || 0)).slice(0, 5);
  const reviewAverage = Number(reviews.ratingAverage || 4.8).toFixed(1);
  const reviewCount = Number(reviews.reviewCount || products.reduce((sum, product) => sum + Number(product.ratingCount || 0), 0) || 0);
  const avatar = seller.profileImageUrl
    ? `<img src="${escapeHtml(seller.profileImageUrl)}" alt="${escapeHtml(seller.name)}">`
    : `<span>${escapeHtml(sellerInitials(seller.name).slice(0, 4))}</span>`;
  const bannerStyle = seller.offerBannerUrl ? ` style="background-image: linear-gradient(120deg, rgba(11,47,87,.9), rgba(0,113,227,.46)), url('${escapeHtml(seller.offerBannerUrl)}')"` : "";
  target.innerHTML = `
    <section class="customer-seller-page customer-seller-storefront">
      <nav class="customer-breadcrumb"><button type="button" data-reset-customer-home>Home</button><span>></span><span>Stores</span><span>></span><strong>${escapeHtml(seller.name)}</strong></nav>
      <header class="seller-store-hero"${bannerStyle}>
        <div class="seller-store-avatar">${avatar}</div>
        <div class="seller-store-copy">
          <p class="seller-preferred">Preferred Seller</p>
          <h2>${escapeHtml(seller.name)} ${sellerVerifiedIcon()}</h2>
          <p>${escapeHtml(seller.tagline || `Your trusted destination for ${seller.category || "quality products"}.`)}</p>
          <div class="seller-rating-line"><span>&#9733;&#9733;&#9733;&#9733;&#9733;</span><strong>${reviewAverage}</strong><small>(${reviewCount} Reviews)</small></div>
          <div class="seller-store-meta">
            <span>${reviewAverage} rating</span>
            <span>${compactCount(seller.followerCount || 0)} followers</span>
            <span>${products.length} products</span>
            <span>${seller.memberSinceLabel || (seller.createdAt ? `Joined ${new Date(seller.createdAt).getFullYear()}` : "Verified seller")}</span>
          </div>
        </div>
        <div class="seller-hero-trust">
          <span><strong>100% Original</strong><small>Genuine Products</small></span>
          <span><strong>7 Days Return</strong><small>Easy Returns</small></span>
          <span><strong>Secure Payment</strong><small>100% Protected</small></span>
        </div>
        <div class="seller-store-actions">
          <button type="button" class="secondary-button" data-share-seller="${escapeHtml(seller.id)}">Share Store</button>
          <button type="button" data-follow-seller="${escapeHtml(seller.id)}">${isFollowing ? "Unfollow" : "Follow"}</button>
          <small>${isFollowing ? "You follow this store" : `Followed by ${compactCount(seller.followerCount || 0)}+ customers`}</small>
        </div>
      </header>
      <div class="seller-store-tabs">
        <button type="button" class="active" data-seller-store-tab="home">Store Home</button>
        <button type="button" data-seller-store-tab="all">All Products</button>
        <button type="button" data-seller-store-tab="categories">Categories</button>
        <button type="button" data-seller-store-tab="new">New Arrivals</button>
        <button type="button" data-seller-store-tab="best">Best Sellers</button>
        <button type="button" data-seller-store-tab="offers">Offers</button>
        <input type="search" data-customer-seller-search="${escapeHtml(seller.id)}" placeholder="Search in store...">
      </div>
      <div class="seller-store-grid">
        <article class="seller-store-card about">
          <h3>About ${escapeHtml(seller.name)}</h3>
          <p>${escapeHtml(seller.about || `Welcome to ${seller.name}, a trusted Axzen seller offering quality products, fast delivery and customer support.`)}</p>
          <div class="seller-store-benefits">
            <span><strong>Quality Products</strong><small>100% Genuine</small></span>
            <span><strong>Fast Delivery</strong><small>Pan India Delivery</small></span>
            <span><strong>Safe Packaging</strong><small>Safe & Reliable</small></span>
          </div>
        </article>
        <article class="seller-store-card categories">
          <header>
            <h3>Top Categories</h3>
            <button type="button" data-seller-store-tab="categories">View all categories -></button>
          </header>
          <div class="seller-top-categories">
            ${categories.slice(0, 5).map((category) => renderSellerTopCategory(category, products)).join("")}
          </div>
        </article>
        <aside class="seller-store-card info">
          <h3>Seller Information</h3>
          <dl>
            <dt>Store Name</dt><dd>${escapeHtml(seller.name)}</dd>
            <dt>Owner</dt><dd>${escapeHtml(seller.ownerDisplayName || seller.fullName || "Axzen seller")}</dd>
            <dt>Member Since</dt><dd>${escapeHtml(seller.memberSinceLabel || (seller.createdAt ? new Date(seller.createdAt).toLocaleDateString() : "Verified") )}</dd>
            <dt>Business Type</dt><dd>${escapeHtml(seller.businessType || "Seller")}</dd>
            <dt>GST Number</dt><dd>${escapeHtml(seller.gstNumber || "Not added")}</dd>
            <dt>Email</dt><dd>${escapeHtml(seller.supportEmail || seller.email || "-")}</dd>
            <dt>Phone</dt><dd>${escapeHtml(seller.supportPhone || seller.phone || "-")}</dd>
          </dl>
          <button type="button" data-message-seller="${escapeHtml(seller.id)}">Message Seller</button>
        </aside>
        <section class="seller-best-products">
          <header><h3>Best Selling Products</h3><button type="button" data-seller-store-tab="all">View all products -></button></header>
          <div class="seller-store-product-row">${bestProducts.map(renderSellerStoreProductCard).join("")}</div>
        </section>
        <aside class="seller-store-card reviews">
          <h3>Customer Reviews</h3>
          <div class="seller-review-identity">
            ${sellerAvatarMarkup(seller.name, seller.profileImageUrl, "seller-review-avatar")}
            <div>
              <strong>${escapeHtml(seller.name)} ${sellerVerifiedIcon()}</strong>
              <small>Verified seller &middot; ${compactCount(seller.followerCount || 0)} followers</small>
            </div>
          </div>
          <div class="seller-review-score">
            <strong>${reviewAverage}</strong>
            <span>${reviewCount} reviews</span>
          </div>
          <div class="seller-review-bars">
            ${(reviews.bars || [5, 4, 3, 2, 1].map((rating) => ({ rating, percent: 0 })))
              .map((bar) => `<div><span>${escapeHtml(bar.rating)}</span><i><b style="width:${Math.max(0, Math.min(Number(bar.percent) || 0, 100))}%"></b></i><small>${escapeHtml(bar.percent || 0)}%</small></div>`)
              .join("")}
          </div>
          ${
            reviews.latestReview
              ? `<p>${escapeHtml(reviews.latestReview.message || "")}</p>`
              : `<p>No written reviews yet. Ratings are calculated from seller products.</p>`
          }
        </aside>
      </div>
      <section class="seller-all-products">
        <header><h3>All Products</h3><span>${products.length} items</span></header>
        <div class="commerce-products seller-store-product-row">${products.map(renderSellerStoreProductCard).join("")}</div>
      </section>
      <div class="seller-store-perks">
        <span><strong>Extra 5% Off</strong><small>On Prepaid Orders</small></span>
        <span><strong>Free Shipping</strong><small>On Orders Above Rs. 499</small></span>
        <span><strong>Easy Returns</strong><small>Within 7 Days</small></span>
        <span><strong>Safe Packaging</strong><small>100% Secure Packaging</small></span>
        <span><strong>Dedicated Support</strong><small>24x7 Customer Support</small></span>
      </div>
    </section>
  `;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openCustomerFollowsView(options = {}) {
  const target = document.querySelector("[data-customer-main]");
  if (!target) return;
  closeCustomerPopovers();
  setCustomerSubpageMode(true);
  if (options.push !== false) setCustomerHistory("follows", "1");
  let follows = getFollowedSellers();
  const token = localStorage.getItem("axzenToken");
  if (token && localStorage.getItem("axzenRole") === "customer") {
    try {
      const response = await fetch("/api/customer/follows", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (response.ok) follows = result.follows || follows;
    } catch {
      // Local follows are still useful when network is unavailable.
    }
  }
  target.innerHTML = `
    <section class="customer-seller-page customer-follows-page">
      <nav class="customer-breadcrumb"><button type="button" data-reset-customer-home>Home</button><span>></span><strong>Follows</strong></nav>
      <header class="customer-follows-hero">
        <div>
          <p class="eyebrow">Follows</p>
          <h2>Your followed stores</h2>
          <p>${follows.length} seller pages saved</p>
        </div>
      </header>
      <div class="store-rail static">
        ${
          follows.length
            ? follows
                .map(
                  (seller) => {
                    const liveSeller = getStorefrontSellers().find((entry) => String(entry.id) === String(seller.id)) || {};
                    const sellerName = liveSeller.name || seller.name || "Axzen seller";
                    const followerCount = liveSeller.followerCount || seller.followerCount || 0;
                    const productCount = liveSeller.products?.length || seller.productCount || 0;
                    return `
                    <article class="store-card" data-open-seller="${escapeHtml(seller.id)}">
                      <div class="store-card-top">
                        ${sellerAvatarMarkup(sellerName, liveSeller.profileImageUrl || seller.profileImageUrl || "", "store-card-logo")}
                        <span class="store-status">Following</span>
                      </div>
                      <h3 class="store-card-name">${escapeHtml(sellerName)} ${sellerVerifiedIcon()}</h3>
                      <p class="store-meta">${compactCount(followerCount)} followers &middot; ${productCount} products &middot; Followed ${new Date(seller.followedAt).toLocaleDateString()}</p>
                      <button type="button" class="store-card-action" data-open-seller="${escapeHtml(seller.id)}">View Store</button>
                    </article>
                  `;
                  }
                )
                .join("")
            : `<p class="order-invoice-empty">No followed sellers yet. Open any seller page and tap Follow.</p>`
        }
      </div>
    </section>
  `;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openCustomerCategoryPage(category, options = {}) {
  const target = document.querySelector("[data-customer-main]");
  if (!target) return;
  const products = storefrontProductsCache.filter((product) => (product.category || "General") === category);
  setCustomerSubpageMode(true);
  if (options.push !== false) setCustomerHistory("category", category);
  target.innerHTML = `
    <section class="customer-seller-page customer-category-page">
      <nav class="customer-breadcrumb"><button type="button" data-reset-customer-home>Home</button><span>></span><strong>${escapeHtml(category)}</strong></nav>
      <header class="customer-category-page-hero">
        <div>
          <p class="eyebrow">Category</p>
          <h2>${escapeHtml(category)}</h2>
          <p>${products.length} products available</p>
        </div>
        <button type="button" data-reset-customer-home>Back to home</button>
      </header>
      <div class="commerce-products">${products.map(renderStorefrontProduct).join("")}</div>
    </section>
  `;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function customerOrderPrimaryItem(order = {}) {
  return (order.items || [])[0] || {};
}

function customerOrderAmount(order = {}) {
  return order.customerPaid || order.finance?.totalPaise || order.finance?.customerPaidPaise || 0;
}

function customerOrderStatusLabel(status = "placed") {
  return String(status || "placed").replaceAll("_", " ");
}

function customerOrderTimeline(order = {}) {
  const status = String(order.status || "placed");
  const statusIndex = {
    placed: 0,
    pending: 0,
    accepted: 1,
    confirmed: 1,
    packed: 2,
    shipped: 3,
    out_for_delivery: 4,
    delivered: 5,
    cancelled: 6,
    returned: 6,
  };
  const activeIndex = statusIndex[status] ?? 0;
  const steps =
    status === "cancelled"
      ? ["Order placed", "Cancelled"]
      : status === "returned"
        ? ["Order placed", "Shipped", "Returned"]
        : ["Order placed", "Seller accepted", "Packed", "Shipped", "Out for delivery", "Delivered"];
  return steps
    .map((label, index) => {
      const done = status === "cancelled" || status === "returned" ? index <= steps.length - 1 : index <= activeIndex;
      const active = status === "cancelled" || status === "returned" ? index === steps.length - 1 : index === activeIndex;
      return `
        <li class="${done ? "done" : ""} ${active ? "active" : ""}">
          <span></span>
          <strong>${escapeHtml(label)}</strong>
          <small>${active ? new Date(order.updatedAt || order.createdAt || Date.now()).toLocaleDateString() : ""}</small>
        </li>
      `;
    })
    .join("");
}

function renderCustomerOrderCard(order) {
  const item = customerOrderPrimaryItem(order);
  const status = customerOrderStatusLabel(order.status);
  return `
    <article class="customer-order-card" data-customer-order-row="${escapeHtml(order.orderId)}">
      <div class="customer-order-product">
        <div class="customer-order-thumb">${escapeHtml((item.title || item.name || "P").charAt(0))}</div>
        <div>
          <strong>${escapeHtml(item.title || item.name || "Product")}</strong>
          <small>${escapeHtml(order.sellerName || "Axzen seller")} | Qty ${escapeHtml(item.quantity || item.qty || 1)}</small>
          <b>${rupees(customerOrderAmount(order))}</b>
        </div>
      </div>
      <ol class="customer-order-timeline mini">${customerOrderTimeline(order)}</ol>
      <div class="customer-order-card-meta">
        <span class="status-badge ${escapeHtml(String(order.status || "placed").replaceAll("_", "-"))}">${escapeHtml(status)}</span>
        <small>${escapeHtml(order.awbNumber || order.trackingId || order.trackingNumber || "Tracking will update after shipment")}</small>
      </div>
    </article>
  `;
}

async function openCustomerOrdersView() {
  const token = localStorage.getItem("axzenToken");
  if (!token || localStorage.getItem("axzenRole") !== "customer") {
    openLoginArea();
    return;
  }
  closeCustomerPopovers();
  document.querySelector("[data-customer-orders-modal]")?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<aside class="customer-product-modal customer-orders-modal" data-customer-orders-modal>
      <article>
        <button type="button" data-close-customer-orders>Close</button>
        <div class="customer-product-detail wide">
          <p class="eyebrow">My orders</p>
          <h2>Order history</h2>
          <p>Loading your latest orders...</p>
        </div>
      </article>
    </aside>`
  );
  try {
    const response = await fetch("/api/orders/customer", { headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load orders.");
    const orders = result.orders || [];
    customerOrdersCache = orders;
    document.querySelector("[data-customer-orders-modal] article").innerHTML = `
      <button type="button" data-close-customer-orders>Close</button>
      <div class="customer-product-detail wide">
        <p class="eyebrow">My orders</p>
        <h2>Order history</h2>
        ${orders.length ? `<div class="customer-order-history">${orders.map(renderCustomerOrderCard).join("")}</div>` : `<p class="order-invoice-empty">No orders yet.</p>`}
      </div>
    `;
  } catch (error) {
    document.querySelector("[data-customer-orders-modal] .customer-product-detail").innerHTML = `<h2>Order history</h2><p>${escapeHtml(error.message)}</p>`;
  }
}

function openCustomerOrderDetails(orderId) {
  const order = customerOrdersCache.find((item) => String(item.orderId) === String(orderId));
  if (!order) return;
  const items = order.items || [];
  const item = customerOrderPrimaryItem(order);
  const shipping = order.shippingAddress || {};
  const productTotal = order.productTotal || order.finance?.productTotalPaise || order.finance?.subtotalPaise || 0;
  const deliveryCharge = order.deliveryCharge || order.finance?.deliveryChargePaise || order.finance?.deliveryFeePaise || 0;
  const tracking = order.awbNumber || order.trackingId || order.trackingNumber || "";
  const target = document.querySelector("[data-customer-orders-modal] article");
  if (!target) return;
  target.innerHTML = `
    <button type="button" data-close-customer-orders>Close</button>
    <div class="customer-order-detail wide">
      <button type="button" class="secondary-button" data-back-customer-orders>Back to orders</button>
      <section class="customer-order-main-card">
        <div class="customer-order-product large">
          <div class="customer-order-thumb">${escapeHtml((item.title || item.name || "P").charAt(0))}</div>
          <div>
            <p class="eyebrow">Order ${escapeHtml(order.orderId)}</p>
            <h2>${escapeHtml(item.title || item.name || "Product")}</h2>
            <p>${escapeHtml(order.sellerName || "Axzen seller")} | ${escapeHtml(item.sku || "SKU")} | Qty ${escapeHtml(item.quantity || item.qty || 1)}</p>
            <strong>${rupees(customerOrderAmount(order))}</strong>
          </div>
        </div>
        <ol class="customer-order-timeline">${customerOrderTimeline(order)}</ol>
        <div class="customer-order-actions">
          ${order.trackingUrl ? `<a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Track shipment</a>` : `<span>Tracking updates after courier pickup.</span>`}
          <button type="button" data-print-invoice="${escapeHtml(order.orderId)}">Invoice</button>
          <button type="button" data-share-order="${escapeHtml(order.orderId)}">Send order details</button>
        </div>
      </section>
      <aside class="customer-order-side">
        <article>
          <h3>Delivery details</h3>
          <p>${escapeHtml([shipping.fullName, shipping.phone].filter(Boolean).join(" | ") || "Customer")}</p>
          <p>${escapeHtml([shipping.address, shipping.city, shipping.state, shipping.pincode].filter(Boolean).join(", ") || "Address saved with order")}</p>
          <small>${tracking ? `AWB / Tracking: ${tracking}` : "AWB will appear after shipment."}</small>
        </article>
        <article>
          <h3>Price details</h3>
          <div><span>Product total</span><b>${rupees(productTotal || customerOrderAmount(order))}</b></div>
          <div><span>Delivery charge</span><b>${rupees(deliveryCharge)}</b></div>
          <div><span>Payment</span><b>${escapeHtml(order.paymentMethod || "COD / Online")}</b></div>
          <div class="cart-total-row"><span>Total amount</span><strong>${rupees(customerOrderAmount(order))}</strong></div>
        </article>
      </aside>
      <section class="customer-order-items">
        <h3>Items in this order</h3>
        ${items
          .map(
            (entry) => `
              <div>
                <strong>${escapeHtml(entry.title || entry.name || "Product")}</strong>
                <span>Qty ${escapeHtml(entry.quantity || entry.qty || 1)}</span>
                <b>${rupees(entry.pricePaise || entry.price || 0)}</b>
              </div>
            `
          )
          .join("")}
      </section>
    </div>
  `;
}

function openCustomerProductModal(productId) {
  const product = storefrontProductsCache.find((item) => String(item.id) === String(productId));
  if (!product) return;
  closeCustomerPopovers();
  document.querySelector("[data-customer-product-modal]")?.remove();
  const images = product.images?.length ? product.images : [product.image].filter(Boolean);
  const mrp = Number(product.mrpPaise) > Number(product.pricePaise) ? product.mrp || rupees(product.mrpPaise) : "";
  const stock = Number(product.stock) || 0;
  const productTitle = product.title || "Product";
  const sellerName = product.sellerName || "Seller";
  const sellerDetails = product.sellerStoreDetails || {};
  const sellerLogo = sellerDetails.profileImageUrl || "";
  const sellerFollowers = compactCount(product.sellerFollowerCount || 0);
  const fallbackImage = `<div class="commerce-product-image">${escapeHtml(product.category || "Product")}</div>`;
  const mainImage = images[0]
    ? `<img data-product-main-image src="${escapeHtml(images[0])}" alt="${escapeHtml(productTitle)}">`
    : fallbackImage;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<aside class="customer-product-modal" data-customer-product-modal>
      <article>
        <button type="button" data-close-customer-product>Close</button>
        <div class="customer-product-gallery">
          <div class="customer-product-thumbs">
            ${
              images.length
                ? images
                    .slice(0, 4)
                    .map((image, index) => `<button type="button" class="${index === 0 ? "active" : ""}" data-product-thumb="${escapeHtml(image)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(productTitle)} thumbnail ${index + 1}"></button>`)
                    .join("")
                : `<button type="button" class="active">${fallbackImage}</button>`
            }
            ${images.length > 4 ? `<span>+${images.length - 4}</span>` : ""}
          </div>
          <div class="customer-product-main-image">
            <span class="product-popular-badge">Popular</span>
            <button class="product-wishlist ${isWishlisted(product.id) ? "active" : ""}" type="button" data-wishlist-product="${escapeHtml(product.id)}" aria-pressed="${isWishlisted(product.id)}" aria-label="Add ${escapeHtml(productTitle)} to wishlist">&hearts;</button>
            ${mainImage}
          </div>
        </div>
        <div class="customer-product-detail">
          <div class="customer-product-seller-panel">
            ${sellerAvatarMarkup(sellerName, sellerLogo, "seller-modal-avatar")}
            <div>
              <span>Sold by</span>
              <button type="button" data-open-seller="${escapeHtml(product.sellerId)}">${escapeHtml(sellerName)}</button>
              ${sellerVerifiedIcon()}
              <small>${Number(product.ratingAverage || 0).toFixed(1)} rating &middot; ${sellerFollowers} followers</small>
            </div>
            <button type="button" class="view-store-button" data-open-seller="${escapeHtml(product.sellerId)}">View Store</button>
          </div>
          <h2>${escapeHtml(productTitle)}</h2>
          <p>${escapeHtml(product.description || "Seller verified product on Axzen.")}</p>
          <div class="customer-price-row">${mrp ? `<del>${escapeHtml(mrp)}</del>` : ""}<strong>${escapeHtml(product.price || "Rs. 0")}</strong></div>
          <p class="customer-product-rating">${escapeHtml(product.unitLabel || "1 pc")} | ${Number(product.ratingAverage || 0).toFixed(1)} rating (${Number(product.ratingCount) || 0}) <span>(0 Reviews)</span></p>
          <p class="${stock > 0 ? "stock-left" : "stock-out"} customer-product-stock">${stock > 0 ? `${Math.min(stock, 5)} items left` : "Currently not available"}</p>
          <div class="customer-product-trusted">
            <strong>Trusted Seller</strong>
            <span>This product is quality-checked and shipped by ${escapeHtml(sellerName)}.</span>
          </div>
          <div class="customer-product-actions">
            <button type="button" class="secondary-button" data-share-product="${escapeHtml(product.id)}">Share product</button>
            <button type="button" data-add-cart="${escapeHtml(product.id)}" ${stock > 0 ? "" : "disabled"}>Add to cart</button>
          </div>
        </div>
        <div class="customer-product-trust-row">
          <span>100% Original</span>
          <span>Secure Payment</span>
          <span>7 Days Return</span>
          <span>Pan India Delivery</span>
          <span>Best Price</span>
          <span>24x7 Support</span>
        </div>
      </article>
    </aside>`
  );
  const url = new URL(window.location.href);
  url.searchParams.set("product", product.id);
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function loadStorefrontCatalog() {
  const grid = document.querySelector(".commerce-products");
  if (!grid) return;
  try {
    const [configResponse, response] = await Promise.all([fetch("/api/customer/app-config"), fetch("/api/customer/catalog")]);
    const configResult = await configResponse.json();
    if (configResponse.ok) customerAppConfig = configResult.config || {};
    renderCustomerSaleBanner();
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load products.");
    if (result.products?.length) {
      storefrontProductsCache = result.products;
      renderCustomerCategories(result.products);
      renderStorefrontProducts(result.products);
      renderStoreRail();
      renderCategorySections(result.products);
      renderRecentProducts();
      const urlParams = new URLSearchParams(window.location.search);
      const productId = urlParams.get("product");
      const sellerId = urlParams.get("seller");
      const category = urlParams.get("category");
      const follows = urlParams.get("follows");
      if (sellerId) openCustomerSellerPage(sellerId, { push: false });
      else if (category) openCustomerCategoryPage(category, { push: false });
      else if (follows) openCustomerFollowsView({ push: false });
      if (productId) {
        window.setTimeout(() => {
          openCustomerProductModal(productId);
          saveRecentProduct(productId);
        }, 100);
      }
    }
  } catch (error) {
    console.warn(error.message || "Customer catalog unavailable.");
  } finally {
    renderCartSummary(false);
  }
}

function initCustomerLocation() {
  if (!customerLocationChip) return;
  const saved = localStorage.getItem(CUSTOMER_LOCATION_KEY);
  if (saved) {
    customerLocationChip.textContent = saved;
    return;
  }
  customerLocationChip.textContent = "Select delivery location";
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const label = `Location set ${position.coords.latitude.toFixed(2)}, ${position.coords.longitude.toFixed(2)}`;
      localStorage.setItem(CUSTOMER_LOCATION_KEY, label);
      customerLocationChip.textContent = label;
    },
    () => {
      customerLocationChip.textContent = "Location not set";
    },
    { timeout: 5000, maximumAge: 86400000 }
  );
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
  const freeDeliveryEnabled = seller.freeDeliveryEnabled === true;
  const freeDeliveryMinOrder = Math.round((Number(seller.freeDeliveryMinOrderPaise) || 0) / 100);
  return `
    <article class="dashboard-panel seller-payment-settings" id="sellerPayments" data-seller-section="payments">
      <div class="order-invoice-heading">
        <div>
          <p class="eyebrow">Seller Payment Agent</p>
          <h3>Payment options</h3>
        </div>
        <span>${seller.codEnabled ? "COD on" : "COD off"}</span>
      </div>
      <form class="seller-payment-toggle-grid" data-seller-payment-form>
        <label class="seller-payment-box ${seller.codEnabled ? "enabled" : "disabled"}">
          <span>Cash on Delivery</span>
          <strong>${seller.codEnabled ? "Enabled" : "Disabled"}</strong>
          <input type="checkbox" name="codEnabled" ${seller.codEnabled ? "checked" : ""}>
          <small>Seller can allow or stop COD orders.</small>
        </label>
        <label class="seller-payment-box ${seller.onlinePaymentEnabled ? "enabled" : "disabled"}">
          <span>Online Payment</span>
          <strong>${seller.onlinePaymentEnabled ? "Enabled" : "Disabled"}</strong>
          <input type="checkbox" name="onlinePaymentEnabled" ${seller.onlinePaymentEnabled ? "checked" : ""}>
          <small>Ready for Razorpay/payment gateway integration.</small>
        </label>
        <label class="seller-payment-box ${freeDeliveryEnabled ? "enabled" : "disabled"}">
          <span>Free Delivery</span>
          <strong>${freeDeliveryEnabled ? "Accepted" : "Not accepted"}</strong>
          <div class="seller-payment-choice-row">
            <label><input type="radio" name="freeDeliveryEnabled" value="true" ${freeDeliveryEnabled ? "checked" : ""}> Accept</label>
            <label><input type="radio" name="freeDeliveryEnabled" value="false" ${freeDeliveryEnabled ? "" : "checked"}> Not accept</label>
          </div>
          <small>Accept means customer gets free delivery above minimum sale. Delivery cost is cut from seller payout.</small>
          <label class="seller-free-delivery-threshold" ${freeDeliveryEnabled ? "" : "hidden"}>
            Minimum sale amount
            <input type="number" name="freeDeliveryMinOrder" min="0" step="1" value="${freeDeliveryMinOrder}" placeholder="Minimum sale amount">
          </label>
        </label>
        <button class="seller-payment-save" type="submit">Save payment options</button>
        <p class="seller-payment-message" data-seller-payment-message></p>
      </form>
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
    ["sellerReturns", "Returns", "Return requests, refund status and issue handling"],
    ["sellerEmployees", "Employees", "Add seller staff, assign work and manage access"],
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
        ${sellerDetailTile("Free delivery", seller.freeDeliveryEnabled ? `Above ${rupees(seller.freeDeliveryMinOrderPaise || 0)}` : "Disabled")}
        ${sellerDetailTile("KYC status", seller.kycStatus || "pending")}
      </div>
      <div class="seller-agreement-summary">
        ${agreementLabels.map(([label, accepted]) => `<span class="${accepted ? "accepted" : ""}">${accepted ? "Yes" : "Pending"} - ${escapeHtml(label)}</span>`).join("")}
      </div>
      <section class="seller-follower-panel">
        <div>
          <p class="eyebrow">Followers</p>
          <strong data-seller-follower-count>${sellerFollowerCount}</strong>
          <small>Customers following this seller page</small>
        </div>
        <form data-seller-follower-message>
          <input name="message" maxlength="180" placeholder="Send offer/update to followers" required>
          <button type="submit">Send notification</button>
          <p data-seller-follower-message-status></p>
        </form>
      </section>
    </article>
    <section class="seller-module-grid">
      ${modules
        .map(([id, title, detail]) => `<article class="dashboard-panel seller-module-card" id="${escapeHtml(id)}" data-seller-section="${escapeHtml(title.toLowerCase())}"><span>${escapeHtml(title)}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></article>`)
        .join("")}
    </section>
    ${renderSellerInventory(sellerProductsCache)}
    ${renderSellerSupportPanel(sellerTicketsCache)}
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
        <label>MRP<input name="mrp" type="number" min="0" step="0.01" required placeholder="1299"></label>
        <label>Selling price<input name="price" type="number" min="0" step="0.01" required placeholder="999"></label>
        <label>Qty / unit<input name="unitLabel" required placeholder="1 pc, 500 g, pack of 2"></label>
        <label>Stock<input name="stock" type="number" min="0" step="1" placeholder="10"></label>
        <label class="wide">Product details<textarea name="description" placeholder="Material, warranty, ingredients, size, or usage details"></textarea></label>
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

function renderSellerInventory(products = []) {
  return `
    <article class="dashboard-panel seller-inventory-panel" id="sellerInventory" data-seller-section="inventory">
      <div class="seller-about-heading">
        <div>
          <p class="eyebrow">Inventory</p>
          <h3>Stock and low-stock control</h3>
          <p>Update stock, low-stock level, and investment value for your products.</p>
        </div>
        <span>${products.length} products</span>
      </div>
      <div class="seller-inventory-list" data-seller-inventory-list>
        ${renderSellerInventoryRows(products)}
      </div>
    </article>
  `;
}

function renderSellerInventoryRows(products = []) {
  if (!products.length) return `<p class="order-invoice-empty">No products available for inventory updates.</p>`;
  return products
    .map(
      (product) => `
        <form class="seller-inventory-row ${Number(product.stock || 0) <= Number(product.lowStockThreshold ?? 5) ? "low" : ""}" data-inventory-update="${escapeHtml(product._id)}">
          <strong>${escapeHtml(product.title)}</strong>
          <span>${escapeHtml(product.sku)} | ${escapeHtml(product.status || "pending")}</span>
          <label>Stock<input name="stock" type="number" min="0" value="${Number(product.stock || 0)}"></label>
          <label>Low stock<input name="lowStockThreshold" type="number" min="0" value="${Number(product.lowStockThreshold ?? 5)}"></label>
          <label>Investment<input name="investment" type="number" min="0" step="0.01" value="${((Number(product.investmentPaise) || 0) / 100).toFixed(2)}"></label>
          <button type="submit">Save</button>
        </form>
      `
    )
    .join("");
}

function renderSellerSupportPanel(tickets = []) {
  const openTickets = tickets.filter((ticket) => ticket.status !== "closed").length;
  const closedTickets = tickets.filter((ticket) => ticket.status === "closed").length;
  return `
    <article class="dashboard-panel seller-support-panel" id="sellerSupport" data-seller-section="support">
      <div class="seller-about-heading">
        <div>
          <p class="eyebrow">Seller help</p>
          <h3>Raise a complaint</h3>
          <p>Create a support token and track complaint status from Axzen admin.</p>
        </div>
        <span>${openTickets} open</span>
      </div>
      <div class="seller-support-summary">
        <article>
          <span>Complaints</span>
          <strong>${tickets.length}</strong>
          <small>Total tokens raised</small>
        </article>
        <article>
          <span>Closed tickets</span>
          <strong>${closedTickets}</strong>
          <small>Resolved by admin</small>
        </article>
        <article>
          <span>Raise a complaint</span>
          <strong>${openTickets}</strong>
          <small>Open and in-progress tokens</small>
        </article>
      </div>
      <form class="seller-support-form" data-seller-ticket-create>
        <label>Category
          <select name="category">
            ${["orders", "payments", "shipments", "products", "inventory", "technical", "other"].map((category) => `<option value="${category}">${category}</option>`).join("")}
          </select>
        </label>
        <label>Message<textarea name="message" required placeholder="Mention your complaint clearly"></textarea></label>
        <button type="submit">Create token</button>
        <p data-seller-ticket-message></p>
      </form>
      <h3>Complaint status</h3>
      <div class="seller-ticket-list" data-seller-ticket-list>${renderSellerTickets(tickets)}</div>
    </article>
  `;
}

function renderSellerTickets(tickets = []) {
  if (!tickets.length) return `<p class="order-invoice-empty">No support tokens yet.</p>`;
  return tickets
    .map(
      (ticket) => `
        <article class="seller-ticket-card ${escapeHtml(ticket.status)}">
          <strong>${escapeHtml(ticket.ticketId)}</strong>
          <span>${escapeHtml(ticket.category)} | ${escapeHtml(ticket.status)}</span>
          <p>${escapeHtml(ticket.message)}</p>
          ${ticket.departmentNote ? `<small>${escapeHtml(ticket.departmentNote)}</small>` : ""}
        </article>
      `
    )
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
    const inventoryList = document.querySelector("[data-seller-inventory-list]");
    if (inventoryList) inventoryList.innerHTML = renderSellerInventoryRows(sellerProductsCache);
    if (count) count.textContent = `${result.products?.length || 0} products`;
  } catch (error) {
    const message = document.querySelector("[data-seller-product-message]");
    if (message) {
      message.textContent = error.message || "Unable to load products.";
      message.classList.add("error");
    }
  }
}

async function loadSellerFollowerSummary() {
  const countNode = document.querySelector("[data-seller-follower-count]");
  if (!countNode || localStorage.getItem("axzenRole") !== "seller") return;
  const token = localStorage.getItem("axzenToken");
  try {
    const response = await fetch("/api/seller/followers", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load followers.");
    sellerFollowerCount = Number(result.followerCount) || 0;
    countNode.textContent = sellerFollowerCount;
  } catch (error) {
    countNode.textContent = String(sellerFollowerCount || 0);
  }
}

async function loadSellerTickets() {
  const panel = document.querySelector("[data-seller-ticket-list]");
  const supportPanel = document.querySelector("#sellerSupport");
  if (!panel && !supportPanel) return;
  const token = localStorage.getItem("axzenToken");
  try {
    const response = await fetch("/api/seller/support-tickets", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load support tickets.");
    sellerTicketsCache = result.tickets || [];
    if (supportPanel) {
      supportPanel.outerHTML = renderSellerSupportPanel(sellerTicketsCache);
      setSellerSection(getSellerSectionFromHash());
    } else if (panel) {
      panel.innerHTML = renderSellerTickets(sellerTicketsCache);
    }
  } catch (error) {
    if (panel) panel.innerHTML = `<p class="order-invoice-empty">${escapeHtml(error.message || "Unable to load support tickets.")}</p>`;
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

function playSellerFallbackBeep(orderCount = 1) {
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

function playSellerOrderNotification(orderCount = 1) {
  if (localStorage.getItem(SELLER_NOTIFICATION_MUTE_KEY) === "true") return;
  try {
    if (!sellerNotificationAudio) sellerNotificationAudio = new Audio(SELLER_SIREN_SRC);
    sellerNotificationAudio.pause();
    sellerNotificationAudio.currentTime = 0;
    sellerNotificationAudio.loop = false;
    const playback = sellerNotificationAudio.play();
    if (playback?.catch) playback.catch(() => playSellerFallbackBeep(orderCount));
  } catch (error) {
    playSellerFallbackBeep(orderCount);
  }
}

function getSellerNotificationHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(SELLER_NOTIFICATION_HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function saveSellerNotificationHistory(history) {
  localStorage.setItem(SELLER_NOTIFICATION_HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
}

function sellerNotificationAmount(order = {}) {
  return order.customerPaid || order.finance?.customerPaidPaise || order.totalPaise || order.productTotal || 0;
}

function updateSellerNotificationBadge() {
  const badge = document.querySelector("[data-seller-unread-badge]");
  const count = Number(localStorage.getItem(SELLER_NOTIFICATION_UNREAD_KEY) || 0);
  if (!badge) return;
  badge.textContent = String(count);
  badge.hidden = count <= 0;
}

function renderSellerNotificationHistory() {
  const list = document.querySelector("[data-seller-notification-list]");
  const muteButton = document.querySelector("[data-seller-notification-mute]");
  if (muteButton) muteButton.textContent = localStorage.getItem(SELLER_NOTIFICATION_MUTE_KEY) === "true" ? "Unmute" : "Mute";
  if (!list) return;
  const history = getSellerNotificationHistory();
  list.innerHTML = history.length
    ? history
        .map(
          (entry) => `
            <article>
              <strong>🔔 New Order Received</strong>
              <span>${escapeHtml(entry.orderId || "Order")} - ${escapeHtml(entry.customerName || "Customer")}</span>
              <small>${escapeHtml(entry.amount || "")} - ${formatDate(entry.createdAt)}</small>
            </article>
          `
        )
        .join("")
    : "<p>No notifications yet.</p>";
}

function requestSellerNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") return;
  Notification.requestPermission().catch(() => {});
}

function showSellerBrowserNotification(order = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const customerName = sellerOrderCustomerName(order);
  const amount = rupees(sellerNotificationAmount(order));
  new Notification("🔔 New Order Received", {
    body: `Order ID: ${order.orderId}\nCustomer: ${customerName}\nAmount: ${amount}`,
    icon: "/assets/favicon.png",
    tag: order.orderId || `axzen-order-${Date.now()}`,
  });
}

function showSellerRealtimeToast(order = {}) {
  let toast = document.querySelector("[data-seller-realtime-toast]");
  if (!toast) {
    document.body.insertAdjacentHTML("beforeend", `<div class="seller-realtime-toast" data-seller-realtime-toast hidden></div>`);
    toast = document.querySelector("[data-seller-realtime-toast]");
  }
  toast.innerHTML = `
    <strong>🔔 New Order Received</strong>
    <span>${escapeHtml(order.orderId || "New order")} - ${escapeHtml(sellerOrderCustomerName(order))}</span>
    <small>${rupees(sellerNotificationAmount(order))}</small>
  `;
  toast.hidden = false;
  window.setTimeout(() => {
    toast.hidden = true;
  }, 5000);
}

function addSellerNotificationHistory(order = {}) {
  const history = getSellerNotificationHistory();
  const alreadySeen = history.some((item) => item.orderId && item.orderId === order.orderId);
  const entry = {
    orderId: order.orderId,
    customerName: sellerOrderCustomerName(order),
    amount: rupees(sellerNotificationAmount(order)),
    createdAt: order.createdAt || new Date().toISOString(),
  };
  saveSellerNotificationHistory([entry, ...history.filter((item) => item.orderId !== entry.orderId)]);
  if (!alreadySeen) {
    localStorage.setItem(SELLER_NOTIFICATION_UNREAD_KEY, String(Number(localStorage.getItem(SELLER_NOTIFICATION_UNREAD_KEY) || 0) + 1));
  }
  updateSellerNotificationBadge();
  renderSellerNotificationHistory();
}

function refreshSellerOrdersPanelFromCache() {
  const panel = document.querySelector("#orderInvoicePanel");
  if (!panel) return;
  const section = dashboardSection?.dataset.sellerSection || "orders";
  panel.outerHTML = renderOrderInvoicePanel(sellerOrdersCache, "seller");
  updateSellerOrderTopbarTabs(sellerOrdersCache);
  renderSellerOrdersRows();
  setSellerSection(section);
}

function handleSellerRealtimeOrder(order = {}) {
  const key = String(order._id || order.orderId || "");
  if (key) {
    const existingIndex = sellerOrdersCache.findIndex((entry) => String(entry._id || entry.orderId) === key);
    if (existingIndex >= 0) sellerOrdersCache[existingIndex] = order;
    else sellerOrdersCache = [order, ...sellerOrdersCache];
  }
  addSellerNotificationHistory(order);
  localStorage.setItem(
    "axzenSellerLastOrderSeen",
    String(Math.max(Number(localStorage.getItem("axzenSellerLastOrderSeen") || 0), new Date(order.createdAt || order.updatedAt || Date.now()).getTime()))
  );
  refreshSellerOrdersPanelFromCache();
  showSellerRealtimeToast(order);
  showSellerBrowserNotification(order);
  playSellerOrderNotification(1);
}

function notifyNewSellerOrders(orders = []) {
  const latestOrderTime = orders.reduce((latest, order) => Math.max(latest, new Date(order.createdAt || order.updatedAt || 0).getTime()), 0);
  const storageKey = "axzenSellerLastOrderSeen";
  const previous = Number(localStorage.getItem(storageKey) || 0);
  const newOrders = orders.filter((order) => new Date(order.createdAt || order.updatedAt || 0).getTime() > previous);
  if (previous && newOrders.length) {
    newOrders.forEach((order) => {
      addSellerNotificationHistory(order);
      showSellerRealtimeToast(order);
      showSellerBrowserNotification(order);
    });
    playSellerOrderNotification(newOrders.length);
  }
  if (latestOrderTime) localStorage.setItem(storageKey, String(latestOrderTime));
}

function disconnectSellerRealtime() {
  if (sellerSocket) {
    sellerSocket.disconnect();
    sellerSocket = null;
  }
}

function connectSellerRealtime() {
  const token = localStorage.getItem("axzenToken");
  if (!token || localStorage.getItem("axzenRole") !== "seller" || !window.io) return;
  disconnectSellerRealtime();
  sellerSocket = window.io({
    auth: { token },
  });
  sellerSocket.on("newOrder", handleSellerRealtimeOrder);
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
  const label = normalized === "waiting_for_pickup" ? "Waiting for pickup agent" : normalized.replace(/_/g, " ");
  return `<span class="seller-status-badge ${escapeHtml(normalized)}">${escapeHtml(label)}</span>`;
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
      ["reject", "Cancel"],
    ];
  }
  if (status === "accepted") return [["pack", "Packing Complete"], ["reject", "Cancel"]];
  if (status === "packed") {
    const pickupActions = order.pickupAgentPhone ? [["agent", "Assigned to agent"], ["call-agent", "Call agent"]] : [["track", "Waiting for pickup agent"]];
    return [...pickupActions, ["reject", "Cancel"]];
  }
  if (status === "shipped") return [["track", "Track Shipment"]];
  if (status === "delivered") return [["details", "Delivery Details"]];
  if (status === "returned") return [["details", "Return Details"]];
  return [];
}

function getSellerFilteredOrders() {
  const panel = document.querySelector("#orderInvoicePanel");
  const activeTab = getActiveSellerOrderTab();
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

function getActiveSellerOrderTab() {
  const panel = document.querySelector("#orderInvoicePanel");
  const topbarActive = document.querySelector("[data-seller-order-topbar-tabs] [data-seller-order-tab].active")?.dataset.sellerOrderTab;
  return panel?.dataset.activeTab || topbarActive || "new";
}

function getSellerOrderCounts(orders = sellerOrdersCache) {
  return sellerOrderTabs.reduce((acc, [key]) => {
    acc[key] = orders.filter((order) => normalizeSellerOrderStatus(order.status) === key).length;
    return acc;
  }, {});
}

function renderSellerOrderTabsMarkup(counts = {}, activeTab = "new") {
  return sellerOrderTabs
    .map(
      ([key, label]) => `
        <button type="button" class="${key === activeTab ? "active" : ""} ${key === "new" && (counts[key] || 0) ? "has-new" : ""}" data-seller-order-tab="${key}">
          ${escapeHtml(label)} <span>${counts[key] || 0}</span>
        </button>
      `
    )
    .join("");
}

function updateSellerOrderTopbarTabs(orders = sellerOrdersCache) {
  const container = document.querySelector("[data-seller-order-topbar-tabs]");
  if (!container) return;
  container.innerHTML = renderSellerOrderTabsMarkup(getSellerOrderCounts(orders), getActiveSellerOrderTab());
}

function syncSellerFreeDeliveryThreshold(form) {
  const accepted = form?.querySelector("[name='freeDeliveryEnabled']:checked")?.value === "true";
  const threshold = form?.querySelector(".seller-free-delivery-threshold");
  if (threshold) threshold.hidden = !accepted;
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
          </section>
          <section>
            <h4>Payment details</h4>
            <p>Method: ${escapeHtml(order.paymentMethod || "-")}</p>
            <p>Status: ${escapeHtml(order.paymentStatus || "pending")}</p>
          </section>
          <section>
            <h4>Shipment details</h4>
            <p>Status: ${escapeHtml(order.shipmentStatus || order.deliveryStatus || "created")}</p>
            <p>Courier: ${escapeHtml(order.courierName || "-")}</p>
            <p>AWB: ${escapeHtml(order.awbNumber || "-")}</p>
            ${order.pickupAgentName ? `<p>Agent: ${escapeHtml(order.pickupAgentName)}</p>` : ""}
            ${order.pickupAgentPhone ? `<p>Agent phone: ${escapeHtml(order.pickupAgentPhone)}</p>` : ""}
            ${order.trackingUrl ? `<a href="${escapeHtml(order.trackingUrl)}" target="_blank" rel="noopener noreferrer">Open tracking</a>` : ""}
            ${order.cancelReason ? `<p>Cancel reason: ${escapeHtml(order.cancelReason)}</p>` : ""}
            ${order.returnReason ? `<p>Return reason: ${escapeHtml(order.returnReason)}</p>` : ""}
            ${order.refundStatus && order.refundStatus !== "none" ? `<p>Refund: ${escapeHtml(order.refundStatus)}${order.refundDueDate ? ` by ${formatDate(order.refundDueDate)}` : ""}</p>` : ""}
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
    const previousTab = getActiveSellerOrderTab();
    sellerOrdersCache = orders;
    const counts = getSellerOrderCounts(orders);
    const pendingCount = orders.filter((order) => ["new", "accepted"].includes(normalizeSellerOrderStatus(order.status))).length;
    return `
      <article class="dashboard-panel seller-orders-page" id="orderInvoicePanel" data-seller-section="orders" data-active-tab="${escapeHtml(previousTab)}">
        <div class="seller-orders-kpis">
          <span><small>Total orders</small><strong>${orders.length}</strong></span>
          <span><small>Open orders</small><strong>${pendingCount}</strong></span>
          <span><small>Shipment ready</small><strong>${counts.packed || 0}</strong></span>
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
      updateSellerOrderTopbarTabs(result.orders || []);
      renderSellerOrdersRows();
      setSellerSection(getSellerSectionFromHash());
    }
  } catch (error) {
    document.querySelector("#orderInvoicePanel")?.remove();
    document.querySelector(".seller-payment-settings")?.remove();
    dashboardPanels.insertAdjacentHTML("beforeend", renderOrderInvoicePanel([], role));
    if (role === "seller") {
      updateSellerOrderTopbarTabs([]);
      renderSellerOrdersRows();
      setSellerSection(getSellerSectionFromHash());
    }
  }
}

async function updateSellerSetting(key, value, reload = true) {
  await updateSellerSettings({ [key]: value === "true" }, reload);
}

async function updateSellerSettings(payload, reload = true) {
  const token = localStorage.getItem("axzenToken");
  const response = await fetch("/api/sellers/me", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "Unable to update seller settings.");
  }
  if (reload) await loadRoleOrders("seller");
}

async function updateSellerOrderAction(orderId, action, reason = "") {
  const token = localStorage.getItem("axzenToken");
  const response = await fetch(`/api/seller/orders/${encodeURIComponent(orderId)}/${encodeURIComponent(action)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reason }),
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

function setOwnerLoginMessage(message, isError = false) {
  const node = document.querySelector("[data-owner-login-message]");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", isError);
  node.style.display = "block";
}

function getOwnerRecaptcha() {
  const role = "owner";
  if (recaptchaVerifiers.has(role)) return recaptchaVerifiers.get(role);
  const verifier = new RecaptchaVerifier(auth, "recaptcha-owner", { size: "invisible" });
  recaptchaVerifiers.set(role, verifier);
  return verifier;
}

function openOwnerLoginModal() {
  if (!ownerLoginModal) return;
  const phoneInput = ownerLoginModal.querySelector("[data-owner-phone]");
  if (phoneInput && !phoneInput.value) phoneInput.value = localStorage.getItem("axzenPhone") || "";
  ownerLoginModal.hidden = false;
  phoneInput?.focus();
}

function closeOwnerLoginModal() {
  if (ownerLoginModal) ownerLoginModal.hidden = true;
}

function enableSellerOwnerMode() {
  localStorage.setItem(SELLER_OWNER_KEY, "true");
  document.body.classList.add("seller-owner-mode");
  if (dashboardRole) dashboardRole.hidden = false;
  if (dashboardTitle) dashboardTitle.hidden = false;
  if (dashboardSummary) dashboardSummary.hidden = false;
  if (sellerProfilePopover) sellerProfilePopover.hidden = true;
  closeOwnerLoginModal();
  setSellerSection("dashboard", true);
  dashboardSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDashboard(payload) {
  const { user, dashboard } = payload;
  updateSellerHeader(user);
  if (user.role !== "seller") stopSellerOrderPolling();
  if (user.role === "customer") startCustomerNotificationPolling();
  else stopCustomerNotificationPolling();

  if (loginSection) {
    loginSection.hidden = true;
    if (loginSection.classList.contains("customer-login-section")) document.body.classList.remove("customer-login-open");
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
    loadSellerFollowerSummary();
    loadSellerTickets();
    requestSellerNotificationPermission();
    updateSellerNotificationBadge();
    renderSellerNotificationHistory();
    connectSellerRealtime();
    startSellerOrderPolling();
  }

  if (dashboardSection) {
    dashboardSection.hidden = user.role === "customer";
    if (user.role !== "customer") dashboardSection.scrollIntoView({ behavior: "smooth" });
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
  if (
    sellerProfilePopover &&
    !sellerProfilePopover.hidden &&
    !event.target.closest("[data-seller-profile-menu]") &&
    !event.target.closest("[data-seller-profile-popover]")
  ) {
    sellerProfilePopover.hidden = true;
  }
  if (
    customerProfilePopover &&
    !customerProfilePopover.hidden &&
    !event.target.closest("[data-customer-profile-menu]") &&
    !event.target.closest("[data-customer-profile-popover]")
  ) {
    customerProfilePopover.hidden = true;
  }
  const customerNotificationPanel = document.querySelector("[data-customer-notification-panel]");
  if (
    customerNotificationPanel &&
    !customerNotificationPanel.hidden &&
    !event.target.closest("[data-customer-notification-bell]") &&
    !event.target.closest("[data-customer-notification-panel]")
  ) {
    customerNotificationPanel.hidden = true;
  }
  const customerCart = document.querySelector("#cart");
  if (
    customerCart &&
    !customerCart.hidden &&
    !event.target.closest("#cart") &&
    !event.target.closest("a[href='#cart']") &&
    !event.target.closest("[data-add-cart]")
  ) {
    customerCart.hidden = true;
  }

  const addCartButton = event.target.closest("[data-add-cart]");
  if (addCartButton) {
    addProductToCart(addCartButton.dataset.addCart);
    return;
  }

  const wishlistButton = event.target.closest("[data-wishlist-product]");
  if (wishlistButton) {
    toggleCustomerWishlist(wishlistButton.dataset.wishlistProduct);
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

  const closeCartButton = event.target.closest("[data-close-cart]");
  if (closeCartButton) {
    closeCustomerPopovers();
    return;
  }

  const buyNowButton = event.target.closest("[data-buy-now]");
  if (buyNowButton) {
    const cart = getCustomerCart();
    const item = cart.find((entry) => String(entry.id) === String(buyNowButton.dataset.buyNow));
    if (item) {
      saveCustomerCart([item]);
      renderCartSummary(true);
    }
    return;
  }

  const checkoutButton = event.target.closest("[data-checkout]");
  if (checkoutButton) {
    renderCartSummary(true);
    if (!(localStorage.getItem("axzenToken") && localStorage.getItem("axzenRole") === "customer")) {
      setCartMessage("Login with phone OTP to continue checkout.", true);
      closeCustomerPopovers();
      openLoginArea();
    }
    return;
  }

  const customerProfileButton = event.target.closest("[data-customer-profile-menu]");
  if (customerProfileButton) {
    const willOpen = customerProfilePopover?.hidden !== false;
    closeCustomerPopovers(willOpen ? "profile" : "");
    if (customerProfilePopover) customerProfilePopover.hidden = !willOpen;
    return;
  }

  const customerLocationButton = event.target.closest("[data-customer-location]");
  if (customerLocationButton) {
    const current = localStorage.getItem(CUSTOMER_LOCATION_KEY) || "";
    const next = window.prompt("Enter delivery location or pincode", current.replace(/^Location set\s*/i, ""));
    if (next !== null) {
      const label = next.trim() ? `Location set ${next.trim()}` : "Location not set";
      localStorage.setItem(CUSTOMER_LOCATION_KEY, label);
      customerLocationButton.textContent = label;
      showCustomerToast("Delivery location updated.");
    }
    return;
  }

  const customerLogoutLink = event.target.closest("a[href='#logout']");
  if (customerLogoutLink) {
    event.preventDefault();
    logoutButton?.click();
    if (customerProfilePopover) customerProfilePopover.hidden = true;
    return;
  }

  const customerLoginLink = event.target.closest("a[href='#login']");
  if (customerLoginLink && loginSection?.classList.contains("customer-login-section")) {
    event.preventDefault();
    closeCustomerPopovers();
    openLoginArea();
    return;
  }

  if (
    event.target.closest("[data-close-customer-login]") ||
    (event.target === loginSection && loginSection?.classList.contains("customer-login-section"))
  ) {
    closeLoginArea();
    return;
  }

  const customerProfileLink = event.target.closest("[data-customer-profile-link]");
  if (customerProfileLink) {
    if (!(localStorage.getItem("axzenToken") && localStorage.getItem("axzenRole") === "customer")) {
      openLoginArea();
      if (customerProfilePopover) customerProfilePopover.hidden = true;
      return;
    }
    if (dashboardSection) {
      dashboardSection.hidden = false;
      dashboardSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (customerProfilePopover) customerProfilePopover.hidden = true;
    return;
  }

  const customerCartLink = event.target.closest("a[href='#cart']");
  if (customerCartLink && document.body.classList.contains("storefront-page")) {
    event.preventDefault();
    const cart = document.querySelector("#cart");
    const willOpen = cart?.hidden !== false;
    closeCustomerPopovers(willOpen ? "cart" : "");
    if (cart) {
      cart.hidden = !willOpen;
      if (willOpen) {
        renderCartSummary(false);
        cart.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
    return;
  }

  const customerOrdersLink = event.target.closest("a[href='#orders']");
  if (customerOrdersLink && document.body.classList.contains("storefront-page")) {
    event.preventDefault();
    await openCustomerOrdersView();
    return;
  }

  const customerFollowsLink = event.target.closest("[data-customer-follows-link]");
  if (customerFollowsLink) {
    event.preventDefault();
    await openCustomerFollowsView();
    return;
  }

  if (event.target.closest("[data-close-customer-orders]") || event.target === document.querySelector("[data-customer-orders-modal]")) {
    document.querySelector("[data-customer-orders-modal]")?.remove();
    return;
  }

  if (event.target.closest("[data-back-customer-orders]")) {
    await openCustomerOrdersView();
    return;
  }

  const customerOrderRow = event.target.closest("[data-customer-order-row]");
  if (customerOrderRow) {
    openCustomerOrderDetails(customerOrderRow.dataset.customerOrderRow);
    return;
  }

  const shareOrder = event.target.closest("[data-share-order]");
  if (shareOrder) {
    const order = customerOrdersCache.find((item) => String(item.orderId) === String(shareOrder.dataset.shareOrder));
    const text = `Axzen order ${order?.orderId || shareOrder.dataset.shareOrder} - ${customerOrderStatusLabel(order?.status || "placed")} - ${rupees(customerOrderAmount(order || {}))}`;
    try {
      if (navigator.share) await navigator.share({ title: "Axzen order details", text });
      else {
        await navigator.clipboard.writeText(text);
        setCartMessage("Order details copied.");
      }
    } catch {
      setCartMessage("Order share cancelled.");
    }
    return;
  }

  if (event.target.closest("[data-close-customer-product]") || event.target === document.querySelector("[data-customer-product-modal]")) {
    document.querySelector("[data-customer-product-modal]")?.remove();
    const url = new URL(window.location.href);
    url.searchParams.delete("product");
    history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    return;
  }

  const shareProduct = event.target.closest("[data-share-product]");
  if (shareProduct) {
    const url = new URL(window.location.href);
    url.searchParams.set("product", shareProduct.dataset.shareProduct);
    const shareUrl = url.toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Axzen product", url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCartMessage("Product link copied.");
      }
    } catch {
      setCartMessage("Product share cancelled.");
    }
    return;
  }

  const productThumb = event.target.closest("[data-product-thumb]");
  if (productThumb) {
    const modal = productThumb.closest("[data-customer-product-modal]");
    const image = modal?.querySelector("[data-product-main-image]");
    if (image) {
      image.src = productThumb.dataset.productThumb;
      modal.querySelectorAll("[data-product-thumb]").forEach((button) => button.classList.toggle("active", button === productThumb));
    }
    return;
  }

  const customerNotificationBell = event.target.closest("[data-customer-notification-bell]");
  if (customerNotificationBell) {
    const panel = document.querySelector("[data-customer-notification-panel]");
    const willOpen = panel?.hidden !== false;
    closeCustomerPopovers(willOpen ? "notifications" : "");
    if (panel) {
      panel.hidden = !willOpen;
      if (willOpen) {
        await fetch("/api/customer/notifications/read", {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("axzenToken") || ""}` },
        }).catch(() => {});
        await loadCustomerNotifications(false);
      }
    }
    return;
  }

  const notificationLink = event.target.closest("[data-customer-notification-link]");
  if (notificationLink) {
    const link = notificationLink.dataset.customerNotificationLink;
    if (link) window.location.href = link;
    return;
  }

  const productCard = event.target.closest("[data-product-card]");
  if (productCard && !event.target.closest("[data-add-cart]") && !event.target.closest("[data-open-seller]") && !event.target.closest(".product-wishlist")) {
    openCustomerProductModal(productCard.dataset.productCard);
    saveRecentProduct(productCard.dataset.productCard);
    return;
  }

  const openSellerButton = event.target.closest("[data-open-seller]");
  if (openSellerButton) {
    document.querySelector("[data-customer-product-modal]")?.remove();
    await openCustomerSellerPage(openSellerButton.dataset.openSeller);
    return;
  }

  const shareSellerButton = event.target.closest("[data-share-seller]");
  if (shareSellerButton) {
    const url = new URL(window.location.href);
    url.searchParams.set("seller", shareSellerButton.dataset.shareSeller);
    try {
      if (navigator.share) await navigator.share({ title: "Axzen seller store", url: url.toString() });
      else {
        await navigator.clipboard.writeText(url.toString());
        setCartMessage("Store link copied.");
      }
    } catch {
      setCartMessage("Store share cancelled.");
    }
    return;
  }

  const followSellerButton = event.target.closest("[data-follow-seller]");
  if (followSellerButton) {
    const seller = getStorefrontSellers().find((entry) => String(entry.id) === String(followSellerButton.dataset.followSeller));
    if (seller) {
      const alreadyFollowing = getFollowedSellers().some((item) => String(item.id) === String(seller.id));
      const token = localStorage.getItem("axzenToken");
      if (alreadyFollowing) {
        removeFollowedSeller(seller.id);
        sellerStoreCache.delete(String(seller.id));
        if (token && localStorage.getItem("axzenRole") === "customer") {
          fetch(`/api/customer/follows/${encodeURIComponent(seller.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      } else {
        saveFollowedSeller(seller);
        sellerStoreCache.delete(String(seller.id));
        if (token && localStorage.getItem("axzenRole") === "customer") {
        fetch(`/api/customer/follows/${encodeURIComponent(seller.id)}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {});
        }
      }
      openCustomerSellerPage(seller.id, { push: false });
    }
    return;
  }

  const messageSellerButton = event.target.closest("[data-message-seller]");
  if (messageSellerButton) {
    const sellerId = String(messageSellerButton.dataset.messageSeller || "");
    const store = sellerStoreCache.get(sellerId);
    const seller = store?.seller || getStorefrontSellers().find((entry) => String(entry.id) === sellerId);
    const phone = seller?.supportPhone || seller?.phone || "";
    const email = seller?.supportEmail || seller?.email || "";
    if (phone) window.location.href = `tel:${phone}`;
    else if (email) window.location.href = `mailto:${email}`;
    else showCustomerToast("Seller contact is not available.", true);
    return;
  }

  const sellerStoreTab = event.target.closest("[data-seller-store-tab]");
  if (sellerStoreTab) {
    const page = sellerStoreTab.closest(".customer-seller-storefront");
    const tab = sellerStoreTab.dataset.sellerStoreTab;
    page?.querySelectorAll("[data-seller-store-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.sellerStoreTab === tab && button.closest(".seller-store-tabs"));
    });
    const targetMap = {
      home: ".seller-store-hero",
      all: ".seller-all-products",
      categories: ".seller-store-card.categories",
      new: ".seller-all-products",
      best: ".seller-best-products",
      offers: ".seller-store-perks",
    };
    const section = page?.querySelector(targetMap[tab] || ".seller-store-hero");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
    showCustomerToast(tab === "new" ? "Newest products are shown in All Products." : "Store section opened.");
    return;
  }

  const categoryPill = event.target.closest("[data-customer-category-pill]");
  if (categoryPill) {
    const category = categoryPill.dataset.customerCategoryPill || "All";
    if (category === "All") {
      resetCustomerMain();
      renderStorefrontProducts(storefrontProductsCache);
      setCustomerHistory("", "", false);
    } else {
      openCustomerCategoryPage(category);
    }
    return;
  }

  const openCategory = event.target.closest("[data-open-category]");
  if (openCategory) {
    openCustomerCategoryPage(openCategory.dataset.openCategory);
    return;
  }

  const resetCustomerHome = event.target.closest("[data-reset-customer-home]");
  if (resetCustomerHome) {
    resetCustomerMain();
    renderStorefrontProducts(storefrontProductsCache);
    setCustomerHistory("", "", false);
    return;
  }

  const profileMenuButton = event.target.closest("[data-seller-profile-menu]");
  if (profileMenuButton) {
    if (sellerProfilePopover) sellerProfilePopover.hidden = !sellerProfilePopover.hidden;
    return;
  }

  const notificationBell = event.target.closest("[data-seller-notification-bell]");
  if (notificationBell) {
    const panel = document.querySelector("[data-seller-notification-panel]");
    if (panel) {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        localStorage.setItem(SELLER_NOTIFICATION_UNREAD_KEY, "0");
        updateSellerNotificationBadge();
        renderSellerNotificationHistory();
      }
    }
    return;
  }

  const muteNotifications = event.target.closest("[data-seller-notification-mute]");
  if (muteNotifications) {
    const muted = localStorage.getItem(SELLER_NOTIFICATION_MUTE_KEY) === "true";
    localStorage.setItem(SELLER_NOTIFICATION_MUTE_KEY, muted ? "false" : "true");
    renderSellerNotificationHistory();
    return;
  }

  const clearNotifications = event.target.closest("[data-seller-notification-clear]");
  if (clearNotifications) {
    saveSellerNotificationHistory([]);
    localStorage.setItem(SELLER_NOTIFICATION_UNREAD_KEY, "0");
    updateSellerNotificationBadge();
    renderSellerNotificationHistory();
    return;
  }

  const ownerLoginButton = event.target.closest("[data-login-owner]");
  if (ownerLoginButton) {
    if (sellerProfilePopover) sellerProfilePopover.hidden = true;
    openOwnerLoginModal();
    return;
  }

  const returnSellerOrders = event.target.closest("[data-return-seller-orders]");
  if (returnSellerOrders) {
    localStorage.removeItem(SELLER_OWNER_KEY);
    document.body.classList.remove("seller-owner-mode");
    document.querySelector("[data-login-owner]")?.removeAttribute("hidden");
    document.querySelector("[data-return-seller-orders]")?.setAttribute("hidden", "");
    if (sellerProfilePopover) sellerProfilePopover.hidden = true;
    setSellerSection("orders", true);
    return;
  }

  if (event.target.closest("[data-close-owner-login]")) {
    closeOwnerLoginModal();
    return;
  }

  const sendOwnerOtp = event.target.closest("[data-send-owner-otp]");
  if (sendOwnerOtp) {
    const phoneInput = ownerLoginModal?.querySelector("[data-owner-phone]");
    const otpWrap = ownerLoginModal?.querySelector("[data-owner-otp-wrap]");
    const verifyButton = ownerLoginModal?.querySelector("[data-verify-owner-otp]");
    const phone = formatPhoneNumber(phoneInput?.value || "");
    if (phone.length < 12) {
      setOwnerLoginMessage("Enter a valid owner mobile number.", true);
      return;
    }
    sendOwnerOtp.disabled = true;
    sendOwnerOtp.textContent = "Sending OTP...";
    try {
      const confirmationResult = await signInWithPhoneNumber(auth, phone, getOwnerRecaptcha());
      confirmationResults.set("owner", { confirmationResult, phone });
      if (phoneInput) phoneInput.readOnly = true;
      sendOwnerOtp.hidden = true;
      if (otpWrap) otpWrap.hidden = false;
      if (verifyButton) verifyButton.hidden = false;
      setOwnerLoginMessage(`OTP sent to ${phone}.`);
    } catch (error) {
      setOwnerLoginMessage(error.message || "Unable to send owner OTP.", true);
      sendOwnerOtp.disabled = false;
      sendOwnerOtp.textContent = "Send OTP";
    }
    return;
  }

  const verifyOwnerOtp = event.target.closest("[data-verify-owner-otp]");
  if (verifyOwnerOtp) {
    const otp = ownerLoginModal?.querySelector("[data-owner-otp]")?.value.trim() || "";
    const session = confirmationResults.get("owner");
    if (!session || otp.length < 4) {
      setOwnerLoginMessage("Enter the OTP sent to owner mobile.", true);
      return;
    }
    verifyOwnerOtp.disabled = true;
    verifyOwnerOtp.textContent = "Verifying...";
    try {
      await session.confirmationResult.confirm(otp);
      setOwnerLoginMessage("Owner verified. Opening seller workspace.");
      enableSellerOwnerMode();
    } catch (error) {
      setOwnerLoginMessage("OTP is incorrect or expired. Enter the latest SMS OTP.", true);
      verifyOwnerOtp.disabled = false;
      verifyOwnerOtp.textContent = "Verify owner";
    }
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
    document.querySelectorAll("[data-seller-order-tab]").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.sellerOrderTab === orderTab.dataset.sellerOrderTab);
    });
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
    const order = sellerOrdersCache.find((entry) => String(entry._id || entry.orderId) === String(orderId));
    if (action === "track") {
      if (order?.trackingUrl) window.open(order.trackingUrl, "_blank", "noopener,noreferrer");
      else showSellerOrdersToast("Tracking URL is not available yet.", true);
      return;
    }
    if (action === "agent") {
      showSellerOrdersToast(order?.pickupAgentName ? `Assigned to ${order.pickupAgentName}` : "Pickup agent assigned.");
      return;
    }
    if (action === "call-agent") {
      if (order?.pickupAgentPhone) {
        window.location.href = `tel:${order.pickupAgentPhone}`;
      } else {
        showSellerOrdersToast("Pickup agent phone number is not available yet.", true);
      }
      return;
    }
    if (action === "settlement" || action === "details") {
      openSellerOrderDrawer(orderId);
      return;
    }
    const reason =
      action === "reject"
        ? window.prompt("Cancel reason enter cheyyandi. Example: item unavailable / stock issue / address issue", "Item unavailable")
        : "";
    if (action === "reject" && !reason) return;
    orderAction.disabled = true;
    orderAction.textContent = "Updating...";
    try {
      await updateSellerOrderAction(orderId, action, reason);
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

  const cartQty = event.target.closest("[data-cart-qty]");
  if (cartQty) {
    const cart = getCustomerCart();
    const item = cart.find((entry) => String(entry.id) === String(cartQty.dataset.cartQty));
    if (item) {
      item.quantity = Math.max(1, Math.min(Number(cartQty.value) || 1, 10));
      saveCustomerCart(cart);
      renderCartSummary(false);
    }
  }

  const customerSellerSearch = event.target.closest("[data-customer-seller-search]");
  if (customerSellerSearch) {
    const seller = getStorefrontSellers().find((entry) => String(entry.id) === String(customerSellerSearch.dataset.customerSellerSearch));
    const grid = customerSellerSearch.closest(".customer-seller-page")?.querySelector(".seller-all-products .commerce-products, .commerce-products");
    if (seller && grid) {
      const term = customerSellerSearch.value.trim().toLowerCase();
      const products = seller.products.filter((product) => [product.title, product.category, product.sku].join(" ").toLowerCase().includes(term));
      grid.innerHTML = products.length ? products.map(renderSellerStoreProductCard).join("") : `<p class="order-invoice-empty">No seller items found.</p>`;
    }
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
  const freeDeliveryChoice = event.target.closest("[data-seller-payment-form] [name='freeDeliveryEnabled']");
  if (freeDeliveryChoice) {
    syncSellerFreeDeliveryThreshold(freeDeliveryChoice.form);
    return;
  }

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
  const customerSearchForm = event.target.closest("[data-customer-search]");
  if (customerSearchForm) {
    event.preventDefault();
    const formData = new FormData(customerSearchForm);
    const term = String(formData.get("search") || "").trim().toLowerCase();
    const category = String(formData.get("category") || "All");
    if (term.startsWith("#")) {
      const sellerTerm = term.slice(1);
      const seller = getStorefrontSellers().find((entry) => entry.name.toLowerCase().includes(sellerTerm));
      if (seller) openCustomerSellerPage(seller.id);
      return;
    }
    resetCustomerMain();
    const filtered = storefrontProductsCache.filter((product) => {
      const categoryMatch = category === "All" || product.category === category;
      const haystack = [product.title, product.sellerName, product.category, product.sku].join(" ").toLowerCase();
      return categoryMatch && (!term || haystack.includes(term));
    });
    renderStorefrontProducts(filtered);
    return;
  }

  const checkoutForm = event.target.closest("[data-checkout-form]");
  if (checkoutForm) {
    event.preventDefault();
    await placeCustomerOrder(checkoutForm);
    return;
  }

  const paymentForm = event.target.closest("[data-seller-payment-form]");
  if (paymentForm) {
    event.preventDefault();
    const message = paymentForm.querySelector("[data-seller-payment-message]");
    if (!window.confirm("Are you sure you want to save these payment options?")) {
      paymentForm.reset();
      window.requestAnimationFrame(() => syncSellerFreeDeliveryThreshold(paymentForm));
      if (message) {
        message.textContent = "Payment option changes were not saved.";
        message.classList.remove("error");
      }
      return;
    }

    try {
      const codEnabled = paymentForm.querySelector("[name='codEnabled']")?.checked;
      const onlinePaymentEnabled = paymentForm.querySelector("[name='onlinePaymentEnabled']")?.checked;
      const freeDeliveryEnabled = paymentForm.querySelector("[name='freeDeliveryEnabled']:checked")?.value === "true";
      const freeDeliveryMinOrder = freeDeliveryEnabled ? paymentForm.querySelector("[name='freeDeliveryMinOrder']")?.value || "0" : "0";
      await updateSellerSettings(
        {
          codEnabled: Boolean(codEnabled),
          onlinePaymentEnabled: Boolean(onlinePaymentEnabled),
          freeDeliveryEnabled: Boolean(freeDeliveryEnabled),
          freeDeliveryMinOrder,
        },
        false
      );
      await loadRoleOrders("seller");
      if (message) message.textContent = "Payment options saved.";
    } catch (error) {
      if (message) {
        message.textContent = error.message || "Unable to save payment options.";
        message.classList.add("error");
      }
    }
    return;
  }

  const ticketForm = event.target.closest("[data-seller-ticket-create]");
  if (ticketForm) {
    event.preventDefault();
    const message = ticketForm.querySelector("[data-seller-ticket-message]");
    const payload = Object.fromEntries(new FormData(ticketForm).entries());
    try {
      const token = localStorage.getItem("axzenToken");
      const response = await fetch("/api/seller/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to create complaint token.");
      ticketForm.reset();
      if (message) message.textContent = `Token created: ${result.ticket?.ticketId || ""}`;
      await loadSellerTickets();
    } catch (error) {
      if (message) {
        message.textContent = error.message || "Unable to create complaint token.";
        message.classList.add("error");
      }
    }
    return;
  }

  const followerMessageForm = event.target.closest("[data-seller-follower-message]");
  if (followerMessageForm) {
    event.preventDefault();
    const status = followerMessageForm.querySelector("[data-seller-follower-message-status]");
    const payload = Object.fromEntries(new FormData(followerMessageForm).entries());
    try {
      const token = localStorage.getItem("axzenToken");
      const response = await fetch("/api/seller/followers/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to send notification.");
      followerMessageForm.reset();
      if (status) status.textContent = `Notification sent to ${result.sentCount || 0} followers.`;
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Unable to send notification.";
        status.classList.add("error");
      }
    }
    return;
  }

  const inventoryForm = event.target.closest("[data-inventory-update]");
  if (inventoryForm) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(inventoryForm).entries());
    try {
      const token = localStorage.getItem("axzenToken");
      const response = await fetch(`/api/seller/products/${encodeURIComponent(inventoryForm.dataset.inventoryUpdate)}/inventory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Unable to update inventory.");
      await loadSellerProducts();
    } catch (error) {
      alert(error.message || "Unable to update inventory.");
    }
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
    disconnectSellerRealtime();
    stopCustomerNotificationPolling();
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

    if (loginSection?.classList.contains("customer-login-section")) closeLoginArea();
    else openLoginArea();
    updateLoginNavigation(false);
    updateSellerHeader(null);
    renderCartSummary(false);
  });
}

const savedToken = localStorage.getItem("axzenToken");
const savedRole = localStorage.getItem("axzenRole");
const pageRole = document.querySelector(".firebase-phone-form")?.dataset.role;

initCustomerLocation();
loadStorefrontCatalog();

window.addEventListener("popstate", () => {
  if (!document.body.classList.contains("storefront-page")) return;
  const params = new URLSearchParams(window.location.search);
  if (params.get("seller")) openCustomerSellerPage(params.get("seller"), { push: false });
  else if (params.get("category")) openCustomerCategoryPage(params.get("category"), { push: false });
  else if (params.get("follows")) openCustomerFollowsView({ push: false });
  else {
    resetCustomerMain();
    renderStorefrontProducts(storefrontProductsCache);
  }
});

if (savedToken && savedRole && savedRole === pageRole) {
  loadDashboard(savedRole, savedToken).catch(() => {
    stopSellerOrderPolling();
    disconnectSellerRealtime();
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
    localStorage.removeItem("axzenPhone");
    localStorage.removeItem("axzenSellerStatus");
    updateLoginNavigation(false);
    updateSellerHeader(null);
  });
}
