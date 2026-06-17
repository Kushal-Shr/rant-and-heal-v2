import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const firebaseToken = request.cookies.get("firebaseToken")?.value;
  const userRole = request.cookies.get("userRole")?.value;
  const pathname = request.nextUrl.pathname;

  const patientRoutes = ["/dashboard", "/momo", "/therapy", "/vault"];
  const therapistRoutes = ["/portal", "/messages", "/patients", "/session"];

  const isPatientRoute = patientRoutes.some(route => pathname.startsWith(route));
  const isTherapistRoute = therapistRoutes.some(route => pathname.startsWith(route));

  if (!isPatientRoute && !isTherapistRoute) {
    return NextResponse.next();
  }

  // 1. If no valid token, redirect to login
  if (!firebaseToken) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Strict Role Verification
  if (isTherapistRoute && userRole !== "THERAPIST") {
    // Patients trying to access therapist routes
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isPatientRoute && userRole === "THERAPIST") {
    // Therapists trying to access patient routes
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
