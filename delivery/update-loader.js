import { startAppUpdate } from "../app-update-loader.js";

await startAppUpdate({
  appType: "delivery",
  native: Boolean(globalThis.AxzenDeliveryNative),
  fallback: () => import("./app.js"),
});
