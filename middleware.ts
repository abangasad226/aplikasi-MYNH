import { NextRequest, NextResponse } from "next/server";

type Role = "BENDAHARA" | "OPERATOR" | "KASIR_KANTIN" | "USTADZ_PENGURUS" | "WALI_SANTRI";
const HOME: Record<Role, string> = {
  BENDAHARA: "/admin/keuangan",
  OPERATOR: "/admin/data-induk",
  KASIR_KANTIN: "/kantin/pos",
  USTADZ_PENGURUS: "/admin/akademik",
  WALI_SANTRI: "/wali/dashboard",
};

function allowed(path: string, role: Role) {
  if (path.startsWith("/admin/keuangan")) return role === "BENDAHARA";
  if (path.startsWith("/admin/data-induk")) return role === "OPERATOR";
  if (path.startsWith("/admin/akademik")) return role === "USTADZ_PENGURUS";
  if (path.startsWith("/kantin/pos")) return role === "KASIR_KANTIN";
  if (path.startsWith("/wali/dashboard")) return role === "WALI_SANTRI";
  if (path.startsWith("/rapor/")) return role === "WALI_SANTRI" || role === "USTADZ_PENGURUS";
  if (path.startsWith("/santri/")) return role !== "WALI_SANTRI";
  return true;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const cookie = request.cookies.get("pesantren_session")?.value;
  if (!cookie) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }
  try {
    const response = await fetch(new URL("/api/auth/session", request.url), {
      headers: { cookie: `pesantren_session=${cookie}` },
      cache: "no-store",
    });
    if (!response.ok) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", path);
      return NextResponse.redirect(login);
    }
    const payload = await response.json() as { data?: { user?: { role?: Role } } };
    const role = payload.data?.user?.role;
    if (!role || !HOME[role]) return NextResponse.redirect(new URL("/login", request.url));
    if (!allowed(path, role)) return NextResponse.redirect(new URL(HOME[role], request.url));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/admin/:path*", "/kantin/pos/:path*", "/wali/dashboard/:path*", "/rapor/:path*", "/santri/:path*"],
};
