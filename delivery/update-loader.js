const native = globalThis.AxzenDeliveryNative;
const releaseUrl = `${native ? "https://www.axzen.in" : ""}/api/delivery-app/release`;
const cacheKey = "axzen.delivery.ota";

async function sha256(javascript, stylesheet) {
  const bytes = new TextEncoder().encode(`${javascript}\n/*AXZEN_CSS*/\n${stylesheet}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function verifiedRelease(release) {
  if (!release || typeof release.javascript !== "string" || typeof release.stylesheet !== "string" || !/^[a-f0-9]{64}$/.test(release.sha256 || "")) return null;
  return (await sha256(release.javascript, release.stylesheet)) === release.sha256 ? release : null;
}

async function fetchRelease() {
  const response = await fetch(releaseUrl, { cache: "no-cache", headers: { Accept: "application/json" } });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error("Update service unavailable.");
  const release = await verifiedRelease(await response.json());
  if (!release) throw new Error("Update verification failed.");
  if (sessionStorage.getItem("axzen.delivery.failed-release") === release.sha256) return null;
  localStorage.setItem(cacheKey, JSON.stringify(release));
  return release;
}

async function cachedRelease() {
  try { return await verifiedRelease(JSON.parse(localStorage.getItem(cacheKey) || "null")); }
  catch { return null; }
}

async function startRelease(release) {
  const style = document.createElement("style");
  style.dataset.deliveryRelease = release.version;
  style.textContent = release.stylesheet;
  document.head.append(style);
  const url = URL.createObjectURL(new Blob([release.javascript], { type: "text/javascript" }));
  try { await import(url); }
  finally { URL.revokeObjectURL(url); }
}

let release = null;
try { release = await fetchRelease(); }
catch { release = await cachedRelease(); }

if (release) {
  try { await startRelease(release); }
  catch {
    localStorage.removeItem(cacheKey);
    sessionStorage.setItem("axzen.delivery.failed-release", release.sha256);
    location.reload();
  }
} else {
  await import("./app.js");
}
