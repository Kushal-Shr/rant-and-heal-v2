import { Timestamp, FieldValue } from "firebase/firestore";

// Helper type to handle Firebase's dual nature of timestamps
// Write operations use FieldValue (serverTimestamp()), Read operations return Timestamp
export type ServerTime = Timestamp | FieldValue;

export enum UserRole {
  USER = "USER",
  THERAPIST = "THERAPIST",
  ADMIN = "ADMIN",
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  onboardingComplete: boolean;
  mfaEnabled: boolean;
  encryptionKeyHash?: string; // Optional for users who haven't initialized their vault
  createdAt: ServerTime;
}

export interface TherapistProfile {
  therapistId: string; // Corresponds to Auth UID
  name: string;
  specialty: string;
  licenseNo: string;
  isVerified: boolean;
  bio: string;
  availability: Record<string, any>; // Map string to any shape for now
  createdAt: ServerTime;
}

export enum ConnectionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  REVOKED = "REVOKED",
}

export interface Connection {
  // Document ID is implicitly therapistId_userId
  userId: string;
  therapistId: string;
  status: ConnectionStatus;
  consentHash: string; // Proof of cryptographic consent
  connectedAt: ServerTime;
}
