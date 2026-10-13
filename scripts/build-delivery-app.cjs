const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const root = path.resolve(__dirname, "..");
const nativeRoot = path.join(root, "delivery-native");
const output = path.join(root, "delivery-www");
const android = path.join(nativeRoot, "android");
const run = (...args) => cp.execFileSync(process.execPath, args, { cwd: nativeRoot, stdio: "inherit" });

async function build() {
  const firebasePath = process.env.AXZEN_DELIVERY_FIREBASE_CONFIG;
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "index.html"),
    fs.readFileSync(path.join(root, "delivery", "index.html"), "utf8").replaceAll("/delivery/", "./"),
  );
  fs.copyFileSync(path.join(root, "delivery", "app.css"), path.join(output, "app.css"));
  fs.copyFileSync(path.join(root, "delivery", "login.css"), path.join(output, "login.css"));
  fs.copyFileSync(path.join(root, "delivery", "enhancements.css"), path.join(output, "enhancements.css"));
  await require("esbuild").build({
    absWorkingDir: root,
    entryPoints: ["delivery/native-entry.js"],
    bundle: true,
    format: "esm",
    target: "chrome109",
    outfile: "delivery-www/app.js",
    external: ["https://*"],
    define: { __AXZEN_NATIVE_PHONE__: JSON.stringify(Boolean(firebasePath)) },
    minify: true,
  });

  if (firebasePath) {
    const firebase = JSON.parse(fs.readFileSync(firebasePath, "utf8"));
    const validProject = firebase.project_info?.project_id === "axzen-infotech";
    const validPackage = firebase.client?.some((client) => client.client_info?.android_client_info?.package_name === "in.axzen.delivery");
    if (!validProject || !validPackage)
      throw new Error("Delivery Firebase config must match axzen-infotech / in.axzen.delivery.");
  }

  const cli = path.join(root, "node_modules", "@capacitor", "cli", "bin", "capacitor");
  if (!fs.existsSync(android)) run(cli, "add", "android");
  if (firebasePath) fs.copyFileSync(firebasePath, path.join(android, "app", "google-services.json"));
  else fs.rmSync(path.join(android, "app", "google-services.json"), { force: true });
  run(cli, "sync", "android");

  const manifestPath = path.join(android, "app", "src", "main", "AndroidManifest.xml");
  const manifest = fs.readFileSync(manifestPath, "utf8").replace('android:allowBackup="true"', 'android:allowBackup="false"');
  fs.writeFileSync(manifestPath, manifest);
  const gradlePath = path.join(android, "app", "build.gradle");
  fs.writeFileSync(gradlePath, fs.readFileSync(gradlePath, "utf8")
    .replace(/versionCode \d+/, "versionCode 1")
    .replace(/versionName "[^"]+"/, 'versionName "0.1-beta"'));
  fs.writeFileSync(path.join(android, "axzen-delivery-build-info.json"), JSON.stringify({
    appId: "in.axzen.delivery",
    version: "0.1-beta",
    nativePhoneLogin: Boolean(firebasePath),
    api: "https://www.axzen.in",
  }, null, 2));
  console.log("Axzen Delivery Android project ready. Native phone login configured:", Boolean(firebasePath));
}

build().catch((error) => { console.error(error.message); process.exitCode = 1; });
