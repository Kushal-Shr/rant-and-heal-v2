"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../config/firebase";
import { AppUser, AuthState } from "../types/auth";
import Cookies from "js-cookie";
import { getUserProfile } from "../services/userService";

type AuthContextType = AuthState;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // The onAuthStateChanged observer manages the perfectly synced loading state
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: User | null) => {
        try {
          if (firebaseUser) {
            // Preserve the Firebase User instance so auth methods like getIdToken remain available.
            setUser(firebaseUser as AppUser);
            
            const token = await firebaseUser.getIdToken();
            Cookies.set("firebaseToken", token, { expires: 14, sameSite: "lax" });
            
            try {
              const profile = await getUserProfile(firebaseUser.uid);
              if (profile?.role) {
                Cookies.set("userRole", profile.role, { expires: 14, sameSite: "lax" });
              }
            } catch (profileError) {
              console.error("Failed to fetch user role for cookie:", profileError);
            }
            
            // Set a lightweight cookie for the middleware to read
            // Note: This does NOT verify the token on the edge, it just flags auth state
            Cookies.set("hasAuth", "true", { expires: 14, sameSite: "lax" });
          } else {
            setUser(null);
            Cookies.remove("hasAuth");
            Cookies.remove("firebaseToken");
            Cookies.remove("userRole");
          }
        } catch (err) {
          setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          // Resolve the perfectly-handled loading state
          setLoading(false);
        }
      },
      (error) => {
        setError(error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
    }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
