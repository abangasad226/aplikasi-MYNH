import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { mapelSchema } from "@/lib/validators/akademik";
import { AKADEMIK_ROLES, MAPEL_INCLUDE, simpanMapel } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    const items = await prisma.mataPelajaran.findMany({ include: MAPEL_INCLUDE, orderBy: [{ kategori: "asc" }, { namaMapel: "asc" }] });
    return jsonData({ items });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    const input = mapelSchema.parse(await parseJson(request));
    return jsonData({ item: await simpanMapel(input) }, 201);
  } catch (error) { return errorResponse(error); }
}
