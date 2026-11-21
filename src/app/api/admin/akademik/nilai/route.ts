import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { nilaiMassalSchema, nilaiQuerySchema } from "@/lib/validators/akademik";
import { AKADEMIK_ROLES, daftarNilai, simpanNilai } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    return jsonData(await daftarNilai(nilaiQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))));
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: NextRequest) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    return jsonData(await simpanNilai(nilaiMassalSchema.parse(await parseJson(request))));
  } catch (error) { return errorResponse(error); }
}
