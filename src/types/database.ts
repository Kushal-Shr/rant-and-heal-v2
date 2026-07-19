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
  emergencyContact?: string;
  isIncognito?: boolean;
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
  availability: Record<string, unknown>; // Map string to a flexible schedule shape
  createdAt: ServerTime;
}

export enum ConnectionStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  REJECTED = "REJECTED",
  REVOKED = "REVOKED",
}

export interface Connection {
  id?: string;
  // Document ID is the patient UID, enforcing one therapist connection at a time.
  userId: string;
  therapistId: string;
  status: ConnectionStatus;
  consentHash: string; // Proof of cryptographic consent
  requestedAt: ServerTime;
  respondedAt?: ServerTime;
  updatedAt: ServerTime;
  lastMessageAt?: ServerTime;
  connectedAt?: ServerTime;
}

export enum TherapyMessageSenderRole {
  USER = "USER",
  THERAPIST = "THERAPIST",
}

export interface TherapyMessage {
  id?: string;
  text: string;
  senderId: string;
  senderRole: TherapyMessageSenderRole;
  createdAt: ServerTime;
}

export enum TherapyCallStatus {
  RINGING = "RINGING",
  ACTIVE = "ACTIVE",
  ENDED = "ENDED",
}

export interface TherapyCallSession {
  id?: string;
  patientId: string;
  therapistId: string;
  startedBy: string;
  status: TherapyCallStatus;
  createdAt: ServerTime;
  endedAt?: ServerTime;
}

export type TherapySignalType = "offer" | "answer" | "ice-candidate" | "hangup";

export interface TherapyCallSignal {
  id?: string;
  type: TherapySignalType;
  senderId: string;
  payload: Record<string, unknown>;
  createdAt: ServerTime;
}

export interface MoodEntry {
  id?: string;
  moodScore: number;
  anxietyScore: number;
  energyScore: number;
  note?: string;
  createdAt: ServerTime;
}

export interface JournalEntry {
  id?: string;
  title: string;
  body: string;
  moodTag?: string;
  createdAt: ServerTime;
  updatedAt: ServerTime;
}
