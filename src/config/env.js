require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || process.env.AUTH_SECRET || "axzen-local-development-secret",
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "axzen-c70e1",
  firebaseServiceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "",
  allowedOrigins: [
    "https://axzen.in",
    "https://www.axzen.in",
    "https://seller.axzen.in",
    "https://admin.axzen.in",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
  ],
};

module.exports = env;
