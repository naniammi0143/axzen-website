const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "mobile-www");
// The native repository consumes these public assets as its webDir.
// Never copy the backend, credentials, private uploads, or administration portal.
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of [
  "index.html",
  "firebase-config.js",
  "privacy.html",
  "terms.html",
  "data-deletion.html",
  "customer",
  "assets",
]) {
  fs.cpSync(path.join(root, name), path.join(output, name), {
    recursive: true,
  });
}
console.log(
  "Customer web assets prepared in mobile-www. Sync these from the existing Android project; this command does not build an APK.",
);
