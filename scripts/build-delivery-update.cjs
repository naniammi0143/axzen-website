const fs = require("node:fs");
const path = require("node:path");
const AdmZip = require("adm-zip");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "release-output");
const buildDir = path.join(root, "delivery-update-build");
const versionArg = process.argv.find((arg) => arg.startsWith("--version="));
const notesArg = process.argv.find((arg) => arg.startsWith("--notes="));
const version = versionArg?.slice(10) || new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const notes = notesArg?.slice(8) || "Delivery app update";

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
    entryPoints: ["delivery/app.js"],
    bundle: true,
    format: "esm",
    target: "chrome109",
    outfile: "delivery-update-build/app.js",
    external: ["https://*"],
    minify: true,
  });
  const css = ["app.css", "login.css", "enhancements.css"]
    .map((file) => fs.readFileSync(path.join(root, "delivery", file), "utf8"))
    .join("\n");
  const zip = new AdmZip();
  zip.addFile("delivery-update.json", Buffer.from(JSON.stringify({ version, notes }, null, 2)));
  zip.addLocalFile(path.join(buildDir, "app.js"));
  zip.addFile("app.css", Buffer.from(css));
  const target = path.join(outputDir, `Axzen-Delivery-Update-${version}.zip`);
  zip.writeZip(target);
  fs.rmSync(buildDir, { recursive: true, force: true });
  console.log(target);
}

build().catch((error) => { console.error(error.message); process.exitCode = 1; });
