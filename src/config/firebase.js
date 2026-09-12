const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const env = require("./env");

let certCache = { certs: null, expiresAt: 0 };

function sessionExpiredError() {
  const error = new Error("Session expired. Send a new OTP.");
  error.statusCode = 401;
  return error;
}

function getFirebaseAdmin() {
  if (admin.apps.length) {
    return admin;
  }

  if (env.firebaseServiceAccountJson) {
    const serviceAccount = JSON.parse(env.firebaseServiceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: env.firebaseProjectId,
    });
    return admin;
  }

  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: env.firebaseProjectId,
  });

  return admin;
}

async function getGoogleCerts() {
  if (certCache.certs && Date.now() < certCache.expiresAt) {
    return certCache.certs;
  }

  const response = await fetch("https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com");
  if (!response.ok) {
    throw sessionExpiredError();
  }

  const certs = await response.json();
  const maxAgeMatch = String(response.headers.get("cache-control") || "").match(/max-age=(\d+)/i);
  const maxAgeMs = Number(maxAgeMatch?.[1] || 3600) * 1000;
  certCache = { certs, expiresAt: Date.now() + Math.max(60_000, maxAgeMs - 60_000) };
  return certs;
}

async function verifyIdTokenWithGoogleCerts(idToken) {
  const projectId = env.firebaseProjectId;
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) {
    throw sessionExpiredError();
  }

  const certs = await getGoogleCerts();
  const pem = certs[decoded.header.kid];
  if (!pem) {
    throw sessionExpiredError();
  }

  try {
    const payload = jwt.verify(idToken, pem, {
      algorithms: ["RS256"],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    return {
      uid: payload.user_id || payload.sub,
      phone_number: payload.phone_number,
    };
  } catch (error) {
    throw sessionExpiredError();
  }
}

async function verifyFirebaseToken(idToken) {
  if (!idToken) {
    throw new Error("Firebase token is required.");
  }

  if (env.nodeEnv === "test" && process.env.ALLOW_TEST_AUTH === "true" && idToken.startsWith("local-test")) {
    return {
      uid: idToken,
      phone_number: "+919999999999",
    };
  }

  if (env.firebaseServiceAccountJson) {
    try {
      return await getFirebaseAdmin().auth().verifyIdToken(idToken);
    } catch (error) {
      void error;
    }
  }

  return verifyIdTokenWithGoogleCerts(idToken);
}

module.exports = {
  verifyFirebaseToken,
};
