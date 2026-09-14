const env = require("../config/env");

const CATALOGUE_PROMPT = `You convert seller catalogue pages into Axzen product drafts.
Return ONLY valid JSON with this shape:
{"products":[{"title":"","sku":"","category":"","mrp":0,"price":0,"unitLabel":"1 pc","stock":10,"description":""}]}
Rules:
- Extract every distinct sellable product visible in the catalogue.
- Keep titles short and shopper-friendly.
- Generate a unique SKU per product using uppercase letters/numbers only (example: CAT-001).
- category must be one of: Grocery, Fashion, Electronics, Home, Beauty, Food, Other.
- mrp and price must be numbers in INR rupees (not paise). If only one price exists, use it for both.
- unitLabel examples: 1 pc, 500 g, pack of 2.
- description should summarize size/material/usage from the catalogue when available.
- Ignore logos, page numbers, headers, and non-product text.
- If nothing useful is found, return {"products":[]}.`;

function grokConfigured() {
  return Boolean(env.xaiApiKey);
}

function roughPdfText(buffer) {
  const raw = Buffer.from(buffer).toString("latin1");
  const chunks = [];
  const patterns = [/\((?:\\.|[^\\)]){2,160}\)\s*Tj/g, /\[((?:[^\]]|\n){2,400})\]\s*TJ/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(raw))) {
      const value = match[0]
        .replace(/^\[|\]$/g, "")
        .replace(/\((?:\\.|[^\\)])*\)/g, (token) =>
          token
            .slice(1, -1)
            .replace(/\\n/g, " ")
            .replace(/\\r/g, " ")
            .replace(/\\t/g, " ")
            .replace(/\\([()\\])/g, "$1")
        )
        .replace(/[^\x20-\x7E\u00A0-\u024F]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (value.length >= 2) chunks.push(value);
    }
  }
  return [...new Set(chunks)].join(" ").replace(/\s+/g, " ").trim().slice(0, 14000);
}

function normalizeDraft(item = {}, index = 0) {
  const title = String(item.title || "").trim();
  if (!title) return null;
  const skuBase = String(item.sku || `CAT-${String(index + 1).padStart(3, "0")}`)
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
  const mrp = Math.max(Number(item.mrp) || Number(item.price) || 0, 0);
  const price = Math.max(Number(item.price) || mrp || 0, 0);
  return {
    title,
    sku: skuBase || `CAT-${String(index + 1).padStart(3, "0")}`,
    category: String(item.category || "Other").trim() || "Other",
    mrp,
    price,
    unitLabel: String(item.unitLabel || "1 pc").trim() || "1 pc",
    stock: Math.max(Number.parseInt(item.stock, 10) || 10, 0),
    description: String(item.description || "").trim(),
  };
}

function parseJsonPayload(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return [];
  try {
    const direct = JSON.parse(raw);
    return Array.isArray(direct) ? direct : direct.products || [];
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const nested = JSON.parse(raw.slice(start, end + 1));
        return Array.isArray(nested) ? nested : nested.products || [];
      } catch {
        return [];
      }
    }
    const arrayStart = raw.indexOf("[");
    const arrayEnd = raw.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(raw.slice(arrayStart, arrayEnd + 1));
      } catch {
        return [];
      }
    }
    return [];
  }
}

async function requestCatalogueDrafts(content) {
  if (!grokConfigured()) {
    throw new Error("Grok AI is not configured. Set XAI_API_KEY on the server.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.xaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.xaiChatModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: CATALOGUE_PROMPT },
          { role: "user", content },
        ],
      }),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error?.message || result.message || "Grok catalogue conversion failed.");
    }
    const text = result.choices?.[0]?.message?.content || result.message?.content || "";
    return parseJsonPayload(text)
      .map(normalizeDraft)
      .filter(Boolean)
      .slice(0, 40);
  } finally {
    clearTimeout(timer);
  }
}

async function convertCatalogueFiles(files = []) {
  const list = Array.isArray(files) ? files.filter(Boolean) : [];
  if (!list.length) throw new Error("Upload at least one catalogue image or PDF.");

  const content = [
    {
      type: "text",
      text: "Convert this seller catalogue into product drafts for Axzen. Prefer accurate prices and product names from the pages.",
    },
  ];

  for (const file of list.slice(0, 5)) {
    if (String(file.mimetype || "").startsWith("image/")) {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
        },
      });
      continue;
    }
    if (file.mimetype === "application/pdf") {
      const text = roughPdfText(file.buffer);
      content.push({
        type: "text",
        text: text
          ? `Catalogue PDF extracted text:\n${text}`
          : "Catalogue PDF had little extractable text. Infer products carefully if any product names appear.",
      });
      continue;
    }
    throw new Error("Catalogue must be PDF, JPG, or PNG.");
  }

  const products = await requestCatalogueDrafts(content);
  if (!products.length) {
    throw new Error("Grok AI could not find products in this catalogue. Try clearer page photos.");
  }
  return products;
}

module.exports = {
  grokConfigured,
  convertCatalogueFiles,
};
