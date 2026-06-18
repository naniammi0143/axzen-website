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

  if (env.firebaseServiceAccountJson) {
    return getFirebaseAdmin().auth().verifyIdToken(idToken);
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.firebaseWebApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idToken }),
    }
  );
  const result = await response.json();

  if (!response.ok || !result.users?.length) {
    throw new Error(result.error?.message || "Firebase token verification failed.");
  }

  const user = result.users[0];
  return {
    uid: user.localId,
    phone_number: user.phoneNumber,
  };
}

module.exports = {
  verifyFirebaseToken,
};
