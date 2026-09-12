require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || process.env.AUTH_SECRET || "axzen-local-development-secret",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "axzen-infotech",
  firebaseWebApiKey: process.env.FIREBASE_WEB_API_KEY || "AIzaSyDJcBMMp4hsEcZw94gYUybcJK6jzDTlC70",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  xaiApiKey: process.env.XAI_API_KEY || process.env.GROK_API_KEY || "",
  xaiImageModel: process.env.XAI_IMAGE_MODEL || "grok-imagine-image-2.0",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "axzen-wa-verify",
  whatsappToken: process.env.WHATSAPP_TOKEN || "",
  whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  whatsappWabaId: process.env.WHATSAPP_WABA_ID || "",
  allowedOrigins: [
    "https://axzen.in",
    "https://www.axzen.in",
    "https://seller.axzen.in",
    "https://admin.axzen.in",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "https://localhost",
    "http://localhost",
    "capacitor://localhost",
    "ionic://localhost",
  ],
};

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (env.allowedOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

env.isAllowedOrigin = isAllowedOrigin;

if (env.nodeEnv === "production" && (!(process.env.JWT_SECRET || process.env.AUTH_SECRET) || env.jwtSecret.length < 32)) {
  throw new Error("A JWT_SECRET (or AUTH_SECRET) of at least 32 characters is required in production.");
}

module.exports = env;
