import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { kelasPeriodeSchema, raporSchema } from "@/lib/validators/akademik";
import { AKADEMIK_ROLES, daftarRapor, simpanRapor } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    return jsonData(await daftarRapor(kelasPeriodeSchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    return jsonData({ item: await simpanRapor(raporSchema.parse(await parseJson(request))) });
  } catch (error) { return errorResponse(error); }
}
