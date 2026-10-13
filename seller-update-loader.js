import { startAppUpdate } from "./app-update-loader.js";

await startAppUpdate({
  appType: "seller",
  native: false,
  fallback: () => import("./portal.js"),
});
