const test = require("node:test");
const assert = require("node:assert/strict");
const { _catalogInternals } = require("./productController");

test("catalog cursor round-trips its stable sort values", () => {
  const product = { _id: "507f1f77bcf86cd799439011", updatedAt: new Date("2026-10-12T05:00:00.000Z") };
  const cursor = _catalogInternals.encodeCursor(product);
  const decoded = _catalogInternals.decodeCursor(cursor);
  assert.equal(decoded.id, product._id);
  assert.equal(decoded.updatedAt.toISOString(), product.updatedAt.toISOString());
});

test("Cloudinary product URLs receive automatic delivery transforms", () => {
  const original = "https://res.cloudinary.com/demo/image/upload/v1/axzen/product.png";
  assert.equal(
    _catalogInternals.optimizedCloudinaryUrl(original, 480),
    "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_480,dpr_auto/v1/axzen/product.png"
  );
  assert.equal(_catalogInternals.optimizedCloudinaryUrl("https://example.com/product.png", 480), "https://example.com/product.png");
});
