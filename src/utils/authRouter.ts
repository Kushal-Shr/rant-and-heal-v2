import type { User } from "firebase/auth";
import { UserRole, type UserProfile } from "@/src/types/database";

export const AUTH_ROUTES = {
  selectRole: "/auth/select-role",
  patientOnboarding: "/auth/onboarding-patient",
  therapistOnboarding: "/auth/onboarding-therapist",
  patientDashboard: "/dashboard",
  therapistPortal: "/portal",
  login: "/auth/login",
} as const;

export type RoutableUserDoc = Partial<UserProfile> & {
  role?: UserRole | string | null;
  onboardingComplete?: boolean | null;
};

function normalizeRole(role: RoutableUserDoc["role"]): UserRole.USER | UserRole.THERAPIST {
  return role === UserRole.THERAPIST ? UserRole.THERAPIST : UserRole.USER;
}

export function getAuthRedirectPath(
  user: Pick<User, "isAnonymous">,
  userDoc?: RoutableUserDoc | null
): (typeof AUTH_ROUTES)[keyof typeof AUTH_ROUTES] {
  if (!userDoc) {
    return user.isAnonymous ? AUTH_ROUTES.patientDashboard : AUTH_ROUTES.selectRole;
  }

  const role = normalizeRole(userDoc.role);
  const onboardingComplete = userDoc.onboardingComplete === true;

  if (onboardingComplete) {
    return role === UserRole.THERAPIST
      ? AUTH_ROUTES.therapistPortal
      : AUTH_ROUTES.patientDashboard;
  }

  return role === UserRole.THERAPIST
    ? AUTH_ROUTES.therapistOnboarding
    : AUTH_ROUTES.patientOnboarding;
}
