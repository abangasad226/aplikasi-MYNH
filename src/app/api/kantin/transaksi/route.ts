import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { transaksiKantinSchema } from "@/lib/validators/kantin";
import { transaksiKantin } from "@/services/kantinService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [
  Role.KASIR_KANTIN,
  Role.BENDAHARA,
] as const;

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [...ALLOWED_ROLES]);
    const body = await parseJson(request);
    const input = transaksiKantinSchema.parse(body);

    const hasil = await transaksiKantin(input, {
      id: actor.id,
      role: actor.role,
    });

    return jsonData(
      {
        santri: hasil.santri,
        merchant: hasil.merchant,
        transaksi: {
          ...hasil.transaksi,
          nominal: hasil.transaksi.nominal.toString(),
          createdAt: hasil.transaksi.createdAt.toISOString(),
        },
        saldoJajanAkhir: hasil.saldoJajanAkhir.toString(),
        totalJajanHariIni: hasil.totalJajanHariIni.toString(),
        sisaLimitHarian: hasil.sisaLimitHarian.toString(),
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
