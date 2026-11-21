import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { pencairanSaldoJajanSchema } from "@/lib/validators/keuangan";
import { cairkanSaldoJajan } from "@/services/keuanganService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [Role.BENDAHARA] as const;

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [...ALLOWED_ROLES]);
    const body = await parseJson(request);
    const input = pencairanSaldoJajanSchema.parse(body);

    const hasil = await cairkanSaldoJajan(
      {
        santriId: input.santriId,
        nominalPencairan: input.nominalPencairan,
        metodePembayaran: input.metodePembayaran,
        keterangan: input.keterangan,
      },
      { id: actor.id, role: actor.role },
    );

    return jsonData(
      {
        santri: hasil.santri,
        transaksi: {
          id: hasil.transaksi.id,
          kodeTransaksi: hasil.transaksi.kodeTransaksi,
          jenisTransaksi: hasil.transaksi.jenisTransaksi,
          nominal: hasil.transaksi.nominal.toString(),
          web3Status: hasil.transaksi.web3Status,
        },
        saldoJajanAkhir: hasil.saldoJajanAkhir.toString(),
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
