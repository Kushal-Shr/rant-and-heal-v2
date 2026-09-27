import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const uid = process.argv[2];
const enabled = process.argv[3] !== "false";
if (!uid) {
  throw new Error("Usage: node scripts/set-safety-reviewer-claim.mjs <firebase-auth-uid> [false]");
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
const claims = { ...existingUser.customClaims };
if (enabled) claims.safetyReviewer = true;
else delete claims.safetyReviewer;
await auth.setCustomUserClaims(uid, claims);

console.log(`Safety reviewer access ${enabled ? "granted to" : "removed from"} ${uid}. Sign out and sign in again to refresh the ID token.`);
