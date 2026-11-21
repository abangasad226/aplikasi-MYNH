import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AKADEMIK_ROLES, bacaRapor } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireRoles(request, [...AKADEMIK_ROLES, Role.WALI_SANTRI]);
    return jsonData({ item: await bacaRapor(z.string().cuid().parse(params.id), actor) });
  } catch (error) { return errorResponse(error); }
}
