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

const storeRail = document.querySelector("#storeRail");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const storeTitle = document.querySelector("#storeTitle");
const emptyState = document.querySelector("#emptyState");
const sellerForm = document.querySelector("#sellerForm");
const sellerFormMessage = document.querySelector("#sellerFormMessage");

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

renderStores(sellers);
