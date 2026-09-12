const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "..");
const ids = ["a".repeat(24), "b".repeat(24), "c".repeat(24)];
const products = [
  {
    id: ids[0],
    sellerId: "d".repeat(24),
    sellerName: "First Store",
    title: "Fresh Rice",
    category: "food",
    stock: 3,
    pricePaise: 12000,
    mrpPaise: 15000,
    ratingAverage: 4.8,
    ratingCount: 0,
    codEnabled: true,
    onlinePaymentEnabled: false,
  },
  {
    id: ids[1],
    sellerId: "e".repeat(24),
    sellerName: "Second Store",
    title: "Cold Pressed Oil",
    category: "Food",
    stock: 6,
    pricePaise: 35000,
    mrpPaise: 35000,
    ratingAverage: 4.7,
    ratingCount: 12,
    codEnabled: true,
    onlinePaymentEnabled: false,
  },
  {
    id: ids[2],
    sellerId: "d".repeat(24),
    sellerName: "First Store",
    title: "<img src=x onerror=alert(1)>",
    category: "Home",
    stock: 0,
    pricePaise: 5000,
    mrpPaise: 5000,
    ratingCount: 0,
    codEnabled: true,
  },
];
async function tick() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}
async function setup({ fail = false, signedIn = false } = {}) {
  const dom = new JSDOM(
    fs.readFileSync(path.join(root, "index.html"), "utf8"),
    { url: "https://www.axzen.in/", runScripts: "outside-only" },
  );
  const w = dom.window;
  w.scrollTo = () => {};
  w.AbortSignal = AbortSignal;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const calls = [];
  if (signedIn)
    w.localStorage.setItem(
      "axzen.customer.session",
      JSON.stringify({ token: "fixture-only-token" }),
    );
  w.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body, method: options.method });
    let data = {};
    if (url === "/api/customer/catalog") {
      if (fail) throw new Error("Offline fixture");
      data = { products };
    } else if (url === "/api/customer/app-config") data = { config: {} };
    else if (url === "/api/customer/me")
      data = {
        user: {
          id: "f".repeat(24),
          name: body?.name || "Test Customer",
          phone: "+919000000001",
          addresses: body?.addresses || [],
        },
      };
    else if (url === "/api/cart") data = { cart: { items: [] } };
    else if (url === "/api/wishlist") data = { wishlist: { products: [] } };
    else if (url === "/api/orders/quote") {
      const selected = body.items.map((i) => ({
        ...products.find((p) => p.id === i.productId),
        productId: i.productId,
        quantity: i.quantity,
      }));
      const total = selected.reduce((n, i) => n + i.pricePaise * i.quantity, 0);
      data = {
        quote: {
          items: selected,
          finance: {
            productTotalPaise: total,
            deliveryChargePaise: 4000,
            customerPaidPaise: total + 4000,
          },
          sellerId: selected[0].sellerId,
          sellerName: selected[0].sellerName,
          codEnabled: true,
          onlinePaymentEnabled: false,
        },
      };
    } else if (url.startsWith("/api/orders")) data = { orders: [], items: [] };
    return { ok: true, status: 200, json: async () => data };
  };
  const domain = fs
    .readFileSync(path.join(root, "customer/domain.js"), "utf8")
    .replace(/export /g, "");
  const app = fs
    .readFileSync(path.join(root, "customer/app.js"), "utf8")
    .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];/g, "");
  w.eval(domain + "\nconst esc=escape; const firebaseConfig={};\n" + app);
  await tick();
  return {
    dom,
    w,
    calls,
    close: () => dom.window.close(),
    go: async (hash) => {
      w.location.hash = hash;
      w.dispatchEvent(new w.HashChangeEvent("hashchange"));
      await tick();
    },
  };
}
test("catalog uses real data, normalizes categories and hides invented ratings", async () => {
  const app = await setup();
  try {
    const doc = app.w.document;
    assert.equal(
      doc.querySelectorAll('#category-nav a[href*="category=Food"]').length,
      1,
    );
    assert.match(
      doc.querySelector("#main").textContent,
      /New · No reviews yet/,
    );
    assert.ok(!doc.querySelector("#main").textContent.includes("4.8"));
    assert.equal(doc.querySelectorAll("img[onerror]").length, 0);
    assert.equal(doc.querySelector(".stars span").style.width, "94%");
  } finally {
    app.close();
  }
});
test("search filters actual products and clears safely to an empty result", async () => {
  const app = await setup();
  try {
    await app.go("#shop?q=rice");
    assert.equal(app.w.document.querySelectorAll(".product-card").length, 1);
    await app.go("#shop?q=unavailablexyz");
    assert.equal(app.w.document.querySelectorAll(".product-card").length, 0);
    assert.match(
      app.w.document.querySelector("#main").textContent,
      /No|couldn|Try/i,
    );
  } finally {
    app.close();
  }
});
test("cart groups stores and enforces available stock from add buttons", async () => {
  const app = await setup();
  try {
    for (let i = 0; i < 4; i++) {
      app.w.document
        .querySelector(`[data-action="add"][data-id="${ids[0]}"]`)
        .click();
      await tick();
    }
    app.w.document
      .querySelector(`[data-action="add"][data-id="${ids[1]}"]`)
      .click();
    await tick();
    const cart = JSON.parse(app.w.localStorage.getItem("axzen.guest.cart"));
    assert.equal(cart.find((i) => i.id === ids[0]).quantity, 3);
    await app.go("#cart");
    assert.equal(
      app.w.document.querySelectorAll('[data-action="checkout"]').length,
      2,
    );
    assert.match(
      app.w.document.querySelector("#main").textContent,
      /First Store/,
    );
    assert.match(
      app.w.document.querySelector("#main").textContent,
      /Second Store/,
    );
  } finally {
    app.close();
  }
});
test("guest wishlist persists and can be removed", async () => {
  const app = await setup();
  try {
    app.w.document
      .querySelector(`[data-action="wishlist"][data-id="${ids[0]}"]`)
      .click();
    await tick();
    await app.go("#wishlist");
    assert.equal(app.w.document.querySelectorAll(".product-card").length, 1);
    app.w.document.querySelector('[data-action="wishlist"]').click();
    await tick();
    assert.equal(app.w.document.querySelectorAll(".product-card").length, 0);
  } finally {
    app.close();
  }
});
test("catalog network failure offers retry without fabricating products", async () => {
  const app = await setup({ fail: true });
  try {
    assert.equal(app.w.document.querySelectorAll(".product-card").length, 0);
    assert.ok(app.w.document.querySelector('[data-action="retry"]'));
    await app.go("#shop");
    assert.ok(app.w.document.querySelector('[data-action="retry"]'));
  } finally {
    app.close();
  }
});
test("guest checkout asks for sign-in without submitting an order", async () => {
  const app = await setup();
  try {
    app.w.document.querySelector('[data-action="add"]').click();
    await tick();
    await app.go("#cart");
    app.w.document.querySelector('[data-action="checkout"]').click();
    await tick();
    assert.equal(app.w.document.querySelector("#dialog").open, true);
    assert.equal(
      app.calls.filter((c) => c.url === "/api/customer/orders").length,
      0,
    );
  } finally {
    app.close();
  }
});
test("signed-in checkout requests a server quote and shows the delivery form", async () => {
  const app = await setup({ signedIn: true });
  try {
    app.w.document.querySelector('[data-action="add"]').click();
    await tick();
    await app.go("#cart");
    app.w.document.querySelector('[data-action="checkout"]').click();
    await tick();
    app.w.dispatchEvent(new app.w.HashChangeEvent("hashchange"));
    await tick();
    assert.ok(app.w.document.querySelector("#checkout-address"));
    const call = app.calls.find((c) => c.url === "/api/orders/quote");
    assert.equal(call.body.items[0].productId, ids[0]);
    assert.equal(call.body.paymentMethod, "cod");
  } finally {
    app.close();
  }
});
