import { firebaseConfig } from "../firebase-config.js";

const native = globalThis.AxzenDeliveryNative;
const API = native ? "https://www.axzen.in" : "";
const app = document.querySelector("#app");
const dialog = document.querySelector("#statusDialog");
const statusForm = document.querySelector("#statusForm");
const state = {
  token: localStorage.getItem("axzen.delivery.token") || "",
  user: JSON.parse(localStorage.getItem("axzen.delivery.user") || "null"),
  tasks: [], profile: null, view: "active", filter: "all", confirmation: null, nativeStop: null,
};

const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const money = (paise) => `₹${((Number(paise) || 0) / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const api = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, { ...options, headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(data.message || "Unable to connect. Please try again.");
  }
  return data;
};
function toast(message) { const node = document.querySelector("#toast"); node.textContent = message; node.classList.add("show"); setTimeout(() => node.classList.remove("show"), 2600); }
function normalizePhone(value) { const clean = String(value || "").replace(/[ ()-]/g, ""); return clean.startsWith("+") ? clean : `+91${clean}`; }
function saveSession(data) { state.token = data.token; state.user = data.user; localStorage.setItem("axzen.delivery.token", data.token); localStorage.setItem("axzen.delivery.user", JSON.stringify(data.user)); }
async function logout(render = true) { state.token = ""; state.user = null; state.tasks = []; localStorage.removeItem("axzen.delivery.token"); localStorage.removeItem("axzen.delivery.user"); await native?.signOut?.().catch(() => {}); if (render) renderLogin(); }

function renderLogin(message = "", mode = "password") {
  const passwordMode = mode !== "otp";
  app.innerHTML = `<main class="login"><section class="login-brand"><span class="brand-mark">A</span><h1>Deliver with confidence.</h1><p>Your assigned Axzen orders, route details and doorstep updates in one place.</p></section><form class="login-card" id="${passwordMode ? "passwordForm" : "phoneForm"}"><h2>Partner sign in</h2><div class="login-tabs"><button type="button" class="${passwordMode ? "active" : ""}" data-login-mode="password">Username</button><button type="button" class="${passwordMode ? "" : "active"}" data-login-mode="otp">Mobile OTP</button></div>${passwordMode ? `<p>Use the username and password created by your Axzen administrator.</p><label class="field">Username<input name="username" autocomplete="username" maxlength="50" placeholder="delivery.username" required></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label><button class="primary">Sign in</button>` : `<p>Use the mobile number registered by your Axzen administrator.</p><label class="field">Mobile number<input name="phone" inputmode="tel" autocomplete="tel" placeholder="+91 98765 43210" required></label><button class="primary">Send secure OTP</button>`}<p class="form-message">${esc(message)}</p></form></main>`;
}
function renderOtp(phone, message = "") {
  app.innerHTML = `<main class="login"><section class="login-brand"><span class="brand-mark">A</span><h1>Check your phone.</h1><p>We sent a verification code to ${esc(phone)}.</p></section><form class="login-card" id="otpForm" data-phone="${esc(phone)}"><h2>Enter OTP</h2><p>Enter the 6-digit Firebase verification code.</p><label class="field">Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label><button class="primary">Verify and open tasks</button><button type="button" class="secondary" data-back style="width:100%;margin-top:9px">Change number</button><p class="form-message">${esc(message)}</p></form></main>`;
}
async function webAuth() {
  const [{ initializeApp, getApps }, auth] = await Promise.all([import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"), import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")]);
  const instance = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  return { ...auth, auth: auth.getAuth(instance) };
}
async function beginOtp(phone) {
  if (native?.phone) {
    state.nativeStop = await native.startPhone(phone, {
      sent: (verificationId) => { state.nativeVerificationId = verificationId; renderOtp(phone); },
      complete: (token) => finishLogin(token),
      failed: (error) => renderLogin(error.message, "otp"),
    });
    return;
  }
  const auth = await webAuth();
  let verifier = document.querySelector("#delivery-recaptcha");
  if (!verifier) { verifier = document.createElement("div"); verifier.id = "delivery-recaptcha"; document.body.append(verifier); }
  state.recaptcha?.clear?.();
  state.recaptcha = new auth.RecaptchaVerifier(auth.auth, verifier, { size: "invisible" });
  state.confirmation = await auth.signInWithPhoneNumber(auth.auth, phone, state.recaptcha);
  renderOtp(phone);
}
async function finishLogin(firebaseToken) {
  const data = await api("/api/auth/phone-login", { method: "POST", body: JSON.stringify({ role: "delivery_agent", firebaseToken }) });
  saveSession(data); await loadApp();
}
function nextAction(task) {
  return task.status === "packed" ? ["shipped", "Confirm pickup"] : task.status === "shipped" ? ["out_for_delivery", "Start delivery"] : task.status === "out_for_delivery" ? ["delivered", "Mark delivered"] : null;
}
function addressText(address = {}) { return [address.address, address.city, address.state, address.pincode].filter(Boolean).join(", "); }
function taskCard(task) {
  const next = nextAction(task); const address = addressText(task.shippingAddress); const initial = (task.shippingAddress?.fullName || "C")[0].toUpperCase();
  const step = { packed: 1, shipped: 2, out_for_delivery: 3, delivered: 4, returned: 4 }[task.status] || 1;
  return `<article class="task"><header class="task-head"><div><small>${esc(task.sellerName)}</small><strong>${esc(task.orderId)}</strong></div><span class="status ${esc(task.status)}">${esc(task.status.replaceAll("_", " "))}</span></header><div class="route-progress" aria-label="Delivery progress"><i class="done"></i><i class="${step >= 2 ? "done" : ""}"></i><i class="${step >= 3 ? "done" : ""}"></i><i class="${step >= 4 ? "done" : ""}"></i></div><div class="task-body"><div class="customer-line"><span class="customer-avatar">${esc(initial)}</span><div><h3>${esc(task.shippingAddress?.fullName || "Customer")}</h3><p>${esc(address)}</p></div></div><div class="task-meta"><div><small>Payment</small><strong>${esc((task.paymentMethod || "online").toUpperCase())}</strong></div><div><small>${task.amountToCollect ? "Collect cash" : task.codAmount ? "COD value" : "Payment"}</small><strong class="${task.amountToCollect ? "cod" : ""}">${task.amountToCollect ? money(task.amountToCollect) : task.codAmount ? money(task.codAmount) : "Paid online"}</strong></div><div><small>Items</small><strong>${task.items.reduce((sum, item) => sum + item.quantity, 0)}</strong></div><div><small>Tracking</small><strong>${esc(task.awbNumber || "Add at pickup")}</strong></div></div><div class="items">${task.items.map(item => `<span>${esc(item.title)} × ${esc(item.quantity)}</span>`).join("")}</div><div class="task-actions">${task.shippingAddress?.phone ? `<a href="tel:${esc(task.shippingAddress.phone)}">☎ Call customer</a>` : ""}<button class="secondary" data-map="${esc(address)}">⌖ Open map</button>${next ? `<button class="advance" data-status="${next[0]}" data-id="${esc(task.id)}">${esc(next[1])}</button>${["shipped", "out_for_delivery"].includes(task.status) ? `<button class="danger" data-status="returned" data-id="${esc(task.id)}">Delivery failed / return</button>` : ""}` : ""}</div></div></article>`;
}
function renderShell() {
  const active = state.tasks.filter(t => ["packed", "shipped", "out_for_delivery"].includes(t.status));
  const history = state.tasks.filter(t => ["delivered", "returned"].includes(t.status));
  const list = state.view === "history" ? history : state.filter === "all" ? active : active.filter(task => task.status === state.filter);
  const delivered = state.profile?.summary?.delivered || 0;
  const pickup = active.filter(task => task.status === "packed").length;
  const doorstep = active.filter(task => task.status === "out_for_delivery").length;
  const cod = state.profile?.summary?.codToCollect || 0;
  const availability = state.profile?.user?.deliveryAvailability || "available";
  app.innerHTML = `<div class="app-shell"><header class="topbar"><div class="topbar-inner"><div><small>${esc(state.profile?.user?.name || "Axzen delivery partner")}</small><h1>${state.view === "history" ? "Delivery history" : state.view === "profile" ? "My account" : "Today's route"}</h1></div><button class="icon-button" data-refresh aria-label="Refresh">↻</button></div></header>${state.view === "profile" ? `<main class="content"><section class="profile"><div class="profile-identity"><span class="brand-mark">${esc((state.profile?.user?.name || "D")[0])}</span><div><h2>${esc(state.profile?.user?.name || "Delivery Partner")}</h2><p>@${esc(state.profile?.user?.username || "partner")} · ${esc(state.profile?.user?.phone || "")}</p></div></div><div class="availability-card"><div><strong>Duty status</strong><small>${availability === "off_duty" ? "You will not receive new assignments" : availability === "on_delivery" ? "Delivery currently in progress" : "Ready for new assignments"}</small></div><button class="${availability === "off_duty" ? "primary" : "secondary"}" data-availability="${availability === "off_duty" ? "available" : "off_duty"}" ${availability === "on_delivery" ? "disabled" : ""}>${availability === "off_duty" ? "Go online" : availability === "on_delivery" ? "On delivery" : "Go off duty"}</button></div><div class="profile-stats"><article><span>Delivered</span><strong>${delivered}</strong></article><article><span>Returns</span><strong>${state.profile?.summary?.returned || 0}</strong></article></div><section class="safety-note"><strong>Delivery checklist</strong><p>Verify order ID, collect COD only when shown, never share OTP/password, and record a clear delivery or return note.</p></section><button class="danger logout-full" data-logout>Sign out</button></section></main>` : `<section class="summary"><article><span>Active</span><strong>${active.length}</strong></article><article><span>Pickup</span><strong>${pickup}</strong></article><article><span>Doorstep</span><strong>${doorstep}</strong></article><article class="cod-summary"><span>COD to collect</span><strong>${money(cod)}</strong></article></section><main class="content">${state.view === "active" ? `<div class="filter-chips"><button class="${state.filter === "all" ? "active" : ""}" data-filter="all">All ${active.length}</button><button class="${state.filter === "packed" ? "active" : ""}" data-filter="packed">Pickup ${pickup}</button><button class="${state.filter === "shipped" ? "active" : ""}" data-filter="shipped">In transit</button><button class="${state.filter === "out_for_delivery" ? "active" : ""}" data-filter="out_for_delivery">Doorstep ${doorstep}</button></div>` : ""}<div class="section-title"><h2>${state.view === "history" ? "Completed deliveries" : "Assigned stops"}</h2><span>${list.length} orders</span></div><section class="task-list">${list.length ? list.map(taskCard).join("") : `<div class="empty"><strong>No ${state.view === "history" ? "completed" : "matching"} tasks</strong><span>Refresh after dispatch assigns an order.</span></div>`}</section></main>`}<nav class="bottom-nav"><button data-view="active" class="${state.view === "active" ? "active" : ""}"><span>▣</span>Today</button><button data-view="history" class="${state.view === "history" ? "active" : ""}"><span>✓</span>Completed</button><button data-view="profile" class="${state.view === "profile" ? "active" : ""}"><span>●</span>Account</button></nav></div>`;
}
async function loadApp() {
  try {
    const [active, history, profile] = await Promise.all([api("/api/delivery-boy/tasks?scope=active"), api("/api/delivery-boy/tasks?scope=history"), api("/api/delivery-boy/me")]);
    state.tasks = [...active.tasks, ...history.tasks]; state.profile = profile; renderShell();
  } catch (error) { if (state.token) { app.innerHTML = `<div class="empty" style="margin:30vh 16px"><strong>Could not load tasks</strong><span>${esc(error.message)}</span><br><button class="primary" data-refresh style="margin-top:16px">Try again</button></div>`; } else renderLogin(error.message); }
}
function openStatus(taskId, status) {
  const task = state.tasks.find(item => String(item.id) === String(taskId)); if (!task) return;
  const label = { shipped: "Confirm pickup", out_for_delivery: "Start doorstep delivery", delivered: "Confirm delivery", returned: "Record failed delivery / return" }[status];
  statusForm.innerHTML = `<h2>${esc(label)}</h2><p>${esc(task.orderId)} · ${esc(task.shippingAddress?.fullName)}</p>${status === "shipped" && !task.awbNumber ? `<label class="field">Tracking / AWB number<input name="awbNumber" maxlength="100" required></label><label class="field">Courier name<input name="courierName" maxlength="100" value="Axzen Delivery" required></label>` : ""}<label class="field">${status === "returned" ? "Failure / return reason" : "Delivery note"}<textarea name="note" maxlength="500" ${["delivered", "returned"].includes(status) ? "required" : ""} placeholder="${status === "delivered" ? "Receiver name or confirmation reference" : status === "returned" ? "Customer unavailable, refused, address issue…" : "Optional operational note"}"></textarea></label><input type="hidden" name="taskId" value="${esc(task.id)}"><input type="hidden" name="status" value="${esc(status)}"><div class="dialog-actions"><button type="button" class="secondary" data-close>Cancel</button><button class="primary">Save update</button></div>`;
  dialog.showModal();
}
document.addEventListener("submit", async (event) => {
  event.preventDefault(); const form = event.target; const button = form.querySelector("button[type=submit],button:not([type])"); if (button) button.disabled = true;
  try {
    if (form.id === "passwordForm") { const values = Object.fromEntries(new FormData(form)); const data = await api("/api/auth/delivery-password-login", { method: "POST", body: JSON.stringify(values) }); saveSession(data); await loadApp(); }
    else if (form.id === "phoneForm") { const phone = normalizePhone(new FormData(form).get("phone")); await beginOtp(phone); }
    else if (form.id === "otpForm") { const code = String(new FormData(form).get("code") || ""); let token; if (native?.phone) token = await native.confirmPhone(state.nativeVerificationId, code); else token = await (await state.confirmation.confirm(code)).user.getIdToken(); await finishLogin(token); }
    else if (form.id === "statusForm") { const values = Object.fromEntries(new FormData(form)); const taskId = values.taskId; delete values.taskId; await api(`/api/delivery-boy/tasks/${encodeURIComponent(taskId)}/status`, { method: "PATCH", body: JSON.stringify(values) }); dialog.close(); toast("Delivery status updated."); await loadApp(); }
  } catch (error) { const message = form.querySelector(".form-message"); if (message) message.textContent = error.message; else toast(error.message); }
  finally { if (button) button.disabled = false; }
});
document.addEventListener("click", async (event) => {
  const loginMode = event.target.closest("[data-login-mode]"); if (loginMode) return renderLogin("", loginMode.dataset.loginMode);
  const back = event.target.closest("[data-back]"); if (back) { await state.nativeStop?.(); return renderLogin("", "otp"); }
  const close = event.target.closest("[data-close]"); if (close) return dialog.close();
  const refresh = event.target.closest("[data-refresh]"); if (refresh) return loadApp();
  const logoutButton = event.target.closest("[data-logout]"); if (logoutButton) return logout();
  const view = event.target.closest("[data-view]"); if (view) { state.view = view.dataset.view; return renderShell(); }
  const filter = event.target.closest("[data-filter]"); if (filter) { state.filter = filter.dataset.filter; return renderShell(); }
  const availability = event.target.closest("[data-availability]"); if (availability) { try { await api("/api/delivery-boy/me/availability", { method: "PATCH", body: JSON.stringify({ availability: availability.dataset.availability }) }); await loadApp(); toast(availability.dataset.availability === "available" ? "You are online." : "You are now off duty."); } catch (error) { toast(error.message); } return; }
  const status = event.target.closest("[data-status]"); if (status) return openStatus(status.dataset.id, status.dataset.status);
  const map = event.target.closest("[data-map]"); if (map) { const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(map.dataset.map)}`; if (native?.open) await native.open(url); else location.href = url; }
});
window.addEventListener("online", () => state.token && loadApp());
if (state.token) loadApp(); else renderLogin();
