import { RecaptchaVerifier } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const verifierCache = new Map();
const verifierPending = new Map();

export function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.() || document.documentElement.classList.contains("ax-native-app"));
}

export function isLocalBrowserTestHost() {
  const host = location.hostname;
  return !isNativeApp() && (host === "localhost" || host === "127.0.0.1");
}

export function isFirebasePhoneTestMode() {
  return isLocalBrowserTestHost();
}

export function prepareFirebasePhoneAuth(auth) {
  auth.languageCode = "en";

  if (isLocalBrowserTestHost()) {
    auth.settings.appVerificationDisabledForTesting = true;
    return;
  }

  auth.settings.appVerificationDisabledForTesting = false;
  import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js")
    .then((mod) => mod.initializeRecaptchaConfig?.(auth))
    .catch(() => {});
}

function ensureRecaptchaContainer(containerId, visible) {
  let node = document.getElementById(containerId);
  if (!node) {
    node = document.createElement("div");
    node.id = containerId;
    document.body.appendChild(node);
  }
  node.classList.add("recaptcha-box");
  node.classList.toggle("recaptcha-visible", Boolean(visible));
  return node;
}

function emptyRecaptchaContainer(containerId) {
  const node = document.getElementById(containerId);
  if (node) {
    node.innerHTML = "";
    node.classList.remove("recaptcha-visible");
  }
}

function clearCachedVerifier(containerId) {
  const verifier = verifierCache.get(containerId);
  verifierCache.delete(containerId);
  if (verifier) {
    try {
      verifier.clear();
    } catch (error) {
      void error;
    }
  }
  emptyRecaptchaContainer(containerId);
}

export async function resetPhoneVerifier(containerId) {
  clearCachedVerifier(containerId);
}

export function withTimeout(promise, ms, message = "Verification timed out. Complete the check and tap Send OTP again.") {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(message);
        error.code = "timeout";
        reject(error);
      }, ms);
    }),
  ]);
}

export async function getPhoneVerifier(auth, containerId) {
  if (verifierCache.has(containerId)) {
    return verifierCache.get(containerId);
  }

  if (verifierPending.has(containerId)) {
    return verifierPending.get(containerId);
  }

  let settle;
  const create = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  verifierPending.set(containerId, create);

  (async () => {
    try {
      clearCachedVerifier(containerId);
      ensureRecaptchaContainer(containerId, false);
      const verifier = new RecaptchaVerifier(auth, containerId, {
        size: "invisible",
      });
      await verifier.render();
      verifierCache.set(containerId, verifier);
      settle.resolve(verifier);
    } catch (error) {
      const alreadyRendered = String(error?.message || "")
        .toLowerCase()
        .includes("already been rendered");
      try {
        clearCachedVerifier(containerId);
      } catch (clearError) {
        void clearError;
      }

      if (!alreadyRendered) {
        settle.reject(error);
        return;
      }

      try {
        ensureRecaptchaContainer(containerId, false);
        const retry = new RecaptchaVerifier(auth, containerId, {
          size: "invisible",
        });
        await retry.render();
        verifierCache.set(containerId, retry);
        settle.resolve(retry);
      } catch (retryError) {
        clearCachedVerifier(containerId);
        settle.reject(retryError);
      }
    } finally {
      if (verifierPending.get(containerId) === create) {
        verifierPending.delete(containerId);
      }
    }
  })();

  return create;
}
