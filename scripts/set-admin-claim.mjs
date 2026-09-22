import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

// These scripts run directly with Node, outside Next.js. Load the same local
// environment files that `next dev` uses before reading Firebase credentials.
loadEnvConfig(process.cwd());

const uid = process.argv[2];
if (!uid) {
  throw new Error("Usage: node scripts/set-admin-claim.mjs <firebase-auth-uid>");
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!projectId || !clientEmail || !privateKey) {
  throw new Error("Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY first.");
}

const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth(app);
const existingUser = await auth.getUser(uid);
await auth.setCustomUserClaims(uid, { ...existingUser.customClaims, admin: true });
await getFirestore(app).collection("users").doc(uid).set({
  uid,
  role: "ADMIN",
  onboardingComplete: true,
}, { merge: true });

console.log("Admin access granted to " + uid + ". Sign out and sign in again to refresh the ID token.");
