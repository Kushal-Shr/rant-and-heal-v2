import { doc, setDoc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
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

/**
 * Updates a therapist's availability calendar.
 */
export async function updateTherapistAvailability(
  therapistId: string,
  availability: Record<string, any>
): Promise<void> {
  const therapistRef = doc(db, COLLECTION_NAME, therapistId);
  
  await updateDoc(therapistRef, {
    availability
  });
}
