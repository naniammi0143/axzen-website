const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
async function tick() {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
}
async function admin(user) {
  const dom = new JSDOM(fs.readFileSync("admin.html", "utf8"), {
      url: "https://admin.axzen.in",
      runScripts: "outside-only",
    }),
    w = dom.window,
    calls = [];
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.fetch = async (url, options = {}) => {
    calls.push({ url, ...options });
    let data = { items: [], total: 0, page: 1 };
    if (url.includes("customer-app"))
      data = {
        config: {
          heroTitle: "Real headline",
          heroSubtitle: "Store introduction",
          heroCta: "Shop now",
          spotlightTitle: "Our stores",
          supportEmail: "help@example.com",
        },
        sellers: [
          {
            _id: "a".repeat(24),
            businessName: "One Store",
            isActive: true,
            status: "active",
          },
        ],
        products: [],
      };
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => data,
    };
  };
  w.eval(fs.readFileSync("admin-panel.js", "utf8"));
  w.AxzenAdminPanel.init({ token: "fixture", user });
  await tick();
  return { w, calls, close: () => w.close() };
}
test("admin navigation respects persisted permissions and initializes an allowed view", async () => {
  const a = await admin({
    role: "support",
    admin: {
      displayRole: "Customer App Executive",
      permissions: ["customerapp"],
    },
  });
  try {
    const d = a.w.document;
    assert.equal(
      d.querySelector('[data-admin-view="customerapp"]').hidden,
      false,
    );
    assert.equal(d.querySelector('[data-admin-view="reviews"]').hidden, false);
    assert.equal(d.querySelector('[data-admin-view="orders"]').hidden, true);
    assert.equal(d.querySelector('[data-admin-view="employees"]').hidden, true);
    assert.ok(a.calls.some((c) => c.url.includes("/customer-app")));
    assert.ok(d.querySelector("[data-customer-controls]"));
  } finally {
    a.close();
  }
});
test("customer storefront controls submit real values and explicit section toggles", async () => {
  const a = await admin({
    role: "support",
    admin: { permissions: ["customerapp"] },
  });
  try {
    const f = a.w.document.querySelector("[data-customer-controls]");
    f.elements.heroTitle.value = "New store stories";
    f.elements.showOffers.checked = false;
    f.querySelector('[name="recommendedSellerIds"]').checked = true;
    f.dispatchEvent(
      new a.w.Event("submit", { bubbles: true, cancelable: true }),
    );
    await tick();
    const call = a.calls.find((c) => c.method === "PATCH");
    assert.ok(call);
    const body = JSON.parse(call.body);
    assert.equal(body.heroTitle, "New store stories");
    assert.equal(body.showOffers, false);
    assert.deepEqual(body.recommendedSellerIds, ["a".repeat(24)]);
  } finally {
    a.close();
  }
});
test("seller shipment panel uses real items and keeps booking errors visible", () => {
  const dom = new JSDOM(
      '<div id="sellerShipments"></div><div id="sellerReturns"></div>',
      { url: "https://seller.axzen.in", runScripts: "outside-only" },
    ),
    w = dom.window;
  const domain = fs
    .readFileSync("customer/domain.js", "utf8")
    .replace(/export /g, "");
  const module = fs
    .readFileSync("seller-workspace.js", "utf8")
    .replace(/import .*?;\n/, "")
    .replace(/export /g, "");
  w.eval(domain + "\nconst esc=escape;\n" + module);
  try {
    w.fulfilmentPanels([
      {
        _id: "one",
        orderId: "AX-1",
        status: "packed",
        items: [
          { title: "Rice", quantity: 2 },
          { title: "Oil", quantity: 1 },
        ],
        shipmentBookingState: "needs_review",
        shipmentBookingError: "Check provider before retrying",
        shippingAddress: { fullName: "Customer" },
      },
    ]);
    const text = w.document.querySelector("#sellerShipments").textContent;
    assert.match(text, /Rice × 2/);
    assert.match(text, /Oil × 1/);
    assert.match(text, /Check provider before retrying/);
    assert.equal(w.document.querySelector("[data-parcel-booking]"), null);
  } finally {
    w.close();
  }
});
