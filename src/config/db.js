const mongoose = require("mongoose");
const env = require("./env");

async function connectDb() {
  if (!env.mongoUri) {
    throw new Error("MONGO_URI is missing. Add it to .env.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(env.mongoUri, {
    dbName: process.env.MONGODB_DB || "axzen",
  });
}

module.exports = connectDb;
