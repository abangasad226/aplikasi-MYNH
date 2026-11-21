import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";

import { errorResponse, jsonData } from "@/lib/api";
import type { OpsiResponse } from "@/lib/api-types";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const [wali, kelas, kamar, tahunLulus] = await Promise.all([
      prisma.user.findMany({
        where: { role: Role.WALI_SANTRI },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: 500,
      }),
      prisma.santri.groupBy({ by: ["kelas"], orderBy: { kelas: "asc" } }),
      prisma.santri.groupBy({ by: ["kamar"], orderBy: { kamar: "asc" } }),
      prisma.santri.groupBy({
        by: ["tahunLulus"],
        where: { tahunLulus: { not: null } },
        orderBy: { tahunLulus: "desc" },
      }),
    ]);

    const payload: OpsiResponse = {
      wali,
      kelas: kelas.map((row) => row.kelas),
      kamar: kamar.map((row) => row.kamar),
      tahunLulus: tahunLulus
        .map((row) => row.tahunLulus)
        .filter((value): value is number => value !== null),
    };

    return jsonData(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
