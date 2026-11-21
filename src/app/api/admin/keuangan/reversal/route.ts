import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { reversalInfaqKeJajanSchema } from "@/lib/validators/keuangan";
import { kembalikanInfaqKeJajan } from "@/services/keuanganService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [Role.BENDAHARA] as const;

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [...ALLOWED_ROLES]);
    const body = await parseJson(request);
    const input = reversalInfaqKeJajanSchema.parse(body);

    const hasil = await kembalikanInfaqKeJajan(
      input.transaksiId,
      actor.id,
      input.alasanDispensasi,
    );

    return jsonData(
      {
        transaksi: {
          id: hasil.transaksi.id,
          kodeTransaksi: hasil.transaksi.kodeTransaksi,
          jenisTransaksi: hasil.transaksi.jenisTransaksi,
          nominal: hasil.transaksi.nominal.toString(),
          web3Status: hasil.transaksi.web3Status,
        },
        transaksiAsalId: hasil.transaksiAsalId,
        santri: {
          id: hasil.santri.id,
          nis: hasil.santri.nis,
          name: hasil.santri.name,
          saldoJajanAkhir: hasil.santri.saldoJajanAkhir.toString(),
        },
        tagihan: {
          id: hasil.tagihan.id,
          bulan: hasil.tagihan.bulan,
          tahun: hasil.tagihan.tahun,
          nominalTerbayar: hasil.tagihan.nominalTerbayar.toString(),
          status: hasil.tagihan.status,
        },
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
