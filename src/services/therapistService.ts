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
  const therapistRef = doc(db, COLLECTION_NAME, therapistId);
  const profileFields = {
    name: data.name || "Anonymous Therapist",
    specialty: data.specialty || "General",
    licenseNo: data.licenseNo || "",
    bio: data.bio || "",
    availability: data.availability || {},
  };

  const currentProfile = await getDoc(therapistRef);

  if (currentProfile.exists()) {
    const currentData = currentProfile.data() as TherapistProfile;
    const currentStatus = currentData.verificationStatus ?? (
      currentData.isVerified
        ? TherapistVerificationStatus.VERIFIED
        : TherapistVerificationStatus.PENDING
    );

    await updateDoc(therapistRef, {
      ...profileFields,
      ...(currentStatus === TherapistVerificationStatus.REJECTED
        ? { verificationStatus: TherapistVerificationStatus.PENDING }
        : {}),
    });

    return currentStatus === TherapistVerificationStatus.REJECTED
      ? TherapistVerificationStatus.PENDING
      : currentStatus;
  }

  await setDoc(therapistRef, {
    therapistId,
    ...profileFields,
    isVerified: false,
    verificationStatus: TherapistVerificationStatus.PENDING,
    createdAt: serverTimestamp(),
  });

  return TherapistVerificationStatus.PENDING;
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
