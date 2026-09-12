export const money = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format((Number(value) || 0) / 100);
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function safeUrl(input) {
  if (!input || typeof input !== "string") return "";
  try {
    const u = new URL(input, location.origin);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}
export function productKey(product) {
  return String(product.id || product.productId || product._id || "");
}
export function reconcileCart(cart, products) {
  const map = new Map(products.map((p) => [productKey(p), p]));
  const grouped = new Map();
  for (const item of Array.isArray(cart) ? cart : []) {
    const id = productKey(item);
    if (!/^[a-f\d]{24}$/i.test(id)) continue;
    const p = map.get(id);
    const n = Number(item.quantity);
    if (!Number.isInteger(n) || n < 1) continue;
    grouped.set(id, {
      ...(p || item),
      id,
      productId: id,
      quantity: Math.min(10, (grouped.get(id)?.quantity || 0) + n),
      unavailable: !p || p.stock < 1,
    });
  }
  return [...grouped.values()];
}
export function groupedCart(cart) {
  return [...new Set(cart.map((i) => String(i.sellerId)))].map((id) => ({
    id,
    name: cart.find((i) => String(i.sellerId) === id)?.sellerName || "Store",
    items: cart.filter((i) => String(i.sellerId) === id),
  }));
}
export function filterProducts(
  products,
  {
    search = "",
    category = "",
    seller = "",
    sort = "newest",
    stock = false,
    maxPrice = "",
    rating = false,
    sale = false,
  } = {},
) {
  let rows = products.filter(
    (p) =>
      (!search ||
        `${p.title} ${p.category} ${p.sellerName}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!category ||
        String(p.category).toLowerCase() === category.toLowerCase()) &&
      (!seller || String(p.sellerId) === seller) &&
      (!stock || p.stock > 0) &&
      (!maxPrice || p.pricePaise <= Number(maxPrice) * 100) &&
      (!rating || (p.ratingCount > 0 && p.ratingAverage >= 4)) &&
      (!sale || p.mrpPaise > p.pricePaise),
  );
  return [...rows].sort((a, b) =>
    sort === "price-low"
      ? a.pricePaise - b.pricePaise
      : sort === "price-high"
        ? b.pricePaise - a.pricePaise
        : sort === "rating"
          ? (b.ratingCount ? b.ratingAverage : 0) -
            (a.ratingCount ? a.ratingAverage : 0)
          : new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  );
}
export function validAddress(a) {
  return !!(
    String(a.fullName || "").trim().length >= 2 &&
    /^[6-9]\d{9}$/.test(String(a.phone || "").replace(/^\+91/, "")) &&
    String(a.address || "").trim().length >= 5 &&
    a.city &&
    a.state &&
    /^[1-9]\d{5}$/.test(a.pincode || "")
  );
}
export function stepsFor(order) {
  const steps = [
    ["placed", "Placed"],
    ["accepted", "Confirmed"],
    ["packed", "Packed"],
    ["shipped", "Shipped"],
    ["out_for_delivery", "Out for delivery"],
    ["delivered", "Delivered"],
  ];
  const status =
    { pending: "placed", confirmed: "accepted" }[order.status] || order.status;
  const index = steps.findIndex((s) => s[0] === status);
  return steps.map(([key, label], i) => ({
    key,
    label,
    done: i <= index,
    current: i === index,
    at: (order.timeline || []).find((e) => e.status === key)?.at,
  }));
}
