import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { formatTanggal } from "@/lib/waktu";
import { absensiSchema } from "@/lib/validators/kesantrian";
import {
  catatAbsensi,
  type LogAkademikRingkas,
} from "@/services/kesantrianService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [Role.USTADZ_PENGURUS, Role.BENDAHARA] as const;

function serializeLog(log: LogAkademikRingkas) {
  return {
    ...log,
    tanggal: formatTanggal(log.tanggal),
    createdAt: log.createdAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [...ALLOWED_ROLES]);
    const body = await parseJson(request);
    const input = absensiSchema.parse(body);

    const hasil = await catatAbsensi(input, {
      id: actor.id,
      role: actor.role,
    });

    return jsonData(
      {
        santri: hasil.santri,
        log: serializeLog(hasil.log),
        rekapBulanIni: hasil.rekapBulanIni,
        riwayatBulanIni: hasil.riwayatBulanIni.map(serializeLog),
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
