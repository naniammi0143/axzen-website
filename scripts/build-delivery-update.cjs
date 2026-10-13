const fs = require("node:fs");
const path = require("node:path");
const AdmZip = require("adm-zip");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "release-output");
const buildDir = path.join(root, "delivery-update-build");
const appArg = process.argv.find((arg) => arg.startsWith("--app="));
const versionArg = process.argv.find((arg) => arg.startsWith("--version="));
const notesArg = process.argv.find((arg) => arg.startsWith("--notes="));
const appType = (appArg?.slice(6) || "delivery").toLowerCase();
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const version = versionArg?.slice(10) || `${appType}-${timestamp}`;
const notes = notesArg?.slice(8) || `${appType} app update`;
const apps = {
  delivery: { entry: "delivery/app.js", css: ["delivery/app.css", "delivery/login.css", "delivery/enhancements.css"], label: "Delivery" },
  customer: { entry: "customer/app.js", css: ["customer/storefront.css", "customer/marketplace.css"], label: "Customer" },
  seller: { entry: "portal.js", css: ["style.css", "workspace.css"], label: "Seller" },
};
const app = apps[appType];

if (!app) {
  console.error("Use --app=customer, --app=seller or --app=delivery.");
  process.exit(1);
}

if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,39}$/.test(version)) {
  console.error("Use --version=0.2.0 with letters, numbers, dots, underscores or hyphens.");
  process.exit(1);
}

async function build() {
  fs.rmSync(buildDir, { recursive: true, force: true });
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  await require("esbuild").build({
    absWorkingDir: root,
    entryPoints: [app.entry],
    bundle: true,
    format: "esm",
    target: "chrome109",
    outfile: "delivery-update-build/app.js",
    external: ["https://*"],
    minify: true,
  });
  const css = app.css
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
    .join("\n");
  const zip = new AdmZip();
  zip.addFile("delivery-update.json", Buffer.from(JSON.stringify({ appType, version, notes }, null, 2)));
  zip.addLocalFile(path.join(buildDir, "app.js"));
  zip.addFile("app.css", Buffer.from(css));
  const target = path.join(outputDir, `Axzen-${app.label}-Update-${version}.zip`);
  zip.writeZip(target);
  fs.rmSync(buildDir, { recursive: true, force: true });
  console.log(target);
}

build().catch((error) => { console.error(error.message); process.exitCode = 1; });
