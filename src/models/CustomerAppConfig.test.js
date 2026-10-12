const test = require("node:test");
const assert = require("node:assert/strict");
const CustomerAppConfig = require("./CustomerAppConfig");

test("page ad stores the exact image URL and targeting", async () => {
  const imageUrl = "https://cdn.example.com/ads/home-banner.webp";
  const config = new CustomerAppConfig({
    pageAds: [{ id: "ad-1", title: "Home sale", imageUrl, linkUrl: "/?category=Electronics", page: "home", placement: "hero" }],
  });

  await config.validate();
  assert.equal(config.pageAds[0].imageUrl, imageUrl);
  assert.equal(config.pageAds[0].page, "home");
  assert.equal(config.pageAds[0].placement, "hero");
  assert.equal(config.pageAds[0].isActive, true);
  assert.equal(config.pageAds[0].priority, 0);
  assert.equal(config.pageAds[0].impressions, 0);
  assert.equal(config.pageAds[0].clicks, 0);
});

test("page ad rejects unsupported pages and placements", async () => {
  const config = new CustomerAppConfig({
    pageAds: [{ id: "ad-2", imageUrl: "https://cdn.example.com/ad.png", page: "checkout", placement: "popup" }],
  });
  const error = await config.validate().catch((validationError) => validationError);

  assert.ok(error);
  assert.ok(error.errors["pageAds.0.page"]);
  assert.ok(error.errors["pageAds.0.placement"]);
});
