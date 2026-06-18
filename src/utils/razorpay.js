const crypto = require("crypto");
const https = require("https");

function razorpayConfig() {
  return {
    keyId: process.env.RAZORPAY_KEY_ID || "",
    keySecret: process.env.RAZORPAY_KEY_SECRET || "",
  };
}

function createRazorpayOrder({ amountPaise, receipt, notes = {} }) {
  const { keyId, keySecret } = razorpayConfig();
  if (!keyId || !keySecret) {
    const error = new Error("Razorpay credentials are not configured.");
    error.statusCode = 503;
    throw error;
  }

  const payload = JSON.stringify({
    amount: amountPaise,
    currency: "INR",
    receipt,
    notes,
  });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: "api.razorpay.com",
        path: "/v1/orders",
        method: "POST",
        auth: `${keyId}:${keySecret}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          const parsed = body ? JSON.parse(body) : {};
          if (response.statusCode >= 400) {
            const error = new Error(parsed.error?.description || "Unable to create Razorpay order.");
            error.statusCode = response.statusCode;
            reject(error);
            return;
          }
          resolve(parsed);
        });
      }
    );

    request.on("error", reject);
    request.write(payload);
    request.end();
  });
}

function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const { keySecret } = razorpayConfig();
  if (!keySecret) return false;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  const received = String(razorpaySignature || "");
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

module.exports = {
  createRazorpayOrder,
  razorpayConfig,
  verifyRazorpaySignature,
};
