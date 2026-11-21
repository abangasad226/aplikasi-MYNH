import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { previewQuerySchema } from "@/lib/validators/akademik";
import { AKADEMIK_ROLES, previewRapor } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    return jsonData({ item: await previewRapor(previewQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))) });
  } catch (error) { return errorResponse(error); }
}
