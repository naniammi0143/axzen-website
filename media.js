const TEN_MIN = 10 * 60 * 1000;
const THREE_HOURS = 3 * 60 * 60 * 1000;
const STATS_KEY = "axzenMediaStats";
const LIKED_KEY = "axzenMediaLiked";
const VIEWED_KEY = "axzenMediaViewedSession";

const now = Date.now();

const SAMPLE_REELS = [
  {
    id: "reel-1",
    title: "Creator laptop unbox",
    caption: "Smart tech from verified Axzen sellers.",
    src: "assets/media/reel-1.mp4",
    poster: "assets/images/laptop.png",
    productId: "demo-laptop",
    productTitle: "Creator 15 Laptop Intel Core i7",
    pricePaise: 7499900,
    mrpPaise: 8999900,
    uploadedAt: now - 15 * 60 * 1000,
    seedViews: 100,
    seedLikes: 40,
  },
  {
    id: "reel-2",
    title: "Everyday audio",
    caption: "Wireless sound, better prices.",
    src: "assets/media/reel-2.mp4",
    poster: "assets/images/headphones.png",
    productId: "demo-headphones",
    productTitle: "Closed-Back Wireless Headphones",
    pricePaise: 1599900,
    mrpPaise: 1999900,
    uploadedAt: now - 40 * 60 * 1000,
    seedViews: 48,
    seedLikes: 22,
  },
  {
    id: "reel-3",
    title: "Wear it daily",
    caption: "Watches and gadgets picked for you.",
    src: "assets/media/reel-3.mp4",
    poster: "assets/images/smartwatch.png",
    productId: "demo-watch",
    productTitle: "Pulse Pro Smartwatch",
    pricePaise: 1299900,
    mrpPaise: 1699900,
    uploadedAt: now - 3.5 * 60 * 60 * 1000,
    seedViews: 210,
    seedLikes: 80,
  },
  {
    id: "reel-4",
    title: "Home studio setup",
    caption: "Short looks. Full-size sound.",
    src: "assets/media/reel-4.mp4",
    poster: "assets/images/speaker.png",
    productId: "demo-speaker",
    productTitle: "Studio Bluetooth Speaker",
    pricePaise: 799900,
    mrpPaise: 999900,
    uploadedAt: now - 4 * 60 * 1000,
    seedViews: 8,
    seedLikes: 6,
  },
];

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadStats() {
  const saved = readJson(STATS_KEY, {});
  SAMPLE_REELS.forEach((reel) => {
    if (!saved[reel.id]) {
      saved[reel.id] = {
        uploadedAt: reel.uploadedAt,
        realViews: reel.seedViews,
        realLikes: reel.seedLikes,
      };
    }
    if (!saved[reel.id].uploadedAt) saved[reel.id].uploadedAt = reel.uploadedAt;
  });
  return saved;
}

let stats = loadStats();
const liked = new Set(readJson(LIKED_KEY, []));
const viewedThisSession = new Set(readJson(VIEWED_KEY, []));

function saveStats() {
  writeJson(STATS_KEY, stats);
  writeJson(LIKED_KEY, [...liked]);
}

function bonusViews(uploadedAt, at = Date.now()) {
  return at - Number(uploadedAt) >= TEN_MIN ? 1000 : 0;
}

function bonusLikes(uploadedAt, at = Date.now()) {
  const elapsed = Math.max(0, at - Number(uploadedAt));
  const steps = Math.min(Math.floor(THREE_HOURS / TEN_MIN), Math.floor(elapsed / TEN_MIN));
  return steps * 20;
}

function displayViews(id) {
  const row = stats[id] || { realViews: 0, uploadedAt: Date.now() };
  return Number(row.realViews || 0) + bonusViews(row.uploadedAt);
}

function displayLikes(id) {
  const row = stats[id] || { realLikes: 0, uploadedAt: Date.now() };
  return Number(row.realLikes || 0) + bonusLikes(row.uploadedAt);
}

