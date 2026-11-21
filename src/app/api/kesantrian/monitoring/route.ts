import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { formatTanggal } from "@/lib/waktu";
import { monitoringSchema } from "@/lib/validators/kesantrian";
import {
  catatMonitoring,
  type LogAkademikRingkas,
  type PelanggaranRingkas,
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

function serializePelanggaran(pelanggaran: PelanggaranRingkas) {
  return {
    ...pelanggaran,
    tanggal: formatTanggal(pelanggaran.tanggal),
    createdAt: pelanggaran.createdAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [...ALLOWED_ROLES]);
    const body = await parseJson(request);
    const input = monitoringSchema.parse(body);

    const hasil = await catatMonitoring(input, {
      id: actor.id,
      role: actor.role,
    });

    if (hasil.tipe === "PELANGGARAN") {
      return jsonData(
        {
          tipe: hasil.tipe,
          santri: hasil.santri,
          pelanggaran: serializePelanggaran(hasil.pelanggaran),
          totalPoinBulanIni: hasil.totalPoinBulanIni,
          dicatatOleh: actor.name,
        },
        201,
      );
    }

    return jsonData(
      {
        tipe: hasil.tipe,
        santri: hasil.santri,
        akademik: serializeLog(hasil.akademik),
        dicatatOleh: actor.name,
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
