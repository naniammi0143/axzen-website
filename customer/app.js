import {
  money,
  escape as esc,
  safeUrl,
  productKey,
  reconcileCart,
  groupedCart,
  filterProducts,
  validAddress,
  stepsFor,
} from "./domain.js";
import { firebaseConfig } from "../firebase-config.js";
const $ = (s) => document.querySelector(s);
const icons = {
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/>',
  heart:
    '<path d="M20 5.5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4.5 5 8 13 8 13s12.5-8 8-13Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  bag: '<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  home: '<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  store:
    '<path d="M4 10v11h16V10M3 4h18l1 6a3 3 0 0 1-5 2 3 3 0 0 1-5 0 3 3 0 0 1-5 0 3 3 0 0 1-5-2l1-6Z"/><path d="M9 21v-6h6v6"/>',
  box: '<path d="m12 2 9 5v10l-9 5-9-5V7l9-5Zm0 10 9-5M12 12 3 7m9 5v10M7.5 4.5l9 5"/>',
  shield:
    '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
  truck:
    '<path d="M2 5h12v12H2V5Zm12 5h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  filter: '<path d="M4 7h16M7 12h10M10 17h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-1 1-2 1-2 3m0 3h.01"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  logout: '<path d="M10 3H4v18h6m4-14 5 5-5 5m-6-5h11"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
function icon(name) {
  return `<span class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.box}</svg></span>`;
}
document
  .querySelectorAll("[data-icon]")
  .forEach((n) => (n.innerHTML = icon(n.dataset.icon)));
const storage = {
  get(key, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};
const native = !!window.Capacitor?.isNativePlatform?.();
const API =
  native && !/^https:\/\/(www\.)?axzen\.in$/.test(location.origin)
    ? "https://www.axzen.in"
    : "";
const state = {
  products: [],
  config: {},
  catalog: "loading",
  error: "",
  user: null,
  token: storage.get("axzen.customer.session")?.token || "",
  cart: [],
  wishlist: storage.get("axzen.guest.wishlist", []),
  orders: [],
  checkout: null,
  shown: 24,
  loginReturn: null,
};
let toastTimer,
  viewNumber = 0,
  cartSave = Promise.resolve(),
  firebaseApi,
  confirmation,
  verifier,
  loginBusy = false,
  paymentBusy = false;
const pendingKey = () => `axzen.payment.pending.${state.user?.id || "guest"}`;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").hidden = true), 4500);
}
async function api(
  path,
  { method = "GET", body, auth = true, headers = {} } = {},
) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(auth && state.token
        ? { Authorization: `Bearer ${state.token}` }
        : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response
    .json()
    .catch(() => ({ message: "The service is temporarily unavailable." }));
  if (!response.ok) {
    if (response.status === 401) {
      state.token = "";
      state.user = null;
      state.checkout = null;
      state.orders = [];
      storage.remove("axzen.customer.session");
      state.cart = storage.get("axzen.guest.cart", []);
      state.wishlist = storage.get("axzen.guest.wishlist", []);
      updateChrome();
    }
    throw new Error(result.message || "Please try again.");
  }
  return result;
}
function route() {
  const legacy = new URLSearchParams(location.search);
  if (!location.hash && legacy.has("product"))
    return {
      page: "product",
      params: new URLSearchParams({ id: legacy.get("product") }),
    };
  if (!location.hash && legacy.has("seller"))
    return {
      page: "store",
      params: new URLSearchParams({ id: legacy.get("seller") }),
    };
  const [page = "home", query = ""] = location.hash.slice(1).split("?");
  return { page: page || "home", params: new URLSearchParams(query) };
}
function go(page, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== "" && v !== false && v != null,
    ),
  ).toString();
  const hash = "#" + page + (qs ? "?" + qs : "");
  if (location.hash === hash) render();
  else location.hash = hash;
}
function pageTitle(title, subtitle = "", action = "") {
  return `<div class="page-title"><div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div>${action}</div>`;
}
function empty(
  title,
  text,
  link = "#shop",
  label = "Explore products",
  type = "box",
) {
  return `<div class="empty">${icon(type)}<h2>${esc(title)}</h2><p>${esc(text)}</p>${link ? `<a href="${esc(link)}" class="primary">${esc(label)} ${icon("arrow")}</a>` : ""}</div>`;
}
function sectionHead(title, sub, link = "#shop", label = "View all") {
  return `<div class="section-head"><div><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ""}</div><a href="${esc(link)}">${esc(label)} &nbsp; →</a></div>`;
}
function product(id) {
  return state.products.find((p) => productKey(p) === String(id));
}
function photo(p, extra = "") {
  const src = safeUrl(p.image || p.images?.[0] || "");
  return src
    ? `<img src="${esc(src)}" alt="${esc(p.title)}" loading="lazy" ${extra}>`
    : `<span class="image-empty" role="img" aria-label="Product image unavailable">${icon("box")}</span>`;
}
function rating(p) {
  const n = Number(p.ratingCount) || 0;
  if (!n) return '<div class="rating muted">New · No reviews yet</div>';
  const avg = Math.max(0, Math.min(5, Number(p.ratingAverage) || 0));
  return `<div class="rating" aria-label="${avg.toFixed(1)} out of 5, ${n} reviews"><span class="stars" aria-hidden="true">★★★★★<span style="width:${avg * 20}%">★★★★★</span></span><strong>${avg.toFixed(1)}</strong><span class="muted">(${n.toLocaleString("en-IN")})</span></div>`;
}
function card(p) {
  const id = productKey(p),
    saved = state.wishlist.includes(id),
    discount =
      p.mrpPaise > p.pricePaise
        ? Math.round((1 - p.pricePaise / p.mrpPaise) * 100)
        : 0;
  const count = state.cart.find((i) => productKey(i) === id)?.quantity || 0;
  return `<article class="product-card"><a class="product-media" href="#product?id=${id}" aria-label="View ${esc(p.title)}">${photo(p)}</a>${discount ? `<span class="badge">${discount}% OFF</span>` : ""}<button class="wishlist-button ${saved ? "active" : ""}" data-action="wishlist" data-id="${id}" aria-label="${saved ? "Remove" : "Save"} ${esc(p.title)} ${saved ? "from" : "to"} wishlist" aria-pressed="${saved}">${icon("heart")}</button><div class="card-copy"><p class="card-category">${esc(p.category)}</p><h3><a class="card-title" href="#product?id=${id}">${esc(p.title)}</a></h3><a class="seller-link" href="#store?id=${esc(p.sellerId)}">Sold by ${esc(p.sellerName)}</a>${rating(p)}<div class="price-row"><strong class="price">${money(p.pricePaise)}</strong>${discount ? `<del>${money(p.mrpPaise)}</del>` : ""}</div><div class="card-bottom"><small>${p.stock < 1 ? "Out of stock" : esc(p.unitLabel || "1 item")}</small><button class="add-button" data-action="add" data-id="${id}" ${p.stock < 1 ? "disabled" : ""} aria-label="Add ${esc(p.title)} to cart">${count ? `Add (${count})` : "+ Add"}</button></div></div></article>`;
}
function grid(rows) {
  return `<div class="product-grid">${rows.map(card).join("")}</div>`;
}
function categories() {
  const preferred = (state.config.categoryOrder || []).map((c) =>
    c.toLowerCase(),
  );
  return [
    ...new Set(state.products.map((p) => p.category).filter(Boolean)),
  ].sort((a, b) => {
    const first = preferred.indexOf(a.toLowerCase()),
      second = preferred.indexOf(b.toLowerCase());
    return (first < 0 ? 999 : first) - (second < 0 ? 999 : second);
  });
}
function offerProducts(offer) {
  const ids = new Set(
    [
      ...(offer?.productIds || []),
      ...(offer?.sellerEntries || []).flatMap((e) => e.productIds || []),
    ].map(String),
  );
  return state.products.filter((p) => ids.has(productKey(p)));
}
function promotions() {
  const offers = (state.config.festivalOffers || []).filter(
    (o) => offerProducts(o).length,
  );
  if (!offers.length) return "";
  return `<section class="section">${sectionHead("In season. On offer.", "Discover offers from our stores.", "#deals")}<div class="offer-grid">${offers.map((o) => `<a class="offer-card" href="#offer?id=${encodeURIComponent(o.id)}">${safeUrl(o.imageUrl || o.imageUrls?.[0]) ? `<img src="${esc(safeUrl(o.imageUrl || o.imageUrls?.[0]))}" alt="" loading="lazy">` : icon("bag")}<div><h3>${esc(o.title)}</h3><span>Explore ${offerProducts(o).length} products →</span></div></a>`).join("")}</div></section>`;
}
function stores() {
  return [...new Set(state.products.map((p) => String(p.sellerId)))].map(
    (id) => {
      const rows = state.products.filter((p) => String(p.sellerId) === id);
      const p = rows[0];
      return {
        id,
        name: p.sellerName,
        category: p.sellerCategory || p.category,
        city: p.sellerCity,
        followers: Number(p.sellerFollowerCount) || 0,
        products: rows,
      };
    },
  );
}
function storeCard(s) {
  return `<a class="store-card" href="#store?id=${esc(s.id)}"><span class="store-avatar">${esc(
    s.name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase(),
  )}</span><span><h3>${esc(s.name)}</h3><small>${esc(s.category)}${s.city ? " · " + esc(s.city) : ""}</small><br><small>${s.products.length} products · ${s.followers} followers</small></span>${icon("arrow")}</a>`;
}
function categoryPhoto(name) {
  const map = {
    electronics: "electronics",
    fashion: "fashion",
    home: "home",
    beauty: "beauty",
  };
  const path = map[name.toLowerCase()];
  return path
    ? `<img src="/assets/categories/${path}.png" alt="" loading="lazy">`
    : icon("grid");
}
function home() {
  const featured = state.products.find(
    (p) => p.stock > 0 && (p.image || p.images?.length),
  );
  const deals = filterProducts(state.products, { sale: true }).slice(0, 4);
  const rows = state.products.slice(0, 8);
  return `<section class="hero"><div class="hero-copy"><div class="eyebrow">THE EVERYDAY EDIT</div><h1>Good finds.<br>Great little<br><em>everyday moments.</em></h1><p>Discover products and independent stores. Find the things that feel like you.</p><a class="primary" href="#shop">Find your favourites ${icon("arrow")}</a></div><div class="hero-art">${featured ? `${photo(featured, 'fetchpriority="high"')}<a class="hero-product-label" href="#product?id=${productKey(featured)}"><small>Explore this find</small><strong>${esc(featured.title)}</strong>${money(featured.pricePaise)} &nbsp; →</a>` : `<div class="hero-abstract"><img src="/assets/axzen-logo.png" alt="Axzen"></div>`}</div></section><div class="benefits"><div>${icon("store")}<span><strong>Independent stores</strong><small>Discover sellers on Axzen</small></span></div><div>${icon("shield")}<span><strong>Clear checkout</strong><small>See your total before paying</small></span></div><div>${icon("box")}<span><strong>Orders in one place</strong><small>Follow every step of your order</small></span></div></div>${
    state.catalog === "loading"
      ? `<section class="section" aria-label="Loading products"><div class="skeleton-grid">${'<div class="skeleton"></div>'.repeat(4)}</div></section>`
      : state.catalog === "error"
        ? `<section class="section">${catalogError()}</section>`
        : !rows.length
          ? `<section class="section">${empty("Fresh finds are on their way", "There are no available products right now. Check back soon or explore the stores.", "#stores", "Browse stores")}</section>`
          : `<section class="section">${sectionHead("A little of everything", "Find your next favourite, by category.")}<div class="categories">${categories()
              .map(
                (c) =>
                  `<a class="category-tile" href="#shop?category=${encodeURIComponent(c)}"><span class="category-photo">${categoryPhoto(c)}</span>${esc(c)}</a>`,
              )
              .join(
                "",
              )}</div></section><section class="section">${sectionHead("Fresh on Axzen", "The latest additions from our stores.")}${grid(rows)}</section>${promotions()}${deals.length ? `<section class="section">${sectionHead("Good finds. Better prices.", "Savings on selected products.", "#deals", "Shop the finds")}${grid(deals)}</section>` : ""}<section class="section">${sectionHead("Meet the stores", "There’s a story behind every storefront.", "#stores", "Explore stores")}<div class="store-grid">${stores().slice(0, 3).map(storeCard).join("")}</div></section>`
  }<section class="editorial"><div><h2>Your favourites, all together.</h2><p>Save the things you love. Come back when the time feels right.</p></div><a href="#wishlist" class="primary">Explore your wishlist ${icon("heart")}</a></section>`;
}
function catalogError() {
  return `<div class="empty">${icon("box")}<h2>We couldn’t load the products</h2><p>Check your connection and try again. Your saved cart is safe.</p><button class="primary" data-action="retry">Try again</button></div>`;
}
function shop(params, deals = false) {
  if (state.catalog === "loading")
    return (
      pageTitle("Finding your favourites") +
      '<div class="skeleton-grid" aria-label="Loading products">' +
      '<div class="skeleton"></div>'.repeat(4) +
      "</div>"
    );
  if (state.catalog === "error") return catalogError();
  const filters = {
    search: params.get("q") || "",
    category: params.get("category") || "",
    seller: params.get("seller") || "",
    sort: params.get("sort") || "newest",
    stock: params.get("stock") === "true",
    maxPrice: params.get("maxPrice") || "",
    rating: params.get("rating") === "true",
    sale: deals,
  };
  const rows = filterProducts(state.products, filters);
  return `${pageTitle(deals ? "Good finds. Better prices." : filters.search ? `Results for “${filters.search}”` : filters.category || "Find your next favourite", deals ? "Savings shown against the listed MRP." : "Explore products from stores across Axzen.")}<div class="catalog-layout"><aside class="filters" id="filters"><h3>Make it your kind of find</h3><form id="filter-form"><label for="filter-category">Category</label><select id="filter-category" name="category"><option value="">All categories</option>${categories()
    .map(
      (c) =>
        `<option ${c === filters.category ? "selected" : ""}>${esc(c)}</option>`,
    )
    .join(
      "",
    )}</select><label for="filter-price">Maximum price (₹)</label><input type="number" id="filter-price" name="maxPrice" min="0" step="1" placeholder="Any price" value="${esc(filters.maxPrice)}"><label class="check-label"><input type="checkbox" name="stock" ${filters.stock ? "checked" : ""}> In stock only</label><label class="check-label"><input type="checkbox" name="rating" ${filters.rating ? "checked" : ""}> Rated 4★ & above</label><button class="primary" type="submit">Apply filters</button> <a class="text-button" href="#${deals ? "deals" : "shop"}">Reset</a></form></aside><section><div class="catalog-top"><span>${rows.length} products</span><button class="outline mobile-filter" data-action="filters" aria-expanded="false">${icon("filter")} Filters</button><select aria-label="Sort products" id="sort"><option value="newest">New arrivals</option><option value="price-low" ${filters.sort === "price-low" ? "selected" : ""}>Price: low to high</option><option value="price-high" ${filters.sort === "price-high" ? "selected" : ""}>Price: high to low</option><option value="rating" ${filters.sort === "rating" ? "selected" : ""}>Top rated</option></select></div>${state.catalog === "error" ? catalogError() : rows.length ? grid(rows.slice(0, state.shown)) : empty("No matching finds", "Try another search or remove a filter.", "#shop", "Clear filters")}${rows.length > state.shown ? '<div class="load-more"><button class="outline" data-action="more">Show more products</button></div>' : ""}</section></div>`;
}
function detail(id) {
  const p = product(id);
  if (!p)
    return (
      pageTitle("Product") +
      empty(
        "This product is unavailable",
        "It may have sold out or been removed by the seller.",
      )
    );
  const images = [...new Set([p.image, ...(p.images || [])].filter(Boolean))];
  return `<div class="breadcrumb"><a href="#home">Home</a> &nbsp;/&nbsp; <a href="#shop?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a></div><section class="product-detail"><div><div class="gallery-main" id="gallery-main">${photo(p)}</div>${images.length > 1 ? `<div class="gallery-thumbs" aria-label="Product images">${images.map((src, i) => `<button data-action="image" data-id="${id}" data-index="${i}" class="${i === 0 ? "active" : ""}" aria-label="View image ${i + 1}"><img src="${esc(safeUrl(src))}" alt=""></button>`).join("")}</div>` : ""}</div><div class="detail-copy"><p class="card-category">${esc(p.category)}</p><h1>${esc(p.title)}</h1><a class="seller-link" href="#store?id=${esc(p.sellerId)}">Sold by ${esc(p.sellerName)} →</a>${rating(p)}<div class="price-row"><strong class="price">${money(p.pricePaise)}</strong>${p.mrpPaise > p.pricePaise ? `<del>${money(p.mrpPaise)}</del>` : ""}</div><small>${esc(p.unitLabel || "1 item")} · Delivery charges shown at checkout</small><p class="detail-description">${esc(p.description || "The seller has not added a detailed description for this product yet.")}</p><span class="status-pill">${p.stock > 0 ? `${p.stock < 10 ? p.stock + " available" : "In stock"}` : "Currently unavailable"}</span><div class="detail-actions"><button class="primary" data-action="add" data-id="${id}" ${p.stock < 1 ? "disabled" : ""}>${icon("bag")} Add to cart</button><button class="primary accent" data-action="buy" data-id="${id}" ${p.stock < 1 ? "disabled" : ""}>Buy now</button></div><div class="info-box"><div>${icon("pin")}<span><strong>Delivery address</strong><small>Set your address at checkout. Courier updates appear in Orders.</small></span></div><div>${icon("shield")}<span><strong>Payment options</strong><small>${[p.codEnabled ? "Cash on Delivery" : "", p.onlinePaymentEnabled ? "UPI, cards and netbanking" : ""].filter(Boolean).join(" · ") || "Payments currently unavailable"}</small></span></div><div>${icon("help")}<a href="#help">Need product or order help? Contact support →</a></div></div></div></section><section class="section">${sectionHead("More from this store", "Explore another good find.", `#store?id=${p.sellerId}`)}${grid(state.products.filter((x) => x.sellerId === p.sellerId && productKey(x) !== id).slice(0, 4))}</section>`;
}
function cartItem(i) {
  const id = productKey(i);
  return `<div class="cart-item">${photo(i)}<div><h3><a href="#product?id=${id}">${esc(i.title || "Unavailable product")}</a></h3><small>${esc(i.unitLabel || "1 item")}${i.unavailable ? " · Unavailable" : ""}</small><div><div class="quantity" aria-label="Quantity"><button data-action="quantity" data-id="${id}" data-delta="-1" aria-label="Decrease quantity of ${esc(i.title)}">−</button><span>${i.quantity}</span><button data-action="quantity" data-id="${id}" data-delta="1" aria-label="Increase quantity of ${esc(i.title)}" ${i.unavailable || i.quantity >= Math.min(10, i.stock || 0) ? "disabled" : ""}>+</button></div><button class="remove" data-action="remove" data-id="${id}">Remove</button></div></div><strong class="price">${money(i.pricePaise * i.quantity)}</strong></div>`;
}
function cartPage() {
  if (!state.cart.length)
    return (
      pageTitle("Your cart") +
      empty(
        "Your cart is waiting for a good find",
        "Explore the stores and add something you love.",
        "#shop",
        "Start exploring",
        "bag",
      )
    );
  const groups = groupedCart(state.cart),
    total = state.cart.reduce(
      (n, i) => n + (i.pricePaise || 0) * i.quantity,
      0,
    );
  return `${pageTitle("Your cart", `${state.cart.reduce((n, i) => n + i.quantity, 0)} items from ${groups.length} ${groups.length === 1 ? "store" : "stores"}`, '<a href="#shop" class="text-button">Continue shopping →</a>')}<div class="cart-layout"><div>${groups.map((s) => `<section class="cart-store"><a class="cart-store-head" href="#store?id=${esc(s.id)}">${icon("store")} ${esc(s.name)}</a>${s.items.map(cartItem).join("")}<div class="cart-store-bottom"><span>Items total <strong>${money(s.items.reduce((n, i) => n + i.pricePaise * i.quantity, 0))}</strong></span><button class="primary" data-action="checkout" data-seller="${esc(s.id)}" ${s.items.some((i) => i.unavailable || i.quantity > i.stock) ? "disabled" : ""}>Checkout this store →</button></div></section>`).join("")}</div><aside class="summary"><h2>Your cart at a glance</h2><div class="summary-row"><span>Products</span><strong>${money(total)}</strong></div><div class="summary-row"><span>Delivery</span><span>At checkout</span></div><div class="summary-row total"><span>Items total</span><strong>${money(total)}</strong></div><small>Each store has its own checkout and delivery. Items from other stores stay in your cart.</small>${state.cart.some((i) => i.unavailable || i.quantity > i.stock) ? '<p class="error">Review unavailable items or reduce their quantities before checkout.</p>' : ""}</aside></div>`;
}
function addressFields(a = {}) {
  return `<div class="form-grid"><label class="mobile-wide">Full name<input name="fullName" autocomplete="name" required minlength="2" maxlength="100" value="${esc(a.fullName || state.user?.name || "")}"></label><label class="mobile-wide">Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" pattern="[6-9][0-9]{9}" maxlength="10" required value="${esc((a.phone || state.user?.phone || "").replace(/^\+91/, ""))}" placeholder="10-digit mobile number"></label><label class="wide">House, building, street and area<input name="address" autocomplete="street-address" required minlength="5" maxlength="500" value="${esc(a.address || "")}"></label><label>Pincode<input name="pincode" inputmode="numeric" autocomplete="postal-code" pattern="[1-9][0-9]{5}" maxlength="6" required value="${esc(a.pincode || storage.get("axzen.delivery.pincode", ""))}"></label><label>City<input name="city" autocomplete="address-level2" required maxlength="100" value="${esc(a.city || "")}"></label><label class="wide">State<input name="state" autocomplete="address-level1" required maxlength="100" value="${esc(a.state || "")}"></label></div>`;
}
function financeSummary(f) {
  return `<aside class="summary"><h2>Order summary</h2><div class="summary-row"><span>Items total</span><strong>${money(f.productTotalPaise)}</strong></div><div class="summary-row"><span>Delivery</span><strong>${f.deliveryChargePaise ? money(f.deliveryChargePaise) : "Free"}</strong></div><div class="summary-row total"><span>Total to pay</span><strong>${money(f.customerPaidPaise)}</strong></div><small>Prices and availability are checked again when you place your order.</small></aside>`;
}
function checkoutPage() {
  const c = state.checkout;
  if (!c)
    return (
      pageTitle("Checkout") +
      empty(
        "Start from your cart",
        "Choose the store you want to check out.",
        "#cart",
        "Open cart",
      )
    );
  return `${pageTitle("A few details. Then it’s yours.", `Checking out from ${c.sellerName}`)}<div class="stepper"><span class="${c.step === 1 ? "active" : ""}"><b>1</b> Delivery</span><span class="${c.step === 2 ? "active" : ""}"><b>2</b> Payment & review</span><span><b>3</b> Confirmation</span></div><div class="checkout-layout"><div>${c.step === 1 ? `<section class="form-card"><h2>Where should we send it?</h2>${state.user.addresses?.length ? `<label class="field">Saved address<select id="saved-address"><option value="">Enter a new address</option>${state.user.addresses.map((a, i) => `<option value="${i}">${esc(a.fullName)} · ${esc(a.address)} · ${esc(a.pincode)}</option>`).join("")}</select></label><br>` : ""}<form id="checkout-address">${addressFields(c.address)}<label class="check-label"><input type="checkbox" name="saveAddress"> Save this address to my account</label><button type="submit" class="primary">Continue to payment ${icon("arrow")}</button><div class="form-error" role="alert"></div></form></section>` : `<section class="form-card"><h2>Delivery details</h2><p>${esc(c.address.fullName)} · ${esc(c.address.phone)}</p><p class="muted">${esc(c.address.address)}, ${esc(c.address.city)}, ${esc(c.address.state)} ${esc(c.address.pincode)}</p><button class="text-button" data-action="edit-delivery">Change address</button></section><section class="form-card"><h2>Choose how to pay</h2><form id="payment-form">${c.codEnabled ? `<label class="payment-option"><input type="radio" name="paymentMethod" value="cod" ${c.method === "cod" ? "checked" : ""}><span><strong>Cash on Delivery</strong><small>Pay when your order arrives.</small></span></label>` : ""}${c.onlinePaymentEnabled ? `<label class="payment-option"><input type="radio" name="paymentMethod" value="razorpay" ${c.method === "razorpay" ? "checked" : ""}><span><strong>UPI, cards or netbanking</strong><small>Complete payment securely with Razorpay.</small></span></label>` : ""}<p class="muted">${c.items.length} products · ${money(c.finance.customerPaidPaise)} total</p><button class="primary" type="submit" ${paymentBusy ? "disabled" : ""}>${paymentBusy ? "Processing…" : c.method === "cod" ? "Place order" : "Pay " + money(c.finance.customerPaidPaise)}</button><p class="dialog-copy">By placing your order, you agree to the <a href="/terms.html" target="_blank" rel="noopener">terms of service</a>.</p><div class="form-error" role="alert"></div></form></section>`}</div>${financeSummary(c.finance)}</div>`;
}
function orderCard(o) {
  return `<article class="order-card"><div class="order-head"><span>ORDER PLACED<strong>${new Date(o.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong></span><span>TOTAL<strong>${money(o.customerPaid)}</strong></span><span class="status-pill">${esc(o.status.replaceAll("_", " "))}</span></div><div class="order-body"><div class="order-products">${o.items?.[0] ? photo(o.items[0]) : ""}<div><h3>${esc(o.items?.[0]?.title || "Your order")}${o.items?.length > 1 ? ` + ${o.items.length - 1} more` : ""}</h3><p>${esc(o.sellerName)}</p><p>${esc(o.paymentMethod === "cod" ? "Cash on Delivery" : o.paymentStatus === "paid" ? "Payment received" : o.paymentStatus)}</p></div></div><a class="outline" href="#order?id=${encodeURIComponent(o.orderId)}">View order ${icon("arrow")}</a></div></article>`;
}
function orderDetail(o) {
  if (!o)
    return empty(
      "Order not found",
      "Sign in to the account used for this order.",
      "#orders",
      "Your orders",
    );
  return `${pageTitle(o.status === "delivered" ? "Delivered to your door" : o.status === "cancelled" ? "Order cancelled" : "Your order, every step of the way", o.orderId)}<div class="checkout-layout"><div><div class="form-card"><h2>${esc(o.sellerName)}</h2>${
    ["cancelled", "returned"].includes(o.status)
      ? `<p class="error">${esc(o.cancelReason || o.returnReason || o.status)}</p>`
      : `<ol class="timeline">${stepsFor(o)
          .map(
            (s) =>
              `<li class="${s.done ? "done" : ""} ${s.current ? "current" : ""}">${s.label}${s.at ? `<small>${new Date(s.at).toLocaleDateString("en-IN")}</small>` : ""}</li>`,
          )
          .join("")}</ol>`
  }${o.trackingUrl && safeUrl(o.trackingUrl) ? `<a class="outline" href="${esc(safeUrl(o.trackingUrl))}" target="_blank" rel="noopener">Track with ${esc(o.courierName || "courier")} ↗</a>` : `<p class="muted">${o.status === "delivered" ? "Your order has been delivered." : "Courier tracking will appear when your shipment is booked."}</p>`}${o.refundStatus && o.refundStatus !== "none" ? `<p class="error">Refund ${o.refundStatus === "processed" ? "processed" : o.refundStatus === "scheduled" ? "requested · awaiting confirmation" : esc(o.refundStatus)}. Contact support for an update.</p>` : ""}</div><div class="cart-store">${o.items.map((i) => `<div class="cart-item">${photo(i)}<div><h3>${esc(i.title)}</h3><small>Qty ${i.quantity}</small></div><strong>${money(i.quantity * i.pricePaise)}</strong></div>`).join("")}</div><div class="form-card"><h2>Delivery address</h2><p>${esc(o.shippingAddress?.fullName)}</p><p class="muted">${esc([o.shippingAddress?.address, o.shippingAddress?.city, o.shippingAddress?.state, o.shippingAddress?.pincode].filter(Boolean).join(", "))}</p><p class="muted">${esc(o.shippingAddress?.phone)}</p></div><div class="detail-actions"><button class="outline" data-action="invoice" data-id="${esc(o.orderId)}">View invoice</button>${["placed", "pending", "accepted", "confirmed"].includes(o.status) && !o.awbNumber ? `<button class="outline" data-action="cancel-order" data-id="${esc(o.orderId)}">Cancel order</button>` : ""}<a class="outline" href="#help?order=${encodeURIComponent(o.orderId)}">Get help</a></div></div>${financeSummary(o.finance || { productTotalPaise: o.productTotal, deliveryChargePaise: o.deliveryCharge, customerPaidPaise: o.customerPaid })}</div>`;
}
function accountMenu(active) {
  return `<nav class="account-menu" aria-label="Account sections">${[
    ["account", "user", "Overview"],
    ["orders", "box", "Your orders"],
    ["addresses", "pin", "Saved addresses"],
    ["wishlist", "heart", "Wishlist"],
    ["notifications", "bell", "Notifications"],
    ["help", "help", "Help & support"],
  ]
    .map(
      ([page, i, label]) =>
        `<a class="${page === active ? "active" : ""}" href="#${page}">${icon(i)}${label}</a>`,
    )
    .join(
      "",
    )}<button data-action="logout">${icon("logout")}Sign out</button></nav>`;
}
function account() {
  return `${pageTitle(`Hello, ${state.user.name?.split(" ")[0] || "there"}.`, "Your shopping, in one place.")}<div class="account-layout">${accountMenu("account")}<div><div class="account-grid">${[
    ["orders", "box", "Your orders", "Track, view invoices and get help."],
    ["addresses", "pin", "Your addresses", "Ready for your next delivery."],
    [
      "wishlist",
      "heart",
      "Your wishlist",
      "All the things you’re keeping an eye on.",
    ],
    ["notifications", "bell", "Your updates", "News from stores you follow."],
  ]
    .map(
      ([page, i, title, sub]) =>
        `<a class="account-tile" href="#${page}">${icon(i)}<span><strong>${title}</strong><small>${sub}</small></span></a>`,
    )
    .join(
      "",
    )}</div><form class="form-card section" id="profile-form"><h2>Personal details</h2><label class="field">Full name<input name="name" autocomplete="name" required minlength="2" maxlength="100" value="${esc(state.user.name)}"></label><p class="dialog-copy">Verified mobile: ${esc(state.user.phone)}</p><button class="primary">Save details</button><div class="form-error" role="alert"></div></form></div></div>`;
}
function addresses() {
  return `${pageTitle("Your addresses", "Saved securely to your account.")}<div class="account-layout">${accountMenu("addresses")}<div>${(state.user.addresses || []).map((a, i) => `<article class="form-card"><h3>${esc(a.fullName)}</h3><p class="muted">${esc(a.address)}, ${esc(a.city)}, ${esc(a.state)} ${esc(a.pincode)}</p><small>${esc(a.phone)}</small><br><button class="text-button" data-action="delete-address" data-index="${i}">Remove address</button></article>`).join("")}<form class="form-card" id="address-form"><h2>Add a new address</h2>${addressFields()}<button class="primary">Save address</button><div class="form-error" role="alert"></div></form></div></div>`;
}
function help(params) {
  return `${pageTitle("A little help, whenever you need it.", "We’re here for your product and order questions.")}<div class="account-grid"><a class="account-tile" href="#orders">${icon("box")}<span><strong>Order & delivery help</strong><small>Open an order to track it or cancel before it ships.</small></span></a><a class="account-tile" href="mailto:axzeninfotech@gmail.com?subject=${encodeURIComponent("Axzen support" + (params.get("order") ? " — " + params.get("order") : ""))}">${icon("help")}<span><strong>Contact Axzen support</strong><small>axzeninfotech@gmail.com<br>Include your order number so we can help.</small></span></a><a class="account-tile" href="/privacy.html">${icon("shield")}<span><strong>Your privacy</strong><small>Learn how your information is handled.</small></span></a><a class="account-tile" href="/data-deletion.html">${icon("user")}<span><strong>Manage your data</strong><small>Account and data deletion instructions.</small></span></a></div>`;
}
function signInPrompt() {
  return `<div class="empty">${icon("user")}<h2>Make yourself at home.</h2><p>Sign in to see your orders, save addresses and keep your favourites together.</p><button class="primary" data-action="login">Sign in with your phone ${icon("arrow")}</button></div>`;
}
function updateChrome() {
  const count = state.cart.reduce((n, i) => n + i.quantity, 0);
  $("#cart-count").textContent = count;
  $("#mobile-cart-count").textContent = count;
  $("#mobile-cart-count").hidden = !count;
  $("#account-label").textContent =
    state.user?.name?.split(" ")[0] || "Account";
  $("#delivery-label").textContent =
    storage.get("axzen.delivery.pincode") || "Set pincode";
  const page = route().page;
  document
    .querySelectorAll("[data-nav]")
    .forEach((n) =>
      n.classList.toggle(
        "active",
        n.dataset.nav ===
          (["product", "deals"].includes(page)
            ? "shop"
            : [
                  "order",
                  "orders",
                  "addresses",
                  "wishlist",
                  "help",
                  "notifications",
                ].includes(page)
              ? "account"
              : ["store"].includes(page)
                ? "stores"
                : page),
      ),
    );
  $("#year").textContent = new Date().getFullYear();
}
async function render() {
  const v = ++viewNumber;
  const { page, params } = route();
  const main = $("#main");
  updateChrome();
  document.title =
    (page === "home"
      ? "Find your everyday favourites"
      : page[0].toUpperCase() + page.slice(1)) + " | Axzen";
  if (
    [
      "account",
      "orders",
      "order",
      "addresses",
      "checkout",
      "notifications",
    ].includes(page) &&
    !state.user
  ) {
    main.innerHTML =
      pageTitle(page === "checkout" ? "Checkout" : "Your account") +
      signInPrompt();
    return;
  }
  switch (page) {
    case "home":
      main.innerHTML = home();
      break;
    case "shop":
    case "products":
    case "deals":
      main.innerHTML = shop(params, page === "deals");
      break;
    case "offer": {
      const offer = (state.config.festivalOffers || []).find(
        (o) => o.id === params.get("id"),
      );
      main.innerHTML = offer
        ? pageTitle(
            offer.title,
            "Offer prices are included in the displayed total.",
          ) + grid(offerProducts(offer))
        : empty(
            "Offer unavailable",
            "Explore the latest offers instead.",
            "#deals",
            "Explore offers",
          );
      break;
    }
    case "product":
      main.innerHTML = detail(params.get("id"));
      break;
    case "cart":
      main.innerHTML = cartPage();
      break;
    case "wishlist":
      main.innerHTML =
        pageTitle(
          "For another day. Or today.",
          `${state.wishlist.length} saved finds`,
        ) +
        (state.wishlist.length
          ? grid(
              state.products.filter((p) =>
                state.wishlist.includes(productKey(p)),
              ),
            )
          : empty(
              "Your favourites live here",
              "Tap the heart on a product to save it.",
              "#shop",
              "Discover something good",
              "heart",
            ));
      break;
    case "stores":
      main.innerHTML =
        pageTitle(
          "Good stores. Great discoveries.",
          "Explore the people behind your next favourite find.",
        ) +
        (stores().length
          ? '<div class="store-grid">' +
            stores().map(storeCard).join("") +
            "</div>"
          : empty(
              "Stores are getting ready",
              "Check back when sellers have added available products.",
            ));
      break;
    case "store": {
      const s = stores().find((s) => s.id === params.get("id"));
      main.innerHTML = s
        ? `${pageTitle("Meet the store")}<section class="store-banner"><div class="store-avatar">${esc(s.name.slice(0, 2).toUpperCase())}</div><div><h1>${esc(s.name)}</h1><p>${esc(s.category)}${s.city ? " · " + esc(s.city) : ""} · ${s.followers} followers</p></div><button class="primary" data-action="follow" data-id="${esc(s.id)}">Follow store</button></section><section class="section">${sectionHead("From this store", `${s.products.length} products`)}${grid(s.products)}</section>`
        : empty(
            "Store unavailable",
            "This store is not taking orders right now.",
            "#stores",
            "Explore stores",
          );
      break;
    }
    case "checkout":
      main.innerHTML = checkoutPage();
      break;
    case "account":
      main.innerHTML = account();
      break;
    case "addresses":
      main.innerHTML = addresses();
      break;
    case "help":
      main.innerHTML = help(params);
      break;
    case "orders":
    case "order": {
      main.innerHTML =
        pageTitle("Your orders") + '<p role="status">Loading your orders…</p>';
      try {
        const [result, reviews] = await Promise.all([
          api("/api/orders/customer"),
          api("/api/orders/payment-reviews").catch(() => ({ items: [] })),
        ]);
        if (v !== viewNumber) return;
        state.orders = result.orders || [];
        const pending = storage.get(pendingKey());
        main.innerHTML =
          page === "order"
            ? orderDetail(
                state.orders.find((o) => o.orderId === params.get("id")),
              )
            : pageTitle(
                "Your orders",
                "Every good find, from checkout to your door.",
              ) +
              (pending
                ? '<div class="error">A payment still needs confirmation. Do not pay again. <button class="outline" data-action="retry-payment">Check payment status</button></div>'
                : "") +
              (reviews.items.length
                ? '<p class="error">A payment needs support review. Its payment reference is shown below.</p>' +
                  reviews.items
                    .map(
                      (p) =>
                        `<div class="form-card"><strong>${esc(p.paymentId)}</strong><p>${money(p.finance?.customerPaidPaise)} · Contact support if your order is not shown.</p><a href="#help" class="text-button">Get help →</a></div>`,
                    )
                    .join("")
                : "") +
              (state.orders.length
                ? state.orders.map(orderCard).join("")
                : empty(
                    "Your first order starts with a good find",
                    "Your orders and delivery updates will appear here.",
                    "#shop",
                    "Explore products",
                    "box",
                  ));
      } catch (e) {
        if (v === viewNumber)
          main.innerHTML =
            pageTitle("Your orders") +
            empty(
              "Couldn’t load your orders",
              e.message,
              "#orders",
              "Try again",
            );
      }
      break;
    }
    case "notifications": {
      main.innerHTML =
        pageTitle("Your updates") + '<p role="status">Loading…</p>';
      try {
        const r = await api("/api/customer/notifications");
        if (v !== viewNumber) return;
        main.innerHTML =
          pageTitle("Your updates") +
          (r.notifications.length
            ? r.notifications
                .map(
                  (n) =>
                    `<article class="form-card"><h3>${esc(n.title)}</h3><p class="muted">${esc(n.message)}</p><small>${new Date(n.createdAt).toLocaleDateString("en-IN")}</small></article>`,
                )
                .join("")
            : empty(
                "All caught up",
                "Updates from stores you follow will appear here.",
                "#stores",
                "Explore stores",
                "bell",
              ));
        await api("/api/customer/notifications/read", { method: "POST" });
      } catch (e) {
        if (v === viewNumber)
          main.innerHTML = empty(
            "Updates unavailable",
            e.message,
            "#notifications",
            "Try again",
          );
      }
      break;
    }
    default:
      main.innerHTML = home();
  }
}
async function loadCatalog() {
  state.catalog = "loading";
  render();
  try {
    const [catalog, config] = await Promise.all([
      api("/api/customer/catalog", { auth: false }),
      api("/api/customer/app-config", { auth: false }).catch(() => ({
        config: {},
      })),
    ]);
    if (!Array.isArray(catalog.products))
      throw new Error("Invalid catalog response.");
    const categoryNames = new Map();
    state.products = catalog.products.map((p) => {
      const raw = String(p.category || "General").trim();
      const key = raw.toLowerCase();
      if (!categoryNames.has(key))
        categoryNames.set(key, raw.charAt(0).toUpperCase() + raw.slice(1));
      return { ...p, category: categoryNames.get(key) };
    });
    state.config = config.config || {};
    state.catalog = "ready";
    state.cart = reconcileCart(state.cart, state.products);
    $("#category-nav").innerHTML =
      '<a href="#shop">All products</a>' +
      categories()
        .slice(0, 6)
        .map(
          (c) =>
            `<a href="#shop?category=${encodeURIComponent(c)}">${esc(c)}</a>`,
        )
        .join("") +
      '<a href="#stores">Stores</a><a href="#deals">Today’s finds</a><a href="#orders">Track an order</a>';
    render();
  } catch (e) {
    state.catalog = "error";
    state.error = e.message;
    render();
  }
}
function saveCart(strict = false) {
  updateChrome();
  if (!state.user) {
    storage.set("axzen.guest.cart", state.cart);
    return Promise.resolve();
  }
  const body = {
    items: state.cart
      .filter((i) => !i.unavailable)
      .map((i) => ({ productId: productKey(i), quantity: i.quantity })),
  };
  const token = state.token;
  cartSave = cartSave
    .catch(() => {})
    .then(() => {
      if (token !== state.token) return;
      return api("/api/cart", { method: "POST", body });
    })
    .catch((e) => {
      toast("Cart couldn’t sync: " + e.message);
      if (strict) throw e;
    });
  return cartSave;
}
async function add(id, quiet = false) {
  const p = product(id);
  if (!p || p.stock < 1) {
    toast("This item is unavailable.");
    return false;
  }
  const existing = state.cart.find((i) => productKey(i) === id);
  if (existing && existing.quantity >= Math.min(10, p.stock)) {
    toast("You’ve reached the available quantity.");
    return false;
  }
  if (existing) existing.quantity++;
  else state.cart.push({ ...p, id, productId: id, quantity: 1 });
  await saveCart();
  if (!quiet) toast("Added to your cart");
  render();
  return true;
}
async function toggleWishlist(id) {
  const next = state.wishlist.includes(id)
    ? state.wishlist.filter((x) => x !== id)
    : [...state.wishlist, id];
  try {
    if (state.user)
      await api("/api/wishlist", { method: "POST", body: { products: next } });
    else storage.set("axzen.guest.wishlist", next);
    state.wishlist = next;
    render();
    toast(
      next.includes(id) ? "Saved to your wishlist" : "Removed from wishlist",
    );
  } catch (e) {
    toast(e.message);
  }
}
function showDialog(title, body) {
  $("#dialog").innerHTML =
    `<div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2><button class="dialog-close" data-action="close-dialog" aria-label="Close">${icon("close")}</button></div>${body}`;
  if (!$("#dialog").open) $("#dialog").showModal();
}
function login() {
  confirmation = null;
  state.loginReturn = location.hash || "#account";
  showDialog(
    "Welcome to Axzen",
    `<p class="dialog-copy">Your next favourite find is waiting. Sign in with a one-time code.</p><form class="login-form" id="phone-form"><label class="field">Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" required pattern="[6-9][0-9]{9}" maxlength="10" placeholder="10-digit Indian mobile number"></label><button class="primary">Send OTP</button><div class="form-error" role="alert"></div></form><div id="axzen-customer-recaptcha"></div><p class="dialog-copy">We use your number to secure your account. <a href="/privacy.html">Privacy policy</a></p>`,
  );
}
async function loadFirebase() {
  if (firebaseApi) return firebaseApi;
  const [app, auth] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"),
  ]);
  const instance = app.getApps().length
    ? app.getApp()
    : app.initializeApp(firebaseConfig);
  firebaseApi = { ...auth, auth: auth.getAuth(instance) };
  return firebaseApi;
}
async function finishLogin(firebaseToken) {
  const r = await api("/api/auth/phone-login", {
    method: "POST",
    auth: false,
    body: { role: "customer", firebaseToken },
  });
  state.token = r.token;
  storage.set("axzen.customer.session", { token: r.token });
  const guestCart = storage.get("axzen.guest.cart", []),
    guestWishlist = storage.get("axzen.guest.wishlist", []);
  const [me, cart, wishlist] = await Promise.all([
    api("/api/customer/me"),
    api("/api/cart"),
    api("/api/wishlist"),
  ]);
  state.user = me.user;
  state.cart = reconcileCart(
    [...(cart.cart?.items || []), ...guestCart],
    state.products,
  );
  state.wishlist = [
    ...new Set([
      ...(wishlist.wishlist?.products || []).map(productKey),
      ...guestWishlist,
    ]),
  ];
  await saveCart(true);
  storage.remove("axzen.guest.cart");
  await api("/api/wishlist", {
    method: "POST",
    body: { products: state.wishlist },
  });
  storage.remove("axzen.guest.cart");
  storage.remove("axzen.guest.wishlist");
  $("#dialog").close();
  toast("Welcome to Axzen");
  if (state.checkout) {
    await refreshQuote();
    go("checkout");
  } else render();
}
async function beginCheckout(sellerId, onlyProduct) {
  const group = groupedCart(state.cart).find((s) => s.id === sellerId);
  if (!group) return;
  if (onlyProduct)
    group.items = group.items.filter((i) => productKey(i) === onlyProduct);
  const p = group.items[0];
  if (!p.codEnabled && !p.onlinePaymentEnabled) {
    toast("This store has no payment method available.");
    return;
  }
  const method = p.codEnabled ? "cod" : "razorpay";
  state.checkout = {
    sellerId,
    items: group.items.map((i) => ({
      productId: productKey(i),
      quantity: i.quantity,
    })),
    sellerName: group.name,
    method,
    step: 1,
    idempotencyKey: crypto.randomUUID(),
    codEnabled: p.codEnabled,
    onlinePaymentEnabled: p.onlinePaymentEnabled,
  };
  if (!state.user) {
    login();
    return;
  }
  try {
    await refreshQuote();
    go("checkout");
  } catch (e) {
    toast(e.message);
  }
}
async function refreshQuote() {
  const c = state.checkout;
  const result = await api("/api/orders/quote", {
    method: "POST",
    body: { items: c.items, paymentMethod: c.method },
  });
  Object.assign(c, result.quote);
}
async function razorpay(c) {
  const r = await api("/api/orders/razorpay/order", {
    method: "POST",
    body: {
      items: c.items,
      paymentMethod: "razorpay",
      shippingAddress: c.address,
      expectedTotalPaise: c.finance.customerPaidPaise,
    },
  });
  if (!window.Razorpay)
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve;
      s.onerror = () => {
        s.remove();
        reject(new Error("Payment window couldn’t load. Please retry."));
      };
      document.head.append(s);
    });
  return new Promise((resolve, reject) => {
    const popup = new window.Razorpay({
      key: r.keyId,
      order_id: r.razorpayOrder.id,
      amount: r.amountPaise,
      currency: "INR",
      name: "Axzen",
      description: "Order from " + c.sellerName,
      prefill: { name: c.address.fullName, contact: c.address.phone },
      theme: { color: "#102a43" },
      handler: (p) =>
        resolve({
          razorpayOrderId: r.razorpayOrder.id,
          razorpayPaymentId: p.razorpay_payment_id,
          razorpaySignature: p.razorpay_signature,
        }),
      modal: {
        ondismiss: () =>
          reject(new Error("Payment cancelled. Your cart is unchanged.")),
      },
    });
    popup.open();
  });
}
async function completeOrder(body) {
  const r = await api("/api/customer/orders", { method: "POST", body });
  const purchased = new Set(r.order.items.map(productKey));
  state.cart = state.cart.filter((i) => !purchased.has(productKey(i)));
  await saveCart();
  storage.remove(pendingKey());
  state.checkout = null;
  toast("Order placed. Thank you for shopping with Axzen.");
  go("order", { id: r.order.orderId });
  loadCatalog();
}
function formError(form, error) {
  const n = form.querySelector(".form-error");
  if (n) {
    n.className = "form-error error";
    n.textContent = error.message || String(error);
  } else toast(error.message);
}
document.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action,
    id = button.dataset.id;
  try {
    switch (action) {
      case "retry":
        await loadCatalog();
        break;
      case "add":
        await add(id);
        break;
      case "buy":
        if (await add(id, true))
          await beginCheckout(String(product(id).sellerId), id);
        break;
      case "wishlist":
        await toggleWishlist(id);
        break;
      case "quantity": {
        const item = state.cart.find((i) => productKey(i) === id);
        if (!item) break;
        const q = item.quantity + Number(button.dataset.delta);
        if (q <= 0) state.cart = state.cart.filter((i) => i !== item);
        else if (q <= Math.min(10, item.stock || 0)) item.quantity = q;
        await saveCart();
        render();
        break;
      }
      case "remove":
        state.cart = state.cart.filter((i) => productKey(i) !== id);
        await saveCart();
        render();
        break;
      case "checkout":
        button.disabled = true;
        await beginCheckout(button.dataset.seller);
        button.disabled = false;
        break;
      case "login":
        login();
        break;
      case "logout": {
        state.user = null;
        state.token = "";
        state.checkout = null;
        state.cart = [];
        state.wishlist = [];
        storage.remove("axzen.customer.session");
        for (const key of [
          "axzenCustomerAddress",
          "axzenCustomerAddresses",
          "axzenCustomerProfile",
          "axzenCustomerPayments",
          "axzenCustomerCart",
        ])
          storage.remove(key);
        if (firebaseApi)
          await firebaseApi.signOut(firebaseApi.auth).catch(() => {});
        toast("You’re signed out");
        go("home");
        break;
      }
      case "close-dialog":
        $("#dialog").close();
        break;
      case "location":
        showDialog(
          "Where are we delivering?",
          `<p class="dialog-copy">Save your pincode for the delivery address. Shipping details are confirmed at checkout.</p><form class="login-form" id="location-form"><label class="field">Pincode<input name="pincode" inputmode="numeric" pattern="[1-9][0-9]{5}" maxlength="6" required value="${esc(storage.get("axzen.delivery.pincode", ""))}"></label><button class="primary">Save pincode</button></form>`,
        );
        break;
      case "filters":
        $("#filters").classList.toggle("open");
        button.setAttribute(
          "aria-expanded",
          $("#filters").classList.contains("open"),
        );
        break;
      case "more":
        state.shown += 24;
        render();
        break;
      case "image": {
        const p = product(id),
          images = [...new Set([p.image, ...(p.images || [])].filter(Boolean))];
        $("#gallery-main").innerHTML =
          `<img src="${esc(safeUrl(images[Number(button.dataset.index)]))}" alt="${esc(p.title)}">`;
        document
          .querySelectorAll(".gallery-thumbs button")
          .forEach((n) => n.classList.toggle("active", n === button));
        break;
      }
      case "edit-delivery":
        state.checkout.step = 1;
        render();
        break;
      case "delete-address": {
        const addresses = state.user.addresses.filter(
          (a, i) => i !== Number(button.dataset.index),
        );
        const r = await api("/api/customer/me", {
          method: "PUT",
          body: { addresses },
        });
        state.user = r.user;
        render();
        toast("Address removed");
        break;
      }
      case "follow":
        if (!state.user) {
          login();
          break;
        }
        button.disabled = true;
        await api("/api/customer/follows/" + id, { method: "POST" });
        button.textContent = "Following";
        toast("You’re following this store");
        break;
      case "invoice": {
        const win = window.open("about:blank", "_blank");
        if (!win) throw new Error("Allow popups to view your invoice.");
        win.opener = null;
        try {
          const r = await api(
            "/api/orders/" + encodeURIComponent(id) + "/invoice",
          );
          win.document.open();
          win.document.write(r.invoiceHtml);
          win.document.close();
        } catch (error) {
          win.close();
          throw error;
        }
        break;
      }
      case "cancel-order":
        showDialog(
          "Cancel this order?",
          `<p class="dialog-copy">The order will be cancelled before shipping. If you paid online, a refund request will be sent for review.</p><form id="cancel-form" class="login-form" data-id="${esc(id)}"><label class="field">Reason<textarea name="reason" required maxlength="500" placeholder="Tell us why you’re cancelling"></textarea></label><button class="primary">Confirm cancellation</button><div class="form-error" role="alert"></div></form>`,
        );
        break;
      case "retry-payment": {
        const pending = storage.get(pendingKey());
        if (pending) {
          button.disabled = true;
          await completeOrder(pending);
        }
        break;
      }
    }
  } catch (error) {
    button.disabled = false;
    toast(error.message);
  }
});
document.addEventListener("submit", async (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement)) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const submit = form.querySelector("[type=submit],button:not([type=button])");
  if (submit) submit.disabled = true;
  try {
    switch (form.id) {
      case "search-form":
        state.shown = 24;
        go("shop", { q: data.q.trim() });
        break;
      case "filter-form": {
        const r = route();
        state.shown = 24;
        go(r.page, {
          ...Object.fromEntries(r.params),
          category: data.category,
          maxPrice: data.maxPrice,
          stock: data.stock === "on",
          rating: data.rating === "on",
        });
        break;
      }
      case "location-form":
        storage.set("axzen.delivery.pincode", data.pincode);
        $("#dialog").close();
        updateChrome();
        break;
      case "phone-form": {
        if (loginBusy) break;
        loginBusy = true;
        const auth = await loadFirebase();
        verifier?.clear();
        verifier = new auth.RecaptchaVerifier(
          auth.auth,
          "axzen-customer-recaptcha",
          { size: "invisible" },
        );
        confirmation = await auth.signInWithPhoneNumber(
          auth.auth,
          "+91" + data.phone,
          verifier,
        );
        form.id = "otp-form";
        form.innerHTML =
          '<p class="dialog-copy">Enter the code sent to +91 ' +
          esc(data.phone) +
          '.</p><label class="field">One-time code<input name="otp" autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required></label><button class="primary">Verify & sign in</button><button type="button" class="text-button" data-action="login">Change number or resend code</button><div class="form-error" role="alert"></div>';
        form.querySelector("input").focus();
        break;
      }
      case "otp-form": {
        const credential = await confirmation.confirm(data.otp);
        await finishLogin(await credential.user.getIdToken());
        break;
      }
      case "profile-form": {
        const r = await api("/api/customer/me", {
          method: "PUT",
          body: { name: data.name },
        });
        state.user = r.user;
        toast("Your details are saved");
        render();
        break;
      }
      case "address-form": {
        if (!validAddress(data))
          throw new Error("Please enter a valid delivery address.");
        const r = await api("/api/customer/me", {
          method: "PUT",
          body: { addresses: [...(state.user.addresses || []), data] },
        });
        state.user = r.user;
        toast("Address saved");
        render();
        break;
      }
      case "checkout-address": {
        if (!validAddress(data))
          throw new Error("Please enter a valid delivery address.");
        state.checkout.address = data;
        await refreshQuote();
        if (data.saveAddress === "on") {
          const r = await api("/api/customer/me", {
            method: "PUT",
            body: { addresses: [...(state.user.addresses || []), data] },
          });
          state.user = r.user;
        }
        state.checkout.step = 2;
        render();
        break;
      }
      case "payment-form": {
        if (paymentBusy) break;
        paymentBusy = true;
        const c = state.checkout;
        c.method = data.paymentMethod;
        const previousTotal = c.finance.customerPaidPaise;
        await refreshQuote();
        if (previousTotal !== c.finance.customerPaidPaise) {
          render();
          throw new Error(
            "Prices have changed. Please review the updated total before placing your order.",
          );
        }
        const body = {
          items: c.items,
          paymentMethod: c.method,
          shippingAddress: c.address,
          idempotencyKey: c.idempotencyKey,
          expectedTotalPaise: c.finance.customerPaidPaise,
        };
        if (c.method === "razorpay") {
          Object.assign(body, await razorpay(c));
          storage.set(pendingKey(), {
            paymentMethod: "razorpay",
            razorpayOrderId: body.razorpayOrderId,
            razorpayPaymentId: body.razorpayPaymentId,
            razorpaySignature: body.razorpaySignature,
          });
        }
        await completeOrder(body);
        break;
      }
      case "cancel-form":
        await api(
          "/api/orders/" + encodeURIComponent(form.dataset.id) + "/cancel",
          { method: "POST", body: { reason: data.reason } },
        );
        $("#dialog").close();
        await render();
        toast("Order cancelled");
        loadCatalog();
        break;
    }
  } catch (error) {
    formError(form, error);
  } finally {
    loginBusy = false;
    paymentBusy = false;
    if (submit) submit.disabled = false;
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.id === "sort") {
    const r = route();
    go(r.page, { ...Object.fromEntries(r.params), sort: e.target.value });
  }
  if (e.target.id === "saved-address") {
    const a = state.user.addresses[Number(e.target.value)];
    if (e.target.value !== "" && a) {
      for (const [key, value] of Object.entries(a)) {
        const input = $("#checkout-address")?.elements.namedItem(key);
        if (input) input.value = value;
      }
    }
  }
  if (e.target.name === "paymentMethod" && state.checkout) {
    state.checkout.method = e.target.value;
    try {
      await refreshQuote();
      render();
    } catch (error) {
      toast(error.message);
    }
  }
});
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#main").focus();
});
window.addEventListener("hashchange", () => {
  state.shown = 24;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
});
window.addEventListener("online", () => {
  $("#connection-status").hidden = true;
  if (state.catalog === "error") loadCatalog();
});
window.addEventListener(
  "offline",
  () => ($("#connection-status").hidden = false),
);
window.addEventListener("pageshow", (e) => {
  if (e.persisted) loadCatalog();
});
// Optional Capacitor lifecycle hooks; existing native bundles must include the App plugin.
if (native) {
  document.documentElement.classList.add("ax-native-app");
  const app = window.Capacitor?.Plugins?.App;
  app?.addListener("backButton", () => {
    if ($("#dialog").open) $("#dialog").close();
    else if (route().page !== "home") go("home");
    else app.exitApp?.();
  });
  app?.addListener("appUrlOpen", (event) => {
    try {
      const u = new URL(event.url);
      if (
        u.protocol === "https:" &&
        ["axzen.in", "www.axzen.in"].includes(u.hostname)
      ) {
        if (u.searchParams.has("product"))
          go("product", { id: u.searchParams.get("product") });
        else if (u.searchParams.has("seller"))
          go("store", { id: u.searchParams.get("seller") });
      }
    } catch {}
  });
  app?.addListener("appStateChange", (s) => {
    if (s.isActive) loadCatalog();
  });
}
async function initialize() {
  state.cart = storage.get("axzen.guest.cart", []);
  if (state.token) {
    try {
      const [me, cart, wishlist] = await Promise.all([
        api("/api/customer/me"),
        api("/api/cart"),
        api("/api/wishlist"),
      ]);
      state.user = me.user;
      state.cart = cart.cart?.items || [];
      state.wishlist = (wishlist.wishlist?.products || []).map(productKey);
    } catch {
      state.token = "";
      storage.remove("axzen.customer.session");
    }
  }
  updateChrome();
  await loadCatalog();
}
initialize();
