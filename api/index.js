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
  await ensureReady();
  return app(req, res);
};
