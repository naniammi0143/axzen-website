const test = require("node:test");
const assert = require("node:assert/strict");
const { _shiprocketInternals } = require("../src/utils/shiprocket");

test("Shiprocket order payload uses API pickup code, complete address, money and parcel fields", () => {
  const payload = _shiprocketInternals.orderPayload({
    order: {
      orderId: "AXZ-1001",
      createdAt: "2026-10-13T08:00:00.000Z",
      paymentMethod: "cod",
      deliveryCharge: 4900,
      productTotal: 129900,
      packageDetails: { length: 20, breadth: 15, height: 8, weight: 0.75 },
      items: [{ title: "Test product", productId: "product-1", sku: "SKU-1", quantity: 2, pricePaise: 64950 }],
    },
    seller: { shippingPickupLocation: "Axzen Hyderabad", email: "seller@example.com" },
    customerAddress: { fullName: "Customer", address: "1 Main Road", city: "Hyderabad", state: "Telangana", pincode: "500001", phone: "9999999999" },
  });
  assert.equal(payload.pickup_location, "Axzen Hyderabad");
  assert.equal(payload.payment_method, "COD");
  assert.equal(payload.sub_total, "1299.00");
  assert.equal(payload.shipping_charges, "49.00");
  assert.equal(payload.weight, 0.75);
  assert.deepEqual(payload.order_items[0], { name: "Test product", sku: "SKU-1", units: 2, selling_price: "649.50", discount: "0", tax: "0", hsn: "" });
});

test("Shiprocket serviceability query encodes every value", () => {
  const path = _shiprocketInternals.queryPath("/serviceability", { pickup_postcode: "500001", delivery_postcode: "560001", cod: 1, mode: "Surface" });
  assert.equal(path, "/serviceability?pickup_postcode=500001&delivery_postcode=560001&cod=1&mode=Surface");
});
