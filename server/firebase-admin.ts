import * as admin from "firebase-admin";

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!projectId) {
    console.warn(
      "FIREBASE_PROJECT_ID not set. Firebase Admin SDK will not be initialized.",
    );
    return admin;
  }

  if (!privateKey || !clientEmail) {
    console.warn(
      "FIREBASE_PRIVATE_KEY or FIREBASE_CLIENT_EMAIL not set. ID token verification may fail.",
    );
    try {
      admin.initializeApp({ projectId });
      console.log(
        "Firebase Admin SDK initialized with project ID only (limited functionality)",
      );
    } catch (error) {
      console.error(
        "Failed to initialize Firebase Admin SDK:",
        error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
      );
    }
    return admin;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKey: privateKey.replace(/\\n/g, "\n"),
        clientEmail,
      }),
    });
    console.log(
      "Firebase Admin SDK initialized with service account credentials",
    );
  } catch (error) {
    console.error("Failed to initialize Firebase Admin SDK:", error);
  }

  return admin;
}

const firebaseAdminInstance = initializeFirebaseAdmin();

export const firebaseAdmin = firebaseAdminInstance;
export const firebaseAuth =
  firebaseAdminInstance.apps.length > 0 ? firebaseAdminInstance.auth() : null;
