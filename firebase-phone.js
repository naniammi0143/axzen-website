import { RecaptchaVerifier } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const FIREBASE_PHONE_TEST_API_KEY =
  "AVweKoj7kNodfajJbeVCohrscDb4fmgHkKrrTNDnfdgMPZLEfF7WBJJzad2GLtneCnq0kPDsTI7Zw6lWAyJ9oO-PFs_go1_JEHXMoE0U1Q1qgJ1TJ4uqT4shzX-Vk_LPzeVnv_Ud4SSrOJVt7qILgFactg";

const verifierCache = new Map();

export function isFirebasePhoneTestMode() {
  return Boolean(
    window.Capacitor?.isNativePlatform?.() ||
      document.documentElement.classList.contains("ax-native-app") ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1"
  );
}

if (isFirebasePhoneTestMode()) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = FIREBASE_PHONE_TEST_API_KEY;
}

export function prepareFirebasePhoneAuth(auth) {
  auth.languageCode = "en";

  if (isFirebasePhoneTestMode()) {
    globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = FIREBASE_PHONE_TEST_API_KEY;
    auth.settings.appVerificationDisabledForTesting = true;
    return;
  }

  import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
    .then((mod) => mod.initializeRecaptchaConfig?.(auth))
    .catch(() => {});
}

function ensureRecaptchaContainer(containerId) {
  let node = document.getElementById(containerId);
  if (node) return node;
  node = document.createElement("div");
  node.id = containerId;
  node.className = "recaptcha-box";
  document.body.appendChild(node);
  return node;
}

export async function getPhoneVerifier(auth, containerId) {
  if (verifierCache.has(containerId)) {
    return verifierCache.get(containerId);
  }

  ensureRecaptchaContainer(containerId);
  const verifier = new RecaptchaVerifier(auth, containerId, {
    size: "invisible",
  });
  verifierCache.set(containerId, verifier);

  try {
    await verifier.render();
  } catch (error) {
    verifierCache.delete(containerId);
    try {
      verifier.clear();
    } catch (clearError) {
      void clearError;
    }
    throw error;
  }

  return verifier;
}

export async function resetPhoneVerifier(containerId) {
  const verifier = verifierCache.get(containerId);
  if (!verifier) return;
  verifierCache.delete(containerId);
  try {
    verifier.clear();
  } catch (error) {
    void error;
  }
  const node = document.getElementById(containerId);
  if (node) node.innerHTML = "";
}
