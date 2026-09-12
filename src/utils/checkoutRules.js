const crypto = require("crypto");
function invalid(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}
function normalizeItems(input) {
  if (!Array.isArray(input) || !input.length || input.length > 100)
    throw invalid("Choose between 1 and 100 products.");
  const grouped = new Map();
  for (const item of input) {
    if (!item || typeof item !== "object")
      throw invalid("Choose a valid product.");
    const id = String(item.productId || item.id || "").toLowerCase();
    const quantity = Number(item.quantity);
    if (
      !/^[a-f\d]{24}$/i.test(id) ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    )
      throw invalid("Choose a valid product and a quantity from 1 to 10.");
    grouped.set(id, (grouped.get(id) || 0) + quantity);
    if (grouped.get(id) > 10)
      throw invalid("Maximum 10 units of a product per order.");
  }
  return [...grouped]
    .map(([productId, quantity]) => ({ productId, quantity }))
    .sort((a, b) => a.productId.localeCompare(b.productId));
}
function address(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw invalid("Enter a complete delivery address.");
  const out = {};
  for (const key of [
    "fullName",
    "phone",
    "address",
    "city",
    "state",
    "pincode",
  ])
    out[key] = String(input[key] || "").trim();
  if (
    out.fullName.length < 2 ||
    out.fullName.length > 100 ||
    out.address.length < 5 ||
    out.address.length > 500 ||
    !out.city ||
    !out.state ||
    out.city.length > 100 ||
    out.state.length > 100
  )
    throw invalid("Enter a complete delivery address.");
  out.phone = out.phone
    .replace(/[\s()-]/g, "")
    .replace(/^\+91/, "")
    .replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(out.phone))
    throw invalid("Enter a valid Indian mobile number.");
  if (!/^[1-9]\d{5}$/.test(out.pincode))
    throw invalid("Enter a valid six-digit Indian pincode.");
  return out;
}
function sellerAvailable(seller) {
  return (
    seller &&
    seller.isActive === true &&
    seller.status === "active" &&
    seller.approvalStatus === "approved" &&
    seller.kycStatus === "approved"
  );
}
function deliveryFees(seller, total) {
  const configured = process.env.DELIVERY_CHARGE_PAISE ?? "4000";
  const fee = Number(configured);
  if (!Number.isSafeInteger(fee) || fee < 0)
    throw invalid("Delivery configuration is unavailable.", 503);
  const free =
    seller.freeDeliveryEnabled === true &&
    total >= (Number(seller.freeDeliveryMinOrderPaise) || 0);
  return {
    deliveryCharge: free ? 0 : fee,
    sellerDeliveryCharge: free ? fee : 0,
    freeDeliveryApplied: free,
  };
}
function discounts(offers = []) {
  const map = new Map();
  for (const offer of offers) {
    const entries = [
      ...(offer.productIds || []).map((productId) => ({
        productId,
        discountPercent: offer.discountPercent,
      })),
      ...(offer.sellerEntries || []).flatMap((e) =>
        (e.productIds || []).map((productId) => ({
          productId,
          discountPercent: e.discountPercent,
        })),
      ),
    ];
    for (const e of entries)
      map.set(
        String(e.productId),
        Math.max(
          map.get(String(e.productId)) || 0,
          Math.min(90, Math.max(0, Number(e.discountPercent) || 0)),
        ),
      );
  }
  return map;
}
function fingerprint(items, shippingAddress, method) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        items: normalizeItems(items),
        shippingAddress: address(shippingAddress),
        method,
      }),
    )
    .digest("hex");
}
module.exports = {
  invalid,
  normalizeItems,
  address,
  sellerAvailable,
  deliveryFees,
  discounts,
  fingerprint,
};
