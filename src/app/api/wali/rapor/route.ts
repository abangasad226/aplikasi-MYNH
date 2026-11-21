import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { waliRaporQuerySchema } from "@/lib/validators/akademik";
import { ringkasanRapor } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [Role.WALI_SANTRI]);
    const { santriId } = waliRaporQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const santri = await prisma.santri.findFirst({ where: { id: santriId, waliId: actor.id }, select: { id: true } });
    if (!santri) throw new AppError(403, "FORBIDDEN", "Anda hanya dapat melihat rapor santri yang diasuh.");
    const rows = await prisma.raporSantri.findMany({ where: { santriId, statusRapor: "DITERBITKAN", santri: { waliId: actor.id } }, orderBy: [{ tahunAjaran: "desc" }, { semester: "desc" }] });
    return jsonData({ items: rows.map(ringkasanRapor) });
  } catch (error) { return errorResponse(error); }
}
