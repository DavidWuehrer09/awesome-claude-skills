import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export async function proxy(request: NextRequest) {
  const mode = authMode();
  const { pathname } = request.nextUrl;
  if (mode === "open") return NextResponse.next();

  if (mode === "misconfigured") {
    if (pathname === "/api/health") return NextResponse.next();
    return new NextResponse(
      "This deployment has no APP_PASSWORD set. Set APP_PASSWORD (recommended) or ALLOW_NO_PASSWORD=true for local-only use, then restart.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (PUBLIC_PATHS.some((p) => pathname === p)) return NextResponse.next();
  const ok = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "unauthorized", message: "Please sign in." } }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
