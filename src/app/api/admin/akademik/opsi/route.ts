import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AKADEMIK_ROLES } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRoles(request, AKADEMIK_ROLES);
    const [kelas, guru] = await Promise.all([
      prisma.santri.findMany({ select: { kelas: true }, distinct: ["kelas"], orderBy: { kelas: "asc" } }),
      prisma.guruDanTendik.findMany({ where: { statusAktif: true }, select: { id: true, namaLengkap: true }, orderBy: { namaLengkap: "asc" } }),
    ]);
    return jsonData({ actor, kelas: kelas.map((row) => row.kelas), guru });
  } catch (error) { return errorResponse(error); }
}
