import { NextRequest } from "next/server";
import { Prisma, Role, StatusSantri } from "@prisma/client";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { requireRoles } from "@/lib/auth/session";
import { santriCreateSchema } from "@/lib/validators/data-induk";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createSantriWithWallet, hitungTunggakan, SANTRI_SELECT, serializeSantri } from "@/lib/data-induk/santri-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.OPERATOR, Role.BENDAHARA]);
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 50));
    const statusRaw = params.get("statusSantri");
    const statusSantri = statusRaw && Object.values(StatusSantri).includes(statusRaw as StatusSantri) ? statusRaw as StatusSantri : undefined;
    const q = params.get("q")?.trim();
    if (q && q.length > 80) throw new AppError(400, "QUERY_INVALID", "Pencarian maksimal 80 karakter.");
    const where: Prisma.SantriWhereInput = {
      ...(statusSantri ? { statusSantri } : {}),
      ...(params.get("kelas") ? { kelas: params.get("kelas")! } : {}),
      ...(params.get("kamar") ? { kamar: params.get("kamar")! } : {}),
      ...(params.get("statusMukim") ? { statusMukim: params.get("statusMukim") as never } : {}),
      ...(params.get("tahunLulus") ? { tahunLulus: Number(params.get("tahunLulus")) || -1 } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { nis: { contains: q, mode: "insensitive" } }, { nik: { contains: q } }] } : {}),
    };
    const [rows, total, summary] = await Promise.all([
      prisma.santri.findMany({ where, select: SANTRI_SELECT, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.santri.count({ where }),
      prisma.santri.groupBy({ by: ["statusSantri"], _count: { _all: true } }),
    ]);
    const tunggakan = await hitungTunggakan(rows.map((row) => row.id));
    return jsonData({ items: rows.map((row) => serializeSantri(row, tunggakan.get(row.id) ?? 0n)), total, page, limit, summary: {
      aktif: summary.find((row) => row.statusSantri === StatusSantri.AKTIF)?._count._all ?? 0,
      alumni: summary.find((row) => row.statusSantri === StatusSantri.ALUMNI)?._count._all ?? 0,
      belumPairing: await prisma.santri.count({ where: { statusSantri: StatusSantri.AKTIF, rfidUid: null } }),
    }, generatedAt: new Date().toISOString() });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireDataIndukOperator(request);
    const parsed = santriCreateSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Data santri tidak valid.", parsed.error.flatten());
    const row = await createSantriWithWallet(parsed.data);
    const tunggakan = await hitungTunggakan([row.id]);
    return jsonData({ item: serializeSantri(row, tunggakan.get(row.id) ?? 0n) }, 201);
  } catch (error) { return errorResponse(error); }
}
