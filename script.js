const sellers = [
  {
    name: "Lakshmi Homemade Foods",
    category: "Food and grocery",
    city: "Hyderabad",
    rating: "4.8",
    delivery: "Same-day delivery",
    image: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80",
    tags: ["Pickles", "Snacks", "Home made"],
  },
  {
    name: "Urban Loom Studio",
    category: "Fashion",
    city: "Vijayawada",
    rating: "4.7",
    delivery: "2-day delivery",
    image: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&w=900&q=80",
    tags: ["Kurtas", "Sarees", "Cotton"],
  },
  {
    name: "Nova Gadgets Hub",
    category: "Electronics",
    city: "Bengaluru",
    rating: "4.6",
    delivery: "Express delivery",
    image: "https://images.unsplash.com/photo-1550009158-9ebf69173e03?auto=format&fit=crop&w=900&q=80",
    tags: ["Audio", "Mobiles", "Accessories"],
  },
  {
    name: "GreenNest Decor",
    category: "Home and decor",
    city: "Chennai",
    rating: "4.9",
    delivery: "3-day delivery",
    image: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=900&q=80",
    tags: ["Plants", "Lamps", "Decor"],
  },
  {
    name: "Daily Fresh Basket",
    category: "Grocery",
    city: "Guntur",
    rating: "4.5",
    delivery: "Morning slots",
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80",
    tags: ["Vegetables", "Fruits", "Organic"],
  },
];

const products = [
  {
    name: "Andhra Mango Pickle Combo",
    seller: "Lakshmi Homemade Foods",
    category: "Food and grocery",
    price: "Rs. 349",
    image: "https://images.unsplash.com/photo-1604908812865-048e88d10ef2?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Millet Laddu Family Pack",
    seller: "Lakshmi Homemade Foods",
    category: "Food and grocery",
    price: "Rs. 249",
    image: "https://images.unsplash.com/photo-1599599810769-bcde5a160d32?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Handloom Cotton Kurta",
    seller: "Urban Loom Studio",
    category: "Fashion",
    price: "Rs. 1,299",
    image: "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Festive Silk Saree",
    seller: "Urban Loom Studio",
    category: "Fashion",
    price: "Rs. 2,899",
    image: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Bluetooth Noise Control Headphones",
    seller: "Nova Gadgets Hub",
    category: "Electronics",
    price: "Rs. 1,999",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Fast Charging Power Bank",
    seller: "Nova Gadgets Hub",
    category: "Electronics",
    price: "Rs. 1,499",
    image: "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Ceramic Table Lamp",
    seller: "GreenNest Decor",
    category: "Home and decor",
    price: "Rs. 899",
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Indoor Plant Starter Kit",
    seller: "GreenNest Decor",
    category: "Home and decor",
    price: "Rs. 699",
    image: "https://images.unsplash.com/photo-1485955900006-10f4d324d411?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Organic Vegetable Box",
    seller: "Daily Fresh Basket",
    category: "Grocery",
    price: "Rs. 599",
    image: "https://images.unsplash.com/photo-1566385101042-1a0aa0c1268c?auto=format&fit=crop&w=900&q=80",
  },
  {
    name: "Premium Fruit Basket",
    seller: "Daily Fresh Basket",
    category: "Grocery",
    price: "Rs. 799",
    image: "https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=900&q=80",
  },
];

const storeRail = document.querySelector("#storeRail");
const productGrid = document.querySelector("#productGrid");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const clearSearch = document.querySelector("#clearSearch");
const productTitle = document.querySelector("#productTitle");
const emptyState = document.querySelector("#emptyState");

function normalize(value) {
  return value.toLowerCase().trim();
}

function sellerMatches(seller, term) {
  return [
    seller.name,
    seller.category,
    seller.city,
    seller.delivery,
    ...seller.tags,
  ].some((field) => normalize(field).includes(term));
}

function productMatches(product, term) {
  return [product.name, product.seller, product.category].some((field) =>
    normalize(field).includes(term)
  );
}

function renderStores(items) {
  storeRail.innerHTML = items
    .map(
      (seller) => `
        <article class="store-card">
          <img src="${seller.image}" alt="${seller.name} store products">
          <div class="store-body">
            <h3>${seller.name}</h3>
            <p class="store-meta">${seller.category} in ${seller.city} | ${seller.rating} rating | ${seller.delivery}</p>
            <div class="store-tags">
              ${seller.tags.map((tag) => `<span>${tag}</span>`).join("")}
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderProducts(items) {
  productGrid.innerHTML = items
    .map(
      (product) => `
        <article class="product-card">
          <img src="${product.image}" alt="${product.name}">
          <div class="product-body">
            <span class="product-badge">${product.category}</span>
            <h3>${product.name}</h3>
            <p class="product-meta">${product.seller}</p>
            <div class="product-bottom">
              <span class="price">${product.price}</span>
              <button class="add-button" type="button">Add</button>
            </div>
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
  const filteredProducts = cleanTerm
    ? products.filter((product) => productMatches(product, cleanTerm))
    : products;

  renderStores(filteredSellers.length ? filteredSellers : sellers);
  renderProducts(filteredProducts);
  productTitle.textContent = cleanTerm
    ? `Search results for "${term.trim()}"`
    : "Products from Axzen sellers";
  clearSearch.classList.toggle("active", !cleanTerm);
}

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  applySearch(searchInput.value);
  document.querySelector("#products").scrollIntoView({ behavior: "smooth" });
});

searchInput.addEventListener("input", () => {
  applySearch(searchInput.value);
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  applySearch("");
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

renderStores(sellers);
renderProducts(products);
