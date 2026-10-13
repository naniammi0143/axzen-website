const { createHash } = require("node:crypto");
const AdmZip = require("adm-zip");
const DeliveryAppRelease = require("../models/DeliveryAppRelease");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { invalid } = require("../utils/checkoutRules");

const ALLOWED_FILES = new Set(["delivery-update.json", "app.js", "app.css"]);
const MAX_ASSET_BYTES = 1536 * 1024;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

function digest(javascript, stylesheet) {
  return createHash("sha256").update(`${javascript}\n/*AXZEN_CSS*/\n${stylesheet}`).digest("hex");
}

function readPackage(buffer) {
  let archive;
  try { archive = new AdmZip(buffer); }
  catch { throw invalid("The delivery update ZIP is invalid."); }
  const allEntries = archive.getEntries();
  if (allEntries.length > 6) throw invalid("The update ZIP contains too many entries.");
  const entries = allEntries.filter((entry) => !entry.isDirectory);
  if (!entries.length || entries.length > ALLOWED_FILES.size) throw invalid("The ZIP must contain only delivery-update.json, app.js and app.css.");
  const assets = {};
  let totalBytes = 0;
  for (const entry of entries) {
    const name = entry.entryName.replaceAll("\\", "/");
    if (name.includes("/") || !ALLOWED_FILES.has(name) || entry.header?.encrypted)
      throw invalid("The update ZIP contains an unsupported or unsafe file.");
    if (assets[name]) throw invalid(`Duplicate ${name} in update ZIP.`);
    const declaredSize = Number(entry.header?.size) || 0;
    if (declaredSize > MAX_ASSET_BYTES) throw invalid(`${name} is too large.`);
    let data;
    try { data = entry.getData(); }
    catch { throw invalid(`Unable to read ${name} from the update ZIP.`); }
    totalBytes += data.length;
    if (data.length > MAX_ASSET_BYTES || totalBytes > MAX_TOTAL_BYTES) throw invalid("The uncompressed update is too large.");
    assets[name] = data.toString("utf8");
  }
  if (!assets["delivery-update.json"] || !assets["app.js"] || !assets["app.css"])
    throw invalid("The ZIP must contain delivery-update.json, app.js and app.css.");
  let manifest;
  try { manifest = JSON.parse(assets["delivery-update.json"]); }
  catch { throw invalid("delivery-update.json is not valid JSON."); }
  const version = String(manifest.version || "").trim();
  const notes = String(manifest.notes || "").trim();
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$/.test(version)) throw invalid("Use a valid update version, for example 0.2.0.");
  if (notes.length > 500) throw invalid("Update notes must be 500 characters or shorter.");
  if (!assets["app.js"].trim() || !assets["app.css"].trim()) throw invalid("Update JavaScript and CSS cannot be empty.");
  return { version, notes, javascript: assets["app.js"], stylesheet: assets["app.css"], totalBytes };
}

const uploadRelease = asyncHandler(async (req, res) => {
  const file = req.files?.update;
  if (!file || Array.isArray(file) || !file.originalName.toLowerCase().endsWith(".zip")) throw invalid("Choose one delivery update ZIP file.");
  const parsed = readPackage(file.buffer);
  if (await DeliveryAppRelease.exists({ version: parsed.version })) throw invalid("That update version already exists.", 409);
  const sha256 = digest(parsed.javascript, parsed.stylesheet);
  const release = await DeliveryAppRelease.create({
    version: parsed.version,
    notes: parsed.notes,
    javascript: parsed.javascript,
    stylesheet: parsed.stylesheet,
    sha256,
    sizeBytes: parsed.totalBytes,
    active: true,
    createdBy: req.user.id,
  });
  await DeliveryAppRelease.updateMany({ _id: { $ne: release._id }, active: true }, { $set: { active: false } });
  await AuditLog.create({ actorId: req.user.id, actorRole: req.user.role, action: "delivery_app.release", entityType: "delivery_app_release", entityId: String(release._id), metadata: { version: release.version, sha256 } });
  success(res, { release: { id: release._id, version: release.version, notes: release.notes, sha256, sizeBytes: release.sizeBytes, active: true, createdAt: release.createdAt } }, 201);
});

const listReleases = asyncHandler(async (_req, res) => {
  const releases = await DeliveryAppRelease.find().select("version notes sha256 sizeBytes active createdAt createdBy").sort({ createdAt: -1 }).limit(30).lean();
  success(res, { releases });
});

const activateRelease = asyncHandler(async (req, res) => {
  const release = await DeliveryAppRelease.findById(req.params.id).select("version sha256");
  if (!release) throw invalid("Delivery app release not found.", 404);
  await DeliveryAppRelease.updateMany({ active: true }, { $set: { active: false } });
  release.active = true;
  await release.save();
  await AuditLog.create({ actorId: req.user.id, actorRole: req.user.role, action: "delivery_app.rollback", entityType: "delivery_app_release", entityId: String(release._id), metadata: { version: release.version } });
  success(res, { release: { id: release._id, version: release.version, active: true } });
});

const currentRelease = asyncHandler(async (req, res) => {
  const release = await DeliveryAppRelease.findOne({ active: true }).select("+javascript +stylesheet version notes sha256 sizeBytes createdAt").lean();
  if (!release) return res.status(204).end();
  const etag = `\"${release.sha256}\"`;
  if (req.headers["if-none-match"] === etag) return res.status(304).end();
  res.setHeader("ETag", etag);
  res.setHeader("Cache-Control", "no-cache, private");
  success(res, { version: release.version, notes: release.notes, sha256: release.sha256, javascript: release.javascript, stylesheet: release.stylesheet, publishedAt: release.createdAt });
});

module.exports = { activateRelease, currentRelease, listReleases, uploadRelease };
