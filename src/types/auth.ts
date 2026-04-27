import { User } from "firebase/auth";

export interface AppUser extends User {
  // Add any custom metadata or typed properties here
  isAnonymous: boolean;
  // You can extend this type if you later fetch additional user data from Firestore
  // e.g., role?: "admin" | "user";
  // e.g., plan?: "free" | "premium";
}

export interface AuthState {
  user: AppUser | null;
  loading: boolean;
  error: Error | null;
}
