import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import {
  SANTRI_SELECT,
  assertSantriUnique,
  hitungTunggakan,
  serializeSantri,
} from "@/lib/data-induk/santri-service";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { pairingRfidSchema } from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const existing = await prisma.santri.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        nis: true,
        nik: true,
        nisn: true,
      },
    });

    if (!existing) {
      throw new AppError(404, "SANTRI_NOT_FOUND", "Data santri tidak ditemukan.");
    }

    const body = await parseJson(request);
    const input = pairingRfidSchema.parse(body);

    await assertSantriUnique(
      prisma,
      {
        nis: existing.nis,
        nik: existing.nik,
        nisn: existing.nisn,
        rfidUid: input.rfidUid,
      },
      existing.id,
    );

    const updated = await prisma.santri.update({
      where: { id: existing.id },
      data: { rfidUid: input.rfidUid },
      select: SANTRI_SELECT,
    });

    const tunggakan = await hitungTunggakan([updated.id]);

    return jsonData({
      item: serializeSantri(updated, tunggakan.get(updated.id) ?? 0n),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
