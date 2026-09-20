import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const firebaseToken = request.cookies.get("firebaseToken")?.value;
  const pathname = request.nextUrl.pathname;

  const patientRoutes = ["/dashboard", "/momo", "/therapy", "/vault", "/settings"];
  const therapistRoutes = ["/portal", "/messages", "/patients", "/session"];
  const adminRoutes = ["/admin"];

  const isPatientRoute = patientRoutes.some(route => pathname.startsWith(route));
  const isTherapistRoute = therapistRoutes.some(route => pathname.startsWith(route));
  const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route));

  if (!isPatientRoute && !isTherapistRoute && !isAdminRoute) {
    return NextResponse.next();
  }

  // 1. If no valid token, redirect to login
  if (!firebaseToken) {
    const loginUrl = new URL(isTherapistRoute ? "/auth/provider/login" : "/auth/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role authorization is enforced by Firestore rules and the client role guard.
  // This cookie is browser-controlled and must not be used as an authority signal.
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
