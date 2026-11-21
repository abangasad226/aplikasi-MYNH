import { Prisma, StatusSantri } from "@prisma/client";
import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import type { SantriListResponse } from "@/lib/api-types";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import { buildSantriWhere, parsePagination } from "@/lib/data-induk/query";
import {
  SANTRI_SELECT,
  createSantriWithWallet,
  hitungTunggakan,
  serializeSantri,
} from "@/lib/data-induk/santri-service";
import { prisma } from "@/lib/prisma";
import { santriCreateSchema } from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const searchParams = request.nextUrl.searchParams;
    const where = buildSantriWhere(searchParams);
    const { page, limit, skip } = parsePagination(searchParams);
    const urutAlumni =
      searchParams.get("statusSantri") === StatusSantri.ALUMNI;
    const orderBy: Prisma.SantriOrderByWithRelationInput[] = urutAlumni
      ? [{ tahunLulus: "desc" }, { name: "asc" }]
      : [{ name: "asc" }];

    const [items, total, aktif, alumni, belumPairing] = await Promise.all([
      prisma.santri.findMany({
        where,
        select: SANTRI_SELECT,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.santri.count({ where }),
      prisma.santri.count({ where: { statusSantri: StatusSantri.AKTIF } }),
      prisma.santri.count({ where: { statusSantri: StatusSantri.ALUMNI } }),
      prisma.santri.count({
        where: { statusSantri: StatusSantri.AKTIF, rfidUid: null },
      }),
    ]);

    const tunggakan = await hitungTunggakan(items.map((item) => item.id));

    const payload: SantriListResponse = {
      items: items.map((item) =>
        serializeSantri(item, tunggakan.get(item.id) ?? 0n),
      ),
      total,
      page,
      limit,
      summary: { aktif, alumni, belumPairing },
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
    const input = santriCreateSchema.parse(body);
    const row = await createSantriWithWallet(input);
    const tunggakan = await hitungTunggakan([row.id]);

    return jsonData(
      { item: serializeSantri(row, tunggakan.get(row.id) ?? 0n) },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
