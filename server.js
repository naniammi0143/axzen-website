const http = require("http");
const app = require("./src/app");
const connectDb = require("./src/config/db");
const env = require("./src/config/env");
const seedDefaults = require("./src/utils/seed");
const { initializeRealtime } = require("./src/utils/realtime");

async function startServer() {
  await connectDb();
  if (process.env.SEED_DEMO === "true" && process.env.NODE_ENV !== "production") await seedDefaults();
  const server = http.createServer(app);
  initializeRealtime(server);

  server.listen(env.port, () => {
    console.log(`Axzen server running at http://localhost:${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Axzen server:", error.message);
  process.exit(1);
});
