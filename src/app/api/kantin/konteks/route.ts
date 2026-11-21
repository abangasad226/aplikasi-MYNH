import { JenisTransaksi, Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getWibDayRange } from "@/lib/waktu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [
  Role.KASIR_KANTIN,
  Role.BENDAHARA,
] as const;

const MERCHANT_SELECT = {
  id: true,
  namaKantin: true,
  saldoPendapatan: true,
} as const;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRoles(request, ALLOWED_ROLES);

    let merchant: {
      id: string;
      namaKantin: string;
      saldoPendapatan: bigint;
    } | null = null;

    if (actor.role === Role.KASIR_KANTIN) {
      merchant = await prisma.merchantKantin.findUnique({
        where: { pemilikUserId: actor.id },
        select: MERCHANT_SELECT,
      });
    } else {
      const merchantId = request.nextUrl.searchParams
        .get("merchantId")
        ?.trim();

      merchant = merchantId
        ? await prisma.merchantKantin.findUnique({
            where: { id: merchantId },
            select: MERCHANT_SELECT,
          })
        : await prisma.merchantKantin.findFirst({
            orderBy: { createdAt: "asc" },
            select: MERCHANT_SELECT,
          });
    }

    if (!merchant) {
      throw new AppError(
        404,
        "MERCHANT_NOT_FOUND",
        "Merchant kantin belum terdaftar untuk akun kasir ini.",
      );
    }

    const hariIni = getWibDayRange();
    const penjualanHariIni = await prisma.transaksiKeuangan.aggregate({
      where: {
        merchantId: merchant.id,
        jenisTransaksi: JenisTransaksi.JAJAN_KANTIN,
        createdAt: { gte: hariIni.start, lt: hariIni.end },
      },
      _sum: { nominal: true },
      _count: { _all: true },
    });

    return jsonData({
      kasir: {
        id: actor.id,
        name: actor.name,
      },
      merchant: {
        id: merchant.id,
        namaKantin: merchant.namaKantin,
        saldoPendapatan: merchant.saldoPendapatan.toString(),
      },
      hariIni: {
        totalPenjualan: (penjualanHariIni._sum.nominal ?? 0n).toString(),
        jumlahTransaksi: penjualanHariIni._count._all,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
