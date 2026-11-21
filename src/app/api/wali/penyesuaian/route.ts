import { Role } from "@prisma/client";
import { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const wali = await requireRoles(request, [Role.WALI_SANTRI]);
    const santriId = request.nextUrl.searchParams.get("santriId")?.trim();
    if (!santriId) throw new AppError(400, "SANTRI_REQUIRED", "santriId wajib diisi.");
    const santri = await prisma.santri.findFirst({ where: { id: santriId, waliId: wali.id }, select: { id: true } });
    if (!santri) throw new AppError(404, "SANTRI_NOT_FOUND", "Santri tidak ditemukan.");
    const items = await prisma.auditPenyesuaianKeuangan.findMany({
      where: { santriId }, orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, targetId: true, jenisTarget: true, nominalLama: true, nominalBaru: true, selisih: true, alasanWajib: true, createdAt: true, diubahOleh: { select: { name: true } } },
    });
    return jsonData({ items: items.map((item) => ({ ...item, nominalLama: item.nominalLama.toString(), nominalBaru: item.nominalBaru.toString(), selisih: item.selisih.toString() })) });
  } catch (error) {
    return errorResponse(error);
  }
}
