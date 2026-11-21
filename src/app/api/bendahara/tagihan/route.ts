import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.BENDAHARA]);
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));
    const [rows, total] = await Promise.all([
      prisma.tagihan.findMany({
        include: { santri: { select: { id: true, name: true, nis: true, kelas: true } }, jenisPembayaranKustom: { select: { nama: true } } },
        orderBy: [{ tahun: "desc" }, { bulan: "desc" }, { santri: { name: "asc" } }],
        skip: (page - 1) * limit, take: limit,
      }),
      prisma.tagihan.count(),
    ]);
    const audits = await prisma.auditPenyesuaianKeuangan.findMany({ where: { targetId: { in: rows.map((row) => row.id) }, jenisTarget: "TAGIHAN" }, orderBy: { createdAt: "asc" } });
    const firstByTarget = new Map<string, bigint>();
    for (const audit of audits) if (!firstByTarget.has(audit.targetId)) firstByTarget.set(audit.targetId, audit.nominalLama);
    return jsonData({ items: rows.map((row) => ({
      id: row.id, santri: row.santri, jenisTagihan: row.jenisPembayaranKustom?.nama ?? row.jenisTagihan, bulan: row.bulan, tahun: row.tahun,
      nominalAwal: (firstByTarget.get(row.id) ?? row.nominalTagihan).toString(), nominalAkhir: row.nominalTagihan.toString(),
      nominalTerbayar: row.nominalTerbayar.toString(), status: row.status, jatuhTempo: row.jatuhTempo.toISOString(),
    })), total, page, limit });
  } catch (error) { return errorResponse(error); }
}
