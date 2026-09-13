const app = require("../src/app");
const connectDb = require("../src/config/db");


let readyPromise;

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = connectDb().catch(error => { readyPromise = null; throw error; });
  }

  return readyPromise;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/api/not-found") { res.statusCode=404;res.end("Not found");return; }
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
        message: "The service is temporarily unavailable. Please try again.",
      })
    );
  }
};
