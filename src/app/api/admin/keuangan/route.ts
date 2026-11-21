import { JenisTransaksi, Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [Role.BENDAHARA] as const;

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRoles(request, ALLOWED_ROLES);

    const [transaksiPerJenis, santriAggregate, santriAktif, santriDenganSaldo, web3PerStatus] =
      await Promise.all([
        prisma.transaksiKeuangan.groupBy({
          by: ["jenisTransaksi"],
          _sum: { nominal: true },
        }),
        // Kewajiban titipan dihitung dari seluruh santri yang masih menyimpan
        // saldo, termasuk alumni/keluar yang belum dicairkan.
        prisma.santri.aggregate({
          where: { saldoJajan: { gt: 0n } },
          _sum: { saldoJajan: true },
        }),
        prisma.santri.count({ where: { statusAktif: true } }),
        prisma.santri.count({ where: { saldoJajan: { gt: 0n } } }),
        prisma.transaksiKeuangan.groupBy({
          by: ["web3Status"],
          _count: { _all: true },
        }),
      ]);

    const nominalPerJenis = new Map<JenisTransaksi, bigint>();

    for (const row of transaksiPerJenis) {
      nominalPerJenis.set(row.jenisTransaksi, row._sum.nominal ?? 0n);
    }

    const totalSpp = nominalPerJenis.get(JenisTransaksi.BAYAR_SPP) ?? 0n;
    const totalInfaqDirect =
      nominalPerJenis.get(JenisTransaksi.BAYAR_INFAQ_MAKAN) ?? 0n;
    const totalInfaqRedirect =
      nominalPerJenis.get(JenisTransaksi.REDIRECT_JAJAN_KE_INFAQ) ?? 0n;
    // Reversal mengurangi pemasukan Infaq Makan karena dana dikembalikan ke
    // saldo jajan santri, sehingga tagihan terkait kembali menjadi tunggakan.
    const totalInfaqReversal =
      nominalPerJenis.get(JenisTransaksi.REVERSAL_INFAQ_KE_JAJAN) ?? 0n;
    const totalInfaqNet =
      totalInfaqDirect +
      (totalInfaqRedirect > totalInfaqReversal
        ? totalInfaqRedirect - totalInfaqReversal
        : 0n);

    const web3 = {
      pending: 0,
      synced: 0,
      failed: 0,
      notRequired: 0,
      // Total on-chain tidak menghitung transaksi yang memang tidak perlu
      // dicatat ke ledger agar rasio sinkronisasi tidak menyesatkan.
      total: 0,
    };

    for (const row of web3PerStatus) {
      if (row.web3Status === "PENDING") {
        web3.pending = row._count._all;
      } else if (row.web3Status === "SYNCED") {
        web3.synced = row._count._all;
      } else if (row.web3Status === "FAILED") {
        web3.failed = row._count._all;
      } else {
        web3.notRequired = row._count._all;
      }
    }
    web3.total = web3.pending + web3.synced + web3.failed;

    return jsonData({
      actor: {
        name: actor.name,
        role: actor.role,
      },
      summary: {
        totalSpp: totalSpp.toString(),
        totalInfaq: totalInfaqNet.toString(),
        totalInfaqDirect: totalInfaqDirect.toString(),
        totalInfaqRedirect: totalInfaqRedirect.toString(),
        totalInfaqReversal: totalInfaqReversal.toString(),
        totalTitipanJajan: (santriAggregate._sum.saldoJajan ?? 0n).toString(),
        santriAktif,
        santriDenganSaldo,
        web3,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
