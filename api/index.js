const app = require("../src/app");
const connectDb = require("../src/config/db");
const seedDefaults = require("../src/utils/seed");

let readyPromise;

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = connectDb().then(seedDefaults);
  }

  return readyPromise;
}

module.exports = async (req, res) => {
  if (req.url === "/api" || req.url === "/api/" || req.url === "/api/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        service: "Axzen API",
        database: readyPromise ? "initializing" : "not checked",
      })
    );
    return;
  }

  try {
    await ensureReady();
    return app(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        message: error.message || "Backend startup failed.",
      })
    );
  }
};
