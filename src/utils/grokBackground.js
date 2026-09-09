const env = require("../config/env");

const BG_PROMPT =
  "Remove the entire background. Keep only the main product or subject with clean cutout edges on a fully transparent background. Do not add a new background, studio scene, shadow, text, watermark, or extra objects. Preserve the original product appearance, colors, and shape.";

function grokConfigured() {
  return Boolean(env.xaiApiKey);
}

function parseGrokImage(result = {}) {
  const first = result.data?.[0] || result.images?.[0] || result;
  return {
    url: first.url || result.url || "",
    b64: first.b64_json || first.b64 || result.b64_json || "",
  };
}

async function downloadBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to download cleaned image.");
  const mime = (response.headers.get("content-type") || "image/png").split(";")[0];
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimetype: mime || "image/png",
    originalName: "product-clean.png",
  };
}

async function requestGrokCutout({ dataUri, imageUrl }) {
  if (!grokConfigured()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch("https://api.x.ai/v1/images/edits", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.xaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.xaiImageModel,
        prompt: BG_PROMPT,
        image: {
          url: dataUri || imageUrl,
          type: "image_url",
        },
      }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn("Grok background removal failed:", result.error?.message || result.message || response.status);
      return null;
    }
    const parsed = parseGrokImage(result);
    if (parsed.b64) {
      return {
        buffer: Buffer.from(parsed.b64, "base64"),
        mimetype: "image/png",
        originalName: "product-clean.png",
      };
    }
    if (parsed.url) return downloadBuffer(parsed.url);
    return null;
  } catch (error) {
    console.warn("Grok background removal failed:", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function removeBackgroundFromFile(file) {
  if (!file?.buffer || !grokConfigured()) return file;
  const mime = file.mimetype || "image/png";
  const cleaned = await requestGrokCutout({
    dataUri: `data:${mime};base64,${file.buffer.toString("base64")}`,
  });
  return cleaned || file;
}

async function removeBackgroundFromUrl(imageUrl) {
  if (!imageUrl || !grokConfigured()) return null;
  return requestGrokCutout({ imageUrl });
}

module.exports = {
  grokConfigured,
  removeBackgroundFromFile,
  removeBackgroundFromUrl,
};
