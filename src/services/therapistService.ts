import {
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
  collection,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import {
  TherapistProfile,
  TherapistVerificationStatus,
} from "../types/database";

const COLLECTION_NAME = "therapists";

/**
 * Submits an application for a therapist professional profile. Public clients can only
 * create and edit pending applications; verification is a privileged staff action.
 */
export async function submitTherapistApplication(
  therapistId: string,
  data: Pick<TherapistProfile, "name" | "specialty" | "licenseNo" | "bio" | "availability">
): Promise<TherapistVerificationStatus> {
  const user = auth.currentUser;
  if (!user || user.uid !== therapistId) throw new Error("You must be signed in to submit a therapist application.");
  const response = await fetch("/api/therapists/application", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  const payload = (await response.json().catch(() => null)) as {
    verificationStatus?: TherapistVerificationStatus;
    error?: string;
  } | null;
  if (!response.ok) throw new Error(payload?.error ?? "Could not save therapist application.");
  if (!payload?.verificationStatus) throw new Error("The therapist application status was not returned.");
  return payload.verificationStatus;
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

  return snap.docs.flatMap((therapistDoc) => {
    const data = therapistDoc.data();
    if (
      typeof data.therapistId !== "string" ||
      typeof data.name !== "string" ||
      typeof data.specialty !== "string" ||
      typeof data.licenseNo !== "string" ||
      typeof data.bio !== "string" ||
      data.isVerified !== true ||
      data.verificationStatus !== TherapistVerificationStatus.VERIFIED
    ) return [];
    return [data as TherapistProfile];
  });
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
