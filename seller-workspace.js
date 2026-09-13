import { escape as esc, safeUrl, money } from "./customer/domain.js";
let report = (message) => window.alert(message);
let reloadOrders = async () => {};
async function request(path, method = "GET", body) {
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${localStorage.getItem("axzenToken") || ""}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message || "Unable to complete the request.");
  return data;
}
export function storeManager(seller = {}) {
  const d = seller.storeDetails || {},
    id = seller.id || seller._id;
  const fields = [
    ["profileImageUrl", "Store logo URL", "url"],
    ["offerBannerUrl", "Cover image URL", "url"],
    ["tagline", "Short bio", "text"],
    ["ownerDisplayName", "Owner display name", "text"],
    ["instagramUrl", "Instagram profile URL", "url"],
    ["supportEmail", "Public support email", "email"],
    ["supportPhone", "Public support phone", "tel"],
    ["dispatchNote", "Dispatch information", "text"],
  ];
  return `<article class="dashboard-panel seller-store-editor" data-seller-section="profile"><header class="workspace-heading"><div><p class="eyebrow">Your public profile</p><h3>Make your store yours</h3><p>Your story, products and customer reviews—all in one shareable page.</p></div><a class="secondary-button" href="https://www.axzen.in/?seller=${encodeURIComponent(id)}" target="_blank" rel="noopener">View store ↗</a></header><div class="store-link-row"><input aria-label="Public store link" readonly value="https://www.axzen.in/?seller=${esc(id)}"><button type="button" data-copy-store="${esc(id)}">Copy store link</button></div><form class="workspace-form" data-store-profile-form>${fields.map(([name, label, type]) => `<label>${label}<input name="${name}" type="${type}" value="${esc(d[name] || "")}" maxlength="${type === "url" ? 1000 : 160}"></label>`).join("")}<label class="wide">Our story<textarea name="about" rows="5" maxlength="2000">${esc(d.about || "")}</textarea></label><label class="wide">Return information<textarea name="returnPolicy" rows="3" maxlength="1200">${esc(d.returnPolicy || "")}</textarea><small>Describe applicable product terms. Axzen marketplace terms also apply.</small></label><button type="submit">Save store profile</button><p data-workspace-message role="status"></p></form></article><article class="dashboard-panel" id="sellerReviews" data-seller-section="reviews"><header class="workspace-heading"><div><p class="eyebrow">Customer voices</p><h3>Reviews & replies</h3><p>Verified purchases only. Reply publicly to answer questions or resolve concerns.</p></div><button type="button" data-refresh-reviews>Refresh reviews</button></header><div data-seller-reviews><p>Loading reviews…</p></div></article>`;
}
export async function loadSellerReviews() {
  const host = document.querySelector("[data-seller-reviews]");
  if (!host) return;
  try {
    const data = await request("/api/sellers/me/reviews");
    host.innerHTML = `<div class="workspace-stats"><span><strong>${data.reviewCount ? Number(data.ratingAverage).toFixed(1) + " / 5" : "New"}</strong> Store rating</span><span><strong>${data.reviewCount}</strong> Verified reviews</span></div>${data.items.length ? data.items.map((r) => `<article class="workspace-review"><div class="workspace-heading"><strong>${esc(r.authorName)} · ${r.rating} ★</strong><small>${esc(new Date(r.createdAt).toLocaleDateString("en-IN"))}</small></div><h4>${esc(r.productTitle)}</h4><p>${esc(r.body)}</p><form data-review-reply="${esc(r.id)}"><label>Public reply<textarea name="reply" maxlength="1000" required>${esc(r.sellerReply || "")}</textarea></label><button type="submit">${r.sellerReply ? "Update reply" : "Reply to customer"}</button><p data-workspace-message role="status"></p></form></article>`).join("") : "<p>No verified reviews yet. Customers can review products after delivery.</p>"}`;
  } catch (e) {
    host.textContent = e.message;
  }
}
export function fulfilmentPanels(orders = []) {
  for (const [id, returns] of [
    ["sellerShipments", false],
    ["sellerReturns", true],
  ]) {
    const host = document.getElementById(id);
    if (!host) continue;
    const rows = orders.filter((o) =>
      returns
        ? o.status === "returned" || o.refundStatus === "scheduled"
        : ["packed", "shipped", "out_for_delivery"].includes(o.status),
    );
    host.innerHTML = `<header class="workspace-heading"><div><p class="eyebrow">${returns ? "After delivery" : "Fulfilment desk"}</p><h3>${returns ? "Returns & refund follow-up" : "Packing to doorstep"}</h3><p>${returns ? "Refunds stay pending until the payment provider confirms them." : "Confirm every item, request the courier, then monitor pickup and delivery."}</p></div><strong>${rows.length} orders</strong></header><div class="fulfilment-board">${rows.length ? rows.map((o) => `<article class="fulfilment-card"><div class="workspace-heading"><button type="button" data-order-details="${esc(o._id || o.orderId)}">${esc(o.orderId)}</button><span class="workspace-pill">${esc(o.status.replaceAll("_", " "))}</span></div><h4>${esc(o.customer?.name || o.shippingAddress?.fullName || "Customer")}</h4><p>${o.items.map((i) => `${esc(i.title)} × ${i.quantity}`).join(" · ")}</p><p>${esc(o.courierName || "Courier not assigned")} · ${esc(o.awbNumber || "Tracking number pending")}</p>${o.shipmentBookingError ? `<p class="workspace-error">${esc(o.shipmentBookingError)}</p>` : ""}${returns ? `<p>${esc(o.returnReason || o.cancelReason || "Contact support for return details.")}</p><p>Refund: ${esc(o.refundStatus || "none")}</p>` : `<ol class="fulfilment-steps">${["packed", "shipped", "out_for_delivery", "delivered"].map((step, index) => `<li class="${index <= ["packed", "shipped", "out_for_delivery", "delivered"].indexOf(o.status) ? "done" : ""}">${step.replaceAll("_", " ")}</li>`).join("")}</ol>`}<div class="workspace-actions"><button type="button" data-order-details="${esc(o._id || o.orderId)}">Order details</button>${o.status === "packed" && !o.providerShipmentId && !o.awbNumber && !["booking", "needs_review"].includes(o.shipmentBookingState) ? `<button type="button" data-parcel-booking="${esc(o._id || o.orderId)}">Request courier</button>` : ""}${safeUrl(o.trackingUrl) ? `<a href="${esc(safeUrl(o.trackingUrl))}" target="_blank" rel="noopener noreferrer">Track parcel ↗</a>` : ""}<a href="#sellerSupport" data-seller-nav="support">Get support</a></div></article>`).join("") : `<p>${returns ? "No returns need follow-up." : "Packed orders will appear here. Accept and pack new orders in Orders."}</p>`}</div>`;
  }
}
export function parcelDialog(id) {
  document.querySelector("[data-parcel-dialog]")?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<dialog data-parcel-dialog class="workspace-dialog"><button type="button" data-close-parcel aria-label="Close parcel form">Close</button><h2>Request a courier</h2><p>Enter the measurements of the packed parcel. These affect shipping charges.</p><form data-parcel-form="${esc(id)}" class="workspace-form">${[
      ["length", "Length (cm)"],
      ["breadth", "Width (cm)"],
      ["height", "Height (cm)"],
      ["weight", "Weight (kg)"],
    ]
      .map(
        ([name, label]) =>
          `<label>${label}<input type="number" name="${name}" min="0.01" max="${name === "weight" ? 100 : 300}" step="0.01" required></label>`,
      )
      .join(
        "",
      )}<button type="submit">Request courier</button><p data-workspace-message role="status"></p></form></dialog>`,
  );
  document.querySelector("[data-parcel-dialog]").showModal();
}
export function bindSellerWorkspace(onChange, onMessage) {
  reloadOrders = onChange;
  report = onMessage;
  document.addEventListener("click", async (e) => {
    const copy = e.target.closest("[data-copy-store]");
    if (copy) {
      try {
        await navigator.clipboard.writeText(
          `https://www.axzen.in/?seller=${encodeURIComponent(copy.dataset.copyStore)}`,
        );
        copy.textContent = "Link copied";
      } catch {
        const field = copy.parentElement.querySelector("input");
        field.focus();
        field.select();
        copy.textContent = "Select and copy link";
      }
      return;
    }
    if (e.target.closest("[data-refresh-reviews]")) {
      await loadSellerReviews();
      return;
    }
    const booking = e.target.closest("[data-parcel-booking]");
    if (booking) {
      parcelDialog(booking.dataset.parcelBooking);
      return;
    }
    if (e.target.closest("[data-close-parcel]"))
      document.querySelector("[data-parcel-dialog]")?.close();
  });
  document.addEventListener("submit", async (e) => {
    const form = e.target.closest(
      "[data-store-profile-form],[data-review-reply],[data-parcel-form]",
    );
    if (!form) return;
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]'),
      msg = form.querySelector("[data-workspace-message]");
    button.disabled = true;
    msg.textContent = "Saving…";
    try {
      const data = Object.fromEntries(new FormData(form));
      if (form.hasAttribute("data-store-profile-form")) {
        await request("/api/sellers/me/store", "PUT", { storeDetails: data });
        msg.textContent = "Your store profile is saved.";
      } else if (form.hasAttribute("data-review-reply")) {
        await request(
          `/api/sellers/me/reviews/${form.dataset.reviewReply}/reply`,
          "PUT",
          data,
        );
        msg.textContent = "Your public reply is saved.";
      } else {
        await request(
          `/api/seller/orders/${encodeURIComponent(form.dataset.parcelForm)}/pack-and-ship`,
          "POST",
          {
            packageDetails: Object.fromEntries(
              Object.entries(data).map(([key, value]) => [key, Number(value)]),
            ),
          },
        );
        document.querySelector("[data-parcel-dialog]").close();
        await reloadOrders();
        report(
          "Shipment request saved. Check courier assignment and pickup status.",
        );
      }
    } catch (error) {
      msg.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}
