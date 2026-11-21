import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { setoranJajanSchema } from "@/lib/validators/keuangan";
import {
  setorTitipanJajan,
  type HasilSetoranJajan,
} from "@/services/keuanganService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeHasil(hasil: HasilSetoranJajan) {
  return {
    referensiSetoran: hasil.referensiSetoran,
    santriId: hasil.santriId,
    nominalSetor: hasil.nominalSetor.toString(),
    autoRedirectAktif: hasil.autoRedirectAktif,
    totalDialihkanKeInfaq: hasil.totalDialihkanKeInfaq.toString(),
    totalMasukSaldoJajan: hasil.totalMasukSaldoJajan.toString(),
    saldoJajanAkhir: hasil.saldoJajanAkhir.toString(),
    alokasiInfaq: hasil.alokasiInfaq.map((alokasi) => ({
      ...alokasi,
      nominal: alokasi.nominal.toString(),
    })),
    transaksi: hasil.transaksi.map((transaksi) => ({
      ...transaksi,
      nominal: transaksi.nominal.toString(),
    })),
  };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [
      Role.WALI_SANTRI,
      Role.BENDAHARA,
    ]);
    const body = await parseJson(request);
    const input = setoranJajanSchema.parse(body);

    const hasil = await setorTitipanJajan(
      {
        santriId: input.santriId,
        nominalSetor: input.nominalSetor,
        metodePembayaran: input.metodePembayaran,
        keterangan: input.keterangan,
      },
      { id: actor.id, role: actor.role },
    );

    return jsonData(serializeHasil(hasil), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
