import { NextRequest } from "next/server";
import { Prisma, Role } from "@prisma/client";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { requireRoles } from "@/lib/auth/session";
import { createGuru, GURU_SELECT, serializeGuru } from "@/lib/data-induk/guru-service";
import { prisma } from "@/lib/prisma";
import { guruCreateSchema } from "@/lib/validators/data-induk";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.OPERATOR, Role.BENDAHARA]);
    const params = request.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.get("limit")) || 24));
    const q = params.get("q")?.trim();
    if (q && q.length > 80) throw new AppError(400, "QUERY_INVALID", "Pencarian maksimal 80 karakter.");
    const where: Prisma.GuruDanTendikWhereInput = {
      ...(params.get("statusKepegawaian") ? { statusKepegawaian: params.get("statusKepegawaian") as never } : {}),
      ...(params.get("jabatan") ? { jabatan: params.get("jabatan") as never } : {}),
      ...(q ? { OR: [{ namaLengkap: { contains: q, mode: "insensitive" } }, { nik: { contains: q } }, { nip: { contains: q } }] } : {}),
    };
    const [rows, total, counts] = await Promise.all([
      prisma.guruDanTendik.findMany({ where, select: GURU_SELECT, orderBy: [{ namaLengkap: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
      prisma.guruDanTendik.count({ where }),
      prisma.guruDanTendik.groupBy({ by: ["statusKepegawaian"], _count: { _all: true }, where: { statusAktif: true } }),
    ]);
    return jsonData({ items: rows.map(serializeGuru), total, page, limit, summary: { total, aktif: await prisma.guruDanTendik.count({ where: { statusAktif: true } }), gty: counts.find((item) => item.statusKepegawaian === "GTY")?._count._all ?? 0, gtt: counts.find((item) => item.statusKepegawaian === "GTT")?._count._all ?? 0, pnsDpk: counts.find((item) => item.statusKepegawaian === "PNS_DPK")?._count._all ?? 0 }, generatedAt: new Date().toISOString() });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    await requireDataIndukOperator(request);
    const parsed = guruCreateSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Data guru tidak valid.", parsed.error.flatten());
    const result = await createGuru(parsed.data);
    return jsonData({ item: serializeGuru(result.guru), akunDibuat: result.akunDibuat }, 201);
  } catch (error) { return errorResponse(error); }
}
