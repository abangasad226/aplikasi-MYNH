import { JenisTransaksi, Role } from "@prisma/client";
import type { NextRequest } from "next/server";

import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RangeKey = "BULAN_INI" | "ENAM_BULAN" | "TAHUN_AJARAN";
type Category = "spp" | "infaq" | "kustom" | "kantin";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function periodStart(now: Date, range: RangeKey) {
  if (range === "BULAN_INI") return startOfMonth(now);
  if (range === "ENAM_BULAN") return new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const schoolYearStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(schoolYearStart, 6, 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(date);
}

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.BENDAHARA]);
    const requestedRange = request.nextUrl.searchParams.get("range") ?? "ENAM_BULAN";
    if (!["BULAN_INI", "ENAM_BULAN", "TAHUN_AJARAN"].includes(requestedRange)) {
      return Response.json({ error: "Rentang waktu tidak valid." }, { status: 400 });
    }
    const range = requestedRange as RangeKey;
    const now = new Date();
    const start = periodStart(now, range);

    const [transactions, currentMonthBills] = await Promise.all([
      prisma.transaksiKeuangan.findMany({
        where: { createdAt: { gte: start, lte: now } },
        select: {
          createdAt: true,
          jenisTransaksi: true,
          nominal: true,
          tagihan: {
            select: {
              jenisPembayaranKustom: { select: { id: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.tagihan.findMany({
        where: { bulan: now.getMonth() + 1, tahun: now.getFullYear() },
        select: { nominalTagihan: true, nominalTerbayar: true },
      }),
    ]);

    const months: Array<{ date: Date; key: string; label: string; income: bigint; expense: bigint; spp: bigint; infaq: bigint; kustom: bigint; kantin: bigint }> = [];
    for (let date = new Date(start.getFullYear(), start.getMonth(), 1); date <= now; date = new Date(date.getFullYear(), date.getMonth() + 1, 1)) {
      months.push({ date, key: monthKey(date), label: monthLabel(date), income: 0n, expense: 0n, spp: 0n, infaq: 0n, kustom: 0n, kantin: 0n });
    }

    for (const transaction of transactions) {
      const month = months.find((item) => item.key === monthKey(transaction.createdAt));
      if (!month) continue;
      const amount = transaction.nominal;
      if (transaction.jenisTransaksi === JenisTransaksi.PENARIKAN_TUNAI) {
        month.expense += amount;
        continue;
      }

      let category: Category | null = null;
      let signedAmount = amount;
      if (transaction.jenisTransaksi === JenisTransaksi.REVERSAL_INFAQ_KE_JAJAN) {
        category = "infaq";
        signedAmount = -amount;
      } else if (transaction.tagihan?.jenisPembayaranKustom) {
        category = "kustom";
      } else if (transaction.jenisTransaksi === JenisTransaksi.BAYAR_SPP) {
        category = "spp";
      } else if (
        transaction.jenisTransaksi === JenisTransaksi.BAYAR_INFAQ_MAKAN ||
        transaction.jenisTransaksi === JenisTransaksi.REDIRECT_JAJAN_KE_INFAQ
      ) {
        category = "infaq";
      } else if (transaction.jenisTransaksi === JenisTransaksi.JAJAN_KANTIN) {
        category = "kantin";
      }
      if (!category) continue;
      month[category] += signedAmount;
      month.income += signedAmount;
    }

    const paid = currentMonthBills.reduce((sum, bill) => sum + bill.nominalTerbayar, 0n);
    const outstanding = currentMonthBills.reduce((sum, bill) => {
      const remaining = bill.nominalTagihan - bill.nominalTerbayar;
      return sum + (remaining > 0n ? remaining : 0n);
    }, 0n);
    const categoryTotals = months.reduce(
      (sum, month) => ({ spp: sum.spp + month.spp, infaq: sum.infaq + month.infaq, kustom: sum.kustom + month.kustom, kantin: sum.kantin + month.kantin }),
      { spp: 0n, infaq: 0n, kustom: 0n, kantin: 0n },
    );

    return jsonData({
      range,
      months: months.map((month) => ({
        label: month.label,
        income: month.income.toString(),
        expense: month.expense.toString(),
      })),
      incomeComposition: [
        { name: "SPP", value: categoryTotals.spp > 0n ? categoryTotals.spp.toString() : "0", key: "spp" },
        { name: "Infaq Makan", value: categoryTotals.infaq > 0n ? categoryTotals.infaq.toString() : "0", key: "infaq" },
        { name: "Tagihan Kustom", value: categoryTotals.kustom > 0n ? categoryTotals.kustom.toString() : "0", key: "kustom" },
        { name: "Kantin", value: categoryTotals.kantin > 0n ? categoryTotals.kantin.toString() : "0", key: "kantin" },
      ],
      billingStatus: [
        { name: "Lunas", value: paid.toString() },
        { name: "Belum Lunas", value: outstanding.toString() },
      ],
      currentMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
