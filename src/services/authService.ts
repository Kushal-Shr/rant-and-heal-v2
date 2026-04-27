import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut as firebaseSignOut,
  AuthError,
  UserCredential,
} from "firebase/auth";
import { auth } from "../config/firebase";

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
  async signInWithGoogle(): Promise<UserCredential> {
    try {
      const provider = new GoogleAuthProvider();
      return await signInWithPopup(auth, provider);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async signInWithApple(): Promise<UserCredential> {
    try {
      const provider = new OAuthProvider("apple.com");
      return await signInWithPopup(auth, provider);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async signInWithEmail(email: string, password: string): Promise<UserCredential> {
    try {
      return await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async signUpWithEmail(email: string, password: string): Promise<UserCredential> {
    try {
      return await createUserWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw new Error(mapAuthError(error));
    }
  },

  async loginAnonymously(): Promise<UserCredential> {
    try {
      return await signInAnonymously(auth);
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
