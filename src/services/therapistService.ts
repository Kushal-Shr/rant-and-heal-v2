import {
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  collection,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { TherapistProfile } from "../types/database";

const COLLECTION_NAME = "therapists";

/**
 * Creates a new therapist professional profile using the Auth UID as document ID.
 */
export async function createTherapistProfile(
  therapistId: string,
  data: Omit<TherapistProfile, "therapistId" | "createdAt">
): Promise<void> {
  const therapistRef = doc(db, COLLECTION_NAME, therapistId);
  
  const newProfile: TherapistProfile = {
    therapistId,
    name: data.name || "Anonymous Therapist",
    specialty: data.specialty || "General",
    licenseNo: data.licenseNo || "",
    isVerified: data.isVerified ?? false,
    bio: data.bio || "",
    availability: data.availability || {},
    createdAt: serverTimestamp(),
  };

  await setDoc(therapistRef, newProfile);
}

/**
 * Retrieves a therapist's professional profile.
 */
export async function getTherapistProfile(therapistId: string): Promise<TherapistProfile | null> {
  const therapistRef = doc(db, COLLECTION_NAME, therapistId);
  const snap = await getDoc(therapistRef);

  if (snap.exists()) {
    return snap.data() as TherapistProfile;
  }

  return null;
}

export async function listVerifiedTherapists(): Promise<TherapistProfile[]> {
  const therapistsQuery = query(
    collection(db, COLLECTION_NAME),
    where("isVerified", "==", true)
  );
  const snap = await getDocs(therapistsQuery);

  return snap.docs.map((therapistDoc) => therapistDoc.data() as TherapistProfile);
}

/**
 * Updates a therapist's availability calendar.
 */
export async function updateTherapistAvailability(
  therapistId: string,
  availability: Record<string, unknown>
): Promise<void> {
  const therapistRef = doc(db, COLLECTION_NAME, therapistId);
  
  await updateDoc(therapistRef, {
    availability
  });
}
