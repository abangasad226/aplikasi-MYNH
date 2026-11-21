import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import type { GuruListResponse } from "@/lib/api-types";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import {
  GURU_SELECT,
  createGuru,
  serializeGuru,
} from "@/lib/data-induk/guru-service";
import { buildGuruWhere, parsePagination } from "@/lib/data-induk/query";
import { prisma } from "@/lib/prisma";
import { guruCreateSchema } from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const searchParams = request.nextUrl.searchParams;
    const where = buildGuruWhere(searchParams);
    const { page, limit, skip } = parsePagination(searchParams);

    const [items, total, aktif, totalSemua, perStatus] = await Promise.all([
      prisma.guruDanTendik.findMany({
        where,
        select: GURU_SELECT,
        orderBy: [{ statusAktif: "desc" }, { namaLengkap: "asc" }],
        skip,
        take: limit,
      }),
      prisma.guruDanTendik.count({ where }),
      prisma.guruDanTendik.count({ where: { statusAktif: true } }),
      prisma.guruDanTendik.count(),
      prisma.guruDanTendik.groupBy({
        by: ["statusKepegawaian"],
        _count: { _all: true },
      }),
    ]);

    const statusCount = new Map(
      perStatus.map((row) => [row.statusKepegawaian, row._count._all]),
    );

    const payload: GuruListResponse = {
      items: items.map(serializeGuru),
      total,
      page,
      limit,
      summary: {
        total: totalSemua,
        aktif,
        gty: statusCount.get("GTY") ?? 0,
        gtt: statusCount.get("GTT") ?? 0,
        pnsDpk: statusCount.get("PNS_DPK") ?? 0,
        pengabdian: statusCount.get("PENGABDIAN") ?? 0,
      },
      generatedAt: new Date().toISOString(),
    };

    return jsonData(payload);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const body = await parseJson(request);
    const input = guruCreateSchema.parse(body);
    const { guru, akunDibuat } = await createGuru(input);

    return jsonData({ item: serializeGuru(guru), akunDibuat }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
