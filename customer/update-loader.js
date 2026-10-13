import { startAppUpdate } from "../app-update-loader.js";

await startAppUpdate({
  appType: "customer",
  native: Boolean(globalThis.AxzenNative),
  fallback: () => import("./app.js"),
});
