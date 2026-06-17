import {
  GoogleAuthProvider,
  OAuthProvider,
  EmailAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as firebaseSignOut,
  deleteUser,
  linkWithCredential,
  sendEmailVerification,
  AuthError,
  UserCredential,
  User,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, type DocumentData } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { UserRole } from "@/src/types/database";

export type UniversalAuthResult =
  | {
      status: "EXISTING_USER";
      user: User;
      userDoc: DocumentData;
    }
  | {
      status: "NEW_USER";
      user: User;
      uid: string;
    };

async function buildUniversalAuthResult(user: User, role?: UserRole.USER | UserRole.THERAPIST): Promise<UniversalAuthResult> {
  const userDocRef = doc(db, "users", user.uid);
  const userDocSnap = await getDoc(userDocRef);

  if (userDocSnap.exists()) {
    return {
      status: "EXISTING_USER",
      user,
      userDoc: userDocSnap.data(),
    };
  }

  // Create document atomically for OAuth/Anonymous flows to prevent ghost accounts
  const defaultRole = role ?? UserRole.USER;
  const userProfile = user.isAnonymous 
    ? buildAnonymousUserProfile(user)
    : buildRoleBridgeUserProfile(user, defaultRole);

  try {
    await setDoc(userDocRef, userProfile);
  } catch (error) {
    // Rollback ghost account if Firestore write fails
    try {
      await deleteUser(user);
    } catch (rollbackError) {
      console.error("Failed to rollback auth creation:", rollbackError);
    }
    throw error;
  }

  return {
    status: "NEW_USER",
    user,
    uid: user.uid,
  };
}

function getAnonymousHandle(uid: string) {
  const numericSeed =
    Array.from(uid).reduce((total, character) => total + character.charCodeAt(0), 0) % 9000;

  return `Patient-${String(numericSeed + 1000).padStart(4, "0")}`;
}

export function buildAnonymousUserProfile(user: User) {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName: getAnonymousHandle(user.uid),
    role: UserRole.USER,
    isIncognito: true,
    onboardingComplete: true,
    mfaEnabled: false,
    createdAt: serverTimestamp(),
  };
}

export function buildRoleBridgeUserProfile(user: User, role: UserRole.USER | UserRole.THERAPIST) {
  return {
    uid: user.uid,
    email: user.email ?? "",
    displayName:
      user.displayName?.trim() ||
      (role === UserRole.THERAPIST ? "New Practitioner" : "New Patient"),
    role,
    onboardingComplete: false,
    mfaEnabled: false,
    createdAt: serverTimestamp(),
  };
}

// Custom error mapping for user-friendly messages
export const mapAuthError = (error: unknown): string => {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return "An unknown error occurred. Please try again.";
  }

  const authError = error as AuthError;
  switch (authError.code) {
    case "auth/email-already-in-use":
      return "This email is already registered.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/popup-closed-by-user":
      return "Sign-in popup was closed before completing.";
    default:
      return authError.message || "An error occurred during authentication.";
  }
};

export const authService = {
  async signInWithGoogle(role?: UserRole.USER | UserRole.THERAPIST): Promise<UniversalAuthResult> {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      return await buildUniversalAuthResult(userCredential.user, role);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async signInWithApple(role?: UserRole.USER | UserRole.THERAPIST): Promise<UniversalAuthResult> {
    try {
      const provider = new OAuthProvider("apple.com");
      const userCredential = await signInWithPopup(auth, provider);
      return await buildUniversalAuthResult(userCredential.user, role);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      if (!userCredential.user.emailVerified) {
        await firebaseSignOut(auth);
        throw new Error("Please verify your email address before logging in. Check your inbox for the verification link.");
      }
      return userCredential;
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async signUpWithEmail(
    email: string,
    password: string,
    displayName: string,
    role: UserRole.USER | UserRole.THERAPIST = UserRole.USER
  ): Promise<UserCredential> {
    let userCredential: UserCredential | null = null;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await sendEmailVerification(user);

      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: displayName,
        role: role,
        onboardingComplete: false,
        mfaEnabled: false,
        createdAt: serverTimestamp(),
      });

      // Sign them out immediately so they must verify email to log in
      await firebaseSignOut(auth);

      return userCredential;
    } catch (error) {
      if (userCredential?.user) {
        try {
          await deleteUser(userCredential.user);
        } catch (rollbackError) {
          console.error("Failed to rollback auth creation:", rollbackError);
        }
      }
      throw new Error(mapAuthError(error));
    }
  },

  async continueAsGuest(): Promise<UniversalAuthResult> {
    try {
      const userCredential = await signInAnonymously(auth);
      return await buildUniversalAuthResult(userCredential.user);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async linkAnonymousAccountWithEmail(email: string, password: string): Promise<UniversalAuthResult> {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("No authenticated user to link.");
      if (!currentUser.isAnonymous) throw new Error("Current user is not anonymous.");
      
      const credential = EmailAuthProvider.credential(email, password);
      const userCredential = await linkWithCredential(currentUser, credential);
      
      const userDocRef = doc(db, "users", currentUser.uid);
      await setDoc(userDocRef, {
        email: email,
        isIncognito: false,
      }, { merge: true });

      return await buildUniversalAuthResult(userCredential.user);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },
};
