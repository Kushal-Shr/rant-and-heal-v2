import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { UserProfile, UserRole } from "../types/database";

const COLLECTION_NAME = "users";

/**
 * Syncs the user profile to Firestore. Uses the Auth UID as the document ID.
 * If the document doesn't exist, it creates it and sets the `createdAt` timestamp.
 * If it does exist, it updates the provided fields.
 */
export async function syncUserProfile(
  uid: string,
  data: Partial<Omit<UserProfile, "uid" | "createdAt">>
): Promise<void> {
  const userRef = doc(db, COLLECTION_NAME, uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    // Document exists, clean data to remove undefined values before merge update
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([_, v]) => v !== undefined)
    );
    await setDoc(userRef, cleanData, { merge: true });
  } else {
    // Document doesn't exist, create it with default values and serverTimestamp
    const newUserProfile: UserProfile = {
      uid,
      email: data.email || "",
      displayName: data.displayName || "Anonymous",
      role: data.role || UserRole.USER,
      onboardingComplete: data.onboardingComplete ?? false,
      mfaEnabled: data.mfaEnabled ?? false,
      encryptionKeyHash: data.encryptionKeyHash || "",
      createdAt: serverTimestamp(),
    };
    await setDoc(userRef, newUserProfile);
  }
}

/**
 * Retrieves the user profile by UID.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userRef = doc(db, COLLECTION_NAME, uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }
  
  return null;
}
