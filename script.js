const sellers = [
  {
    name: "Lakshmi Homemade Foods",
    category: "Food and grocery",
    city: "Hyderabad",
    status: "Onboarding",
    tags: ["Home kitchen", "Local delivery", "Verified seller"],
  },
  {
    name: "Urban Loom Studio",
    category: "Fashion and accessories",
    city: "Vijayawada",
    status: "Store setup",
    tags: ["Handloom", "Boutique", "Seller page"],
  },
  {
    name: "Nova Gadgets Hub",
    category: "Electronics",
    city: "Bengaluru",
    status: "Delivery ready",
    tags: ["Accessories", "Warranty", "Fast dispatch"],
  },
  {
    name: "GreenNest Decor",
    category: "Home and decor",
    city: "Chennai",
    status: "Live soon",
    tags: ["Decor", "Plants", "City delivery"],
  },
  {
    name: "Daily Fresh Basket",
    category: "Grocery",
    city: "Guntur",
    status: "Pilot seller",
    tags: ["Fresh supply", "Morning slots", "Partner delivery"],
  },
];

const customerProducts = [
  {
    name: "Home Kitchen Pickle Box",
    seller: "Lakshmi Homemade Foods",
    category: "Grocery",
    price: "Rs. 349",
    rating: "4.8",
    delivery: "Today",
  },
  {
    name: "Cotton Everyday Kurta",
    seller: "Urban Loom Studio",
    category: "Fashion",
    price: "Rs. 1,299",
    rating: "4.7",
    delivery: "Tomorrow",
  },
  {
    name: "Wireless Earbuds",
    seller: "Nova Gadgets Hub",
    category: "Electronics",
    price: "Rs. 1,899",
    rating: "4.6",
    delivery: "Today",
  },
  {
    name: "Indoor Plant Starter Kit",
    seller: "GreenNest Decor",
    category: "Home",
    price: "Rs. 699",
    rating: "4.9",
    delivery: "2 days",
  },
  {
    name: "Fresh Vegetable Basket",
    seller: "Daily Fresh Basket",
    category: "Grocery",
    price: "Rs. 599",
    rating: "4.5",
    delivery: "Morning slot",
  },
  {
    name: "Handmade Desk Lamp",
    seller: "GreenNest Decor",
    category: "Home",
    price: "Rs. 849",
    rating: "4.7",
    delivery: "Tomorrow",
  },
];

const storeRail = document.querySelector("#storeRail");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const storeTitle = document.querySelector("#storeTitle");
const emptyState = document.querySelector("#emptyState");
const sellerForm = document.querySelector("#sellerForm");
const sellerFormMessage = document.querySelector("#sellerFormMessage");
const loginForms = document.querySelectorAll(".role-login-form");
const dashboardSection = document.querySelector("#dashboard");
const dashboardRole = document.querySelector("#dashboardRole");
const dashboardTitle = document.querySelector("#dashboardTitle");
const dashboardSummary = document.querySelector("#dashboardSummary");
const dashboardMetrics = document.querySelector("#dashboardMetrics");
const dashboardPanels = document.querySelector("#dashboardPanels");
const logoutButton = document.querySelector("#logoutButton");

function normalize(value) {
  return value.toLowerCase().trim();
}

function sellerMatches(seller, term) {
  return [
    seller.name,
    seller.category,
    seller.city,
    seller.status,
    ...seller.tags,
  ].some((field) => normalize(field).includes(term));
}

function getInitials(name) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderStores(items) {
  storeRail.innerHTML = items
    .map(
      (seller) => `
        <article class="store-card">
          <div class="store-card-top">
            <span class="store-avatar">${getInitials(seller.name)}</span>
            <span class="store-status">${seller.status}</span>
          </div>
          <h3>${seller.name}</h3>
          <p class="store-meta">${seller.category} | ${seller.city}</p>
          <div class="store-tags">
            ${seller.tags.map((tag) => `<span>${tag}</span>`).join("")}
          </div>
        </article>
      `
    )
    .join("");

  emptyState.style.display = items.length ? "none" : "block";
}

function applySearch(term) {
  const cleanTerm = normalize(term);
  const filteredSellers = cleanTerm
    ? sellers.filter((seller) => sellerMatches(seller, cleanTerm))
    : sellers;

  renderStores(filteredSellers);
  storeTitle.textContent = cleanTerm
    ? `Seller results for "${term.trim()}"`
    : "Featured seller pages";
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applySearch(searchInput.value);
  document.querySelector("#stores").scrollIntoView({ behavior: "smooth" });
});

searchInput.addEventListener("input", () => {
  applySearch(searchInput.value);
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    const direction = button.dataset.scroll === "right" ? 1 : -1;
    storeRail.scrollBy({
      left: direction * 360,
      behavior: "smooth",
    });
  });
});

sellerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = sellerForm.querySelector("button");
  const formData = new FormData(sellerForm);
  const payload = Object.fromEntries(formData.entries());

  sellerFormMessage.style.display = "none";
  sellerFormMessage.classList.remove("error");
  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    const response = await fetch("/api/seller-applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Unable to submit seller request.");
    }

    sellerForm.reset();
    sellerFormMessage.textContent = "Seller request saved. Axzen team will contact you soon.";
    sellerFormMessage.style.display = "block";
  } catch (error) {
    sellerFormMessage.textContent = error.message;
    sellerFormMessage.classList.add("error");
    sellerFormMessage.style.display = "block";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Request seller onboarding";
  }
});

function setLoginMessage(form, message, isError = false) {
  const messageElement = form.querySelector(".login-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("error", isError);
  messageElement.style.display = "block";
}

function renderDashboard(payload) {
  const { user, dashboard } = payload;

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

  if (user.role === "customer") {
    document.querySelector(".customer-marketplace")?.remove();
    dashboardPanels.insertAdjacentHTML("afterend", renderCustomerMarketplace());
    loadCustomerCatalog();
  }

  dashboardSection.hidden = false;
  dashboardSection.scrollIntoView({ behavior: "smooth" });
}

function renderCustomerMarketplace() {
  const categories = ["All", "Grocery", "Fashion", "Electronics", "Home", "Offers"];

  return `
    <div class="customer-marketplace">
      <div class="marketplace-toolbar">
        <div>
          <p class="eyebrow">Customer marketplace</p>
          <h3>Shop from Axzen sellers</h3>
        </div>
        <form class="marketplace-search">
          <input type="search" placeholder="Search products, stores, brands">
          <button type="button">Search</button>
        </form>
      </div>

      <div class="category-row">
        ${categories.map((category) => `<button type="button">${category}</button>`).join("")}
      </div>

      <div class="marketplace-layout">
        <aside class="customer-sidebar">
          <h3>Delivery</h3>
          <p>Deliver to Hyderabad 500001</p>
          <button type="button">Change address</button>
          <div class="mini-list">
            <span>Prime-style fast delivery</span>
            <span>Cash, UPI, cards</span>
            <span>Seller support available</span>
          </div>
        </aside>

        <div class="customer-product-grid" id="customerProductGrid">
          ${customerProducts.map(renderCustomerProductCard).join("")}
        </div>

        <aside class="cart-summary">
          <h3>Cart summary</h3>
          <p>2 items selected</p>
          <strong>Rs. 2,248</strong>
          <button type="button">Proceed to checkout</button>
          <div class="mini-list">
            <span>Order tracking</span>
            <span>Return requests</span>
            <span>Invoice download</span>
          </div>
        </aside>
      </div>
    </div>
  `;
}

function renderCustomerProductCard(product) {
  const image = product.image || product.images?.[0] || "";
  const title = product.title || product.name;
  const seller = product.sellerName || product.seller;
  const price = product.price || "Rs. 0";
  const category = product.category || "Product";
  return `
    <article class="customer-product-card">
      ${
        image
          ? `<img class="product-image product-photo" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy">`
          : `<div class="product-image">${escapeHtml(category)}</div>`
      }
      <div class="product-info">
        <span>${escapeHtml(seller)}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(product.rating || "Seller")} rating | Delivery ${escapeHtml(product.delivery || "Available")}</p>
        <strong>${escapeHtml(price)}</strong>
        <button type="button">Add to cart</button>
      </div>
    </article>
  `;
}

async function loadCustomerCatalog() {
  const grid = document.querySelector("#customerProductGrid");
  if (!grid) return;
  try {
    const response = await fetch("/api/customer/catalog");
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Unable to load products.");
    if (result.products?.length) {
      grid.innerHTML = result.products.map(renderCustomerProductCard).join("");
    }
  } catch (error) {
    console.warn(error.message || "Customer catalog unavailable.");
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

loginForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button");
    const role = form.dataset.role;
    const formData = new FormData(form);
    const payload = {
      role,
      email: formData.get("email"),
      password: formData.get("password"),
    };

    submitButton.disabled = true;
    submitButton.textContent = "Logging in...";

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Login failed.");
      }

      localStorage.setItem("axzenToken", result.token);
      localStorage.setItem("axzenRole", result.user.role);
      setLoginMessage(form, `Logged in as ${result.user.name}.`);
      await loadDashboard(result.user.role, result.token);
    } catch (error) {
      setLoginMessage(form, error.message, true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = `Login as ${role}`;
    }
  });
});

logoutButton.addEventListener("click", () => {
  localStorage.removeItem("axzenToken");
  localStorage.removeItem("axzenRole");
  dashboardSection.hidden = true;
  document.querySelector("#logins").scrollIntoView({ behavior: "smooth" });
});

const savedToken = localStorage.getItem("axzenToken");
const savedRole = localStorage.getItem("axzenRole");

if (savedToken && savedRole) {
  loadDashboard(savedRole, savedToken).catch(() => {
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
  });
}

renderStores(sellers);