function formatCount(n) {
  const value = Math.max(0, Number(n) || 0);
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

function rupees(paise) {
  return `₹${Math.round(Number(paise || 0) / 100).toLocaleString("en-IN")}`;
}

function icon(paths, fill = "none") {
  return `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function heartIcon(on) {
  return icon(
    '<path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 7.6a3.8 3.8 0 0 1 7 3.2C19 15.6 12 20 12 20z"/>',
    on ? "#ff5733" : "none"
  );
}

function eyeIcon() {
  return icon(
    '<path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>'
  );
}

function reelMarkup(reel) {
  const on = liked.has(reel.id);
  return `
    <article class="ax-media-reel" data-media-reel="${reel.id}" data-media-product="${reel.productId}">
      <video src="${reel.src}" poster="${reel.poster || ""}" playsinline muted loop preload="metadata"></video>
      <div class="ax-media-scrim"></div>
      <div class="ax-media-meta">
        <h2>${reel.title}</h2>
        <p>${reel.caption}</p>
      </div>
      <div class="ax-media-actions">
        <button type="button" class="ax-media-like${on ? " is-on" : ""}" data-media-like="${reel.id}" aria-label="Like" aria-pressed="${on}">
          ${heartIcon(on)}
          <span data-media-like-count="${reel.id}">${formatCount(displayLikes(reel.id))}</span>
        </button>
        <div class="ax-media-views" aria-label="${formatCount(displayViews(reel.id))} watching">
          ${eyeIcon()}
          <span data-media-view-count="${reel.id}">${formatCount(displayViews(reel.id))}</span>
        </div>
        <button type="button" class="is-muted" data-media-mute aria-label="Mute">
          ${icon('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/>')}
        </button>
      </div>
      <div class="ax-media-product">
        <img src="${reel.poster}" alt="">
        <div>
          <strong>${reel.productTitle}</strong>
          <p><b>${rupees(reel.pricePaise)}</b>${reel.mrpPaise > reel.pricePaise ? `<del>${rupees(reel.mrpPaise)}</del>` : ""}</p>
        </div>
        <button type="button" data-add-cart="${reel.productId}">Add to cart</button>
      </div>
    </article>
  `;
}

function refreshCounts() {
  SAMPLE_REELS.forEach((reel) => {
    const likeNode = document.querySelector(`[data-media-like-count="${reel.id}"]`);
    const viewNode = document.querySelector(`[data-media-view-count="${reel.id}"]`);
    if (likeNode) likeNode.textContent = formatCount(displayLikes(reel.id));
    if (viewNode) viewNode.textContent = formatCount(displayViews(reel.id));
  });
}

function recordView(id) {
  if (viewedThisSession.has(id)) return;
  viewedThisSession.add(id);
  writeJson(VIEWED_KEY, [...viewedThisSession]);
  stats[id] = stats[id] || { uploadedAt: Date.now(), realViews: 0, realLikes: 0 };
  stats[id].realViews = Number(stats[id].realViews || 0) + 1;
  saveStats();
  refreshCounts();
}

function ensureMediaOverlay() {
  let overlay = document.querySelector("[data-customer-media]");
  if (overlay) return overlay;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<section class="ax-media-overlay" data-customer-media hidden>
      <div class="ax-media-screen">
        <div class="ax-media-top">
          <div class="ax-media-brand">
            <strong>Media</strong>
            <span>Short videos</span>
          </div>
          <button class="ax-media-close" type="button" data-media-close aria-label="Close Media">
            ${icon('<path d="M6 6l12 12M18 6 6 18"/>')}
          </button>
        </div>
        <div class="ax-media-feed" data-media-feed>
          ${SAMPLE_REELS.map(reelMarkup).join("")}
        </div>
      </div>
    </section>`
  );
  overlay = document.querySelector("[data-customer-media]");
  bindMediaOverlay(overlay);
  return overlay;
}

function playVisibleReel(feed) {
  const reels = [...feed.querySelectorAll(".ax-media-reel")];
  const mid = feed.getBoundingClientRect().top + feed.clientHeight / 2;
  let active = reels[0];
  let best = Number.POSITIVE_INFINITY;
  reels.forEach((reel) => {
    const box = reel.getBoundingClientRect();
    const dist = Math.abs(box.top + box.height / 2 - mid);
    if (dist < best) {
      best = dist;
      active = reel;
    }
  });
  reels.forEach((reel) => {
    const video = reel.querySelector("video");
    if (!video) return;
    if (reel === active) {
      video.play().catch(() => {});
      recordView(reel.dataset.mediaReel);
    } else {
      video.pause();
    }
  });
}

function bindMediaOverlay(overlay) {
  const feed = overlay.querySelector("[data-media-feed]");
  overlay.addEventListener("click", (event) => {
    const close = event.target.closest("[data-media-close]");
    if (close) {
      closeMediaFeed({ clearHash: true });
      return;
    }
    const like = event.target.closest("[data-media-like]");
    if (like) {
      const id = like.dataset.mediaLike;
      stats[id] = stats[id] || { uploadedAt: Date.now(), realViews: 0, realLikes: 0 };
      if (liked.has(id)) {
        liked.delete(id);
        stats[id].realLikes = Math.max(0, Number(stats[id].realLikes || 0) - 1);
      } else {
        liked.add(id);
        stats[id].realLikes = Number(stats[id].realLikes || 0) + 1;
      }
      saveStats();
      like.classList.toggle("is-on", liked.has(id));
      like.setAttribute("aria-pressed", liked.has(id) ? "true" : "false");
      const svg = like.querySelector("svg");
      if (svg) svg.setAttribute("fill", liked.has(id) ? "#ff5733" : "none");
      refreshCounts();
      return;
    }
    const mute = event.target.closest("[data-media-mute]");
    if (mute) {
      const video = mute.closest(".ax-media-reel")?.querySelector("video");
      if (!video) return;
      video.muted = !video.muted;
      mute.classList.toggle("is-muted", video.muted);
    }
  });
  feed.addEventListener("scroll", () => playVisibleReel(feed), { passive: true });
}

let tickTimer = 0;

export function openMediaFeed(options = {}) {
  if (!document.body.classList.contains("storefront-page")) return;
  const overlay = ensureMediaOverlay();
  overlay.hidden = false;
  document.body.classList.add("ax-media-open");
  const feed = overlay.querySelector("[data-media-feed]");
  window.requestAnimationFrame(() => playVisibleReel(feed));
  refreshCounts();
  window.clearInterval(tickTimer);
  tickTimer = window.setInterval(refreshCounts, 15000);
  if (options.push !== false && location.hash !== "#media") {
    history.pushState({ customerRoute: "media", value: "1" }, "", `${location.pathname}${location.search}#media`);
  }
}

export function closeMediaFeed(options = {}) {
  const overlay = document.querySelector("[data-customer-media]");
  if (!overlay || overlay.hidden) return false;
  overlay.querySelectorAll("video").forEach((video) => {
    video.pause();
    video.muted = true;
  });
  overlay.hidden = true;
  document.body.classList.remove("ax-media-open");
  window.clearInterval(tickTimer);
  if (options.clearHash && location.hash === "#media") {
    history.replaceState({ customerRoute: "home", value: "" }, "", `${location.pathname}${location.search}`);
  }
  return true;
}

export function isMediaOpen() {
  const overlay = document.querySelector("[data-customer-media]");
  return Boolean(overlay && !overlay.hidden);
}
