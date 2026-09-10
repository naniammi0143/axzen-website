(function bootCustomerChrome() {
  const native = document.documentElement.classList.contains("ax-native-app");
  if (!native) {
    document.querySelectorAll(".ax-app-nav, .ax-ios-statusbar").forEach((node) => {
      node.hidden = true;
      node.setAttribute("aria-hidden", "true");
      node.style.setProperty("display", "none", "important");
    });
  }

  document.addEventListener("click", (event) => {
    if (window.__axzenPortalReady || typeof window.openCustomerProductModal === "function") return;
    const card = event.target.closest("[data-product-card]");
    if (!card) return;
    if (event.target.closest("[data-add-cart], [data-open-seller], .product-wishlist")) return;
    const products = Array.isArray(window.__axzenBootCatalog) ? window.__axzenBootCatalog : [];
    const product = products.find((item) => String(item.id) === String(card.dataset.productCard));
    if (!product) return;
    event.preventDefault();
    const existing = document.querySelector("[data-customer-product-modal]");
    if (existing) existing.remove();
    const title = product.title || "Product";
    const image = product.image || product.images?.[0] || "";
    const price = product.price || "";
    document.body.insertAdjacentHTML(
      "beforeend",
      `<aside class="customer-product-modal ax-product-sheet is-open" data-customer-product-modal>
        <article>
          <button type="button" data-close-customer-product aria-label="Close">Close</button>
          <div class="customer-product-gallery">${
            image
              ? `<img src="${String(image).replace(/"/g, "&quot;")}" alt="">`
              : `<div class="commerce-product-image">${String(product.category || "Product")}</div>`
          }</div>
          <div class="customer-product-copy">
            <h2>${String(title).replace(/</g, "&lt;")}</h2>
            <strong>${String(price).replace(/</g, "&lt;")}</strong>
          </div>
        </article>
      </aside>`
    );
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-close-customer-product]") && event.target !== document.querySelector("[data-customer-product-modal]")) {
      return;
    }
    if (window.__axzenPortalReady) return;
    document.querySelector("[data-customer-product-modal]")?.remove();
  });
})();

(async function bootCustomerCatalog() {
  const grid = document.querySelector("[data-customer-main] .commerce-products, .commerce-products");
  if (!grid) return;

  const urls = ["/api/customer/catalog"];
  if (!/axzen\.in$/i.test(location.hostname)) {
    urls.push("https://www.axzen.in/api/customer/catalog");
  }

  const escape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  for (const url of urls) {
    try {
      const response = await fetch(url);
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.products) || !result.products.length) continue;
      window.__axzenBootCatalog = result.products;
      if (grid.querySelector("[data-product-card]")) return;
      grid.innerHTML = result.products
        .slice(0, 8)
        .map((product) => {
          const title = product.title || "Product";
          const image = product.image || product.images?.[0] || "";
          const price = product.price || "";
          return `<article class="commerce-product ax-product-card" data-product-card="${escape(product.id)}" style="cursor:pointer">
            <div class="commerce-product-media">${image ? `<img class="commerce-product-image commerce-product-photo" src="${escape(image)}" alt="${escape(title)}">` : `<div class="commerce-product-image">${escape(product.category || "Product")}</div>`}</div>
            <div class="commerce-product-body">
              <p class="commerce-product-category">${escape(product.category || "")}</p>
              <h3>${escape(title)}</h3>
              <div class="customer-price-row"><strong>${escape(price)}</strong></div>
            </div>
          </article>`;
        })
        .join("");
      return;
    } catch {
      // Try the next catalog origin.
    }
  }
})();
