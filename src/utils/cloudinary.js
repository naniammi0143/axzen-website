const crypto = require("crypto");

function getConfig() {
  const cloudinaryUrl = process.env.CLOUDINARY_URL || "";
  const match = cloudinaryUrl.match(/^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/);

  if (match) {
    return {
      cloudName: match[3],
      apiKey: match[1],
      apiSecret: match[2],
    };
  }

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

function assertConfigured() {
  const config = getConfig();
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new Error("Cloudinary keys are not configured.");
  }
  return config;
}

function signParams(params, apiSecret) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

async function uploadImageBuffer(file, options = {}) {
  const config = assertConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    folder: options.folder || "axzen/products",
    timestamp,
  };
  const signature = signParams(params, config.apiSecret);
  const form = new FormData();

  form.append("file", new Blob([file.buffer], { type: file.mimetype }), file.originalName || "product-image.jpg");
  form.append("api_key", config.apiKey);
  form.append("folder", params.folder);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || "Cloudinary image upload failed.");
  }

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
}

async function uploadProductImages(files, options = {}) {
  const imageFiles = files.filter(Boolean);
  const uploaded = [];

  for (const file of imageFiles) {
    uploaded.push(await uploadImageBuffer(file, options));
  }

  return uploaded;
}

module.exports = {
  uploadProductImages,
};
