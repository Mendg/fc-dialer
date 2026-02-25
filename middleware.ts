import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/dialer") || pathname.startsWith("/api/dialer")) {
    const session = request.cookies.get("dialer_session");
    if (!session || session.value !== "authenticated") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dialer/:path*", "/api/dialer/:path*"],
};
