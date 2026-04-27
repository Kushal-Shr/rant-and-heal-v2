import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // We check for the lightweight cookie set by our AuthContext
  const hasAuth = request.cookies.get("hasAuth")?.value;
  
  const protectedRoutes = ["/dashboard", "/journal"];
  const isProtectedRoute = protectedRoutes.some(route => request.nextUrl.pathname.startsWith(route));

  // If the route is protected and the user does not have the auth cookie,
  // redirect them to the login page.
  if (isProtectedRoute && !hasAuth) {
    const loginUrl = new URL("/login", request.url);
    // You can also add a `next` query parameter to redirect back after login
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public assets)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
