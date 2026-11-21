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

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, ALLOWED_ROLES);

    const cardIdentifier = request.nextUrl.searchParams
      .get("cardIdentifier")
      ?.trim();

    if (!cardIdentifier) {
      throw new AppError(
        400,
        "CARD_IDENTIFIER_REQUIRED",
        "Parameter cardIdentifier wajib diisi.",
      );
    }

    if (cardIdentifier.length > 128) {
      throw new AppError(
        400,
        "CARD_IDENTIFIER_INVALID",
        "Kode kartu terlalu panjang.",
      );
    }

    // Kartu dicari lewat RFID maupun barcode. Ambil dua baris agar kode yang
    // kebetulan cocok dengan kartu berbeda bisa ditolak, bukan dipilih acak.
    const matches = await prisma.santri.findMany({
      where: {
        OR: [
          { rfidUid: cardIdentifier },
          { barcodeCode: cardIdentifier },
        ],
      },
      take: 2,
      select: {
        id: true,
        nis: true,
        name: true,
        kelas: true,
        kamar: true,
        statusAktif: true,
        saldoJajan: true,
        limitJajanHarian: true,
        pinHash: true,
      },
    });

    if (matches.length === 0) {
      throw new AppError(
        404,
        "SANTRI_NOT_FOUND",
        "Kartu santri tidak dikenali.",
      );
    }

    if (matches.length > 1) {
      throw new AppError(
        409,
        "KARTU_AMBIGU",
        "Kode kartu cocok dengan lebih dari satu santri. Hubungi admin.",
      );
    }

    const santri = matches[0];

    if (!santri.statusAktif) {
      throw new AppError(
        409,
        "SANTRI_INACTIVE",
        "Status santri tidak aktif. Kartu tidak dapat digunakan.",
      );
    }

    const hariIni = getWibDayRange();
    const pemakaianHariIni = await prisma.transaksiKeuangan.aggregate({
      where: {
        santriId: santri.id,
        jenisTransaksi: JenisTransaksi.JAJAN_KANTIN,
        createdAt: { gte: hariIni.start, lt: hariIni.end },
      },
      _sum: { nominal: true },
    });

    const totalJajanHariIni = pemakaianHariIni._sum.nominal ?? 0n;
    const sisaLimitHarian =
      santri.limitJajanHarian > totalJajanHariIni
        ? santri.limitJajanHarian - totalJajanHariIni
        : 0n;

    return jsonData({
      santri: {
        id: santri.id,
        nis: santri.nis,
        name: santri.name,
        kelas: santri.kelas,
        kamar: santri.kamar,
      },
      saldoJajan: santri.saldoJajan.toString(),
      limitJajanHarian: santri.limitJajanHarian.toString(),
      totalJajanHariIni: totalJajanHariIni.toString(),
      sisaLimitHarian: sisaLimitHarian.toString(),
      pinDiperlukan: santri.pinHash !== null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
