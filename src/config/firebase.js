const admin = require("firebase-admin");
const env = require("./env");

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

async function verifyFirebaseToken(idToken) {
  if (!idToken) {
    throw new Error("Firebase token is required.");
  }

  if (env.nodeEnv !== "production" && idToken.startsWith("local-test")) {
    return {
      uid: idToken,
      phone_number: "+919999999999",
    };
  }

  return getFirebaseAdmin().auth().verifyIdToken(idToken);
}

module.exports = {
  verifyFirebaseToken,
};
