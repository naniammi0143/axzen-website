const { invalid } = require("./checkoutRules");
const activeStore = {
  isActive: true,
  status: "active",
  approvalStatus: "approved",
  kycStatus: "approved",
};
function text(value, max, label, required = false) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw invalid(`Enter a valid ${label} (maximum ${max} characters).`);
  return value.trim();
}
function httpsUrl(value, label = "URL") {
  const result = text(value, 1000, label);
  if (!result) return "";
  try {
    const url = new URL(result);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    throw invalid(`${label} must be a public HTTPS URL.`);
  }
}
function storeDetails(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw invalid("Enter valid store details.");
  const output = {};
  const fields = {
    tagline: 120,
    about: 2000,
    ownerDisplayName: 80,
    supportEmail: 160,
    supportPhone: 20,
    offerTitle: 100,
    offerSubtitle: 200,
    returnPolicy: 1200,
    dispatchNote: 200,
  };
  for (const [key, max] of Object.entries(fields))
    if (input[key] !== undefined) output[key] = text(input[key], max, key);
  for (const key of ["profileImageUrl", "offerBannerUrl", "instagramUrl"])
    if (input[key] !== undefined) output[key] = httpsUrl(input[key], key);
  if (
    output.instagramUrl &&
    !["instagram.com", "www.instagram.com"].includes(
      new URL(output.instagramUrl).hostname,
    )
  )
    throw invalid("Enter an instagram.com profile URL.");
  if (
    output.supportEmail &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(output.supportEmail)
  )
    throw invalid("Enter a valid support email.");
  if (output.supportPhone && !/^\+?[\d ()-]{7,20}$/.test(output.supportPhone))
    throw invalid("Enter a valid support phone.");
  return output;
}
function reviewInput(body) {
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)
    throw invalid("Choose a rating from 1 to 5.");
  return {
    rating: body.rating,
    title: text(body.title || "", 100, "review title"),
    body: text(body.body, 1500, "review", true),
  };
}
module.exports = { activeStore, text, httpsUrl, storeDetails, reviewInput };
