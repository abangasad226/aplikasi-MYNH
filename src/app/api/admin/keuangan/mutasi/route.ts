import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [Role.BENDAHARA] as const;

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, ALLOWED_ROLES);

    const rawLimit = request.nextUrl.searchParams.get("limit");
    const parsedLimit = Number.parseInt(rawLimit ?? "", 10);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(100, Math.max(1, parsedLimit))
      : 40;

    const transaksi = await prisma.transaksiKeuangan.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        kodeTransaksi: true,
        jenisTransaksi: true,
        nominal: true,
        metodePembayaran: true,
        keterangan: true,
        createdAt: true,
        web3Status: true,
        txHashWeb3: true,
        web3LastError: true,
        tagihanId: true,
        reversedBy: { select: { id: true, kodeTransaksi: true } },
        reversalOf: { select: { id: true, kodeTransaksi: true } },
        santri: {
          select: { id: true, name: true, nis: true },
        },
        merchant: {
          select: { namaKantin: true },
        },
        createdBy: {
          select: { name: true },
        },
      },
    });

    return jsonData({
      items: transaksi.map((item) => ({
        id: item.id,
        kodeTransaksi: item.kodeTransaksi,
        santri: item.santri,
        jenisTransaksi: item.jenisTransaksi,
        nominal: item.nominal.toString(),
        metodePembayaran: item.metodePembayaran,
        keterangan: item.keterangan,
        merchant: item.merchant,
        createdBy: item.createdBy,
        createdAt: item.createdAt.toISOString(),
        web3Status: item.web3Status,
        txHashWeb3: item.txHashWeb3,
        web3LastError: item.web3LastError,
        tagihanId: item.tagihanId,
        sudahDireversal: Boolean(item.reversedBy),
        reversal: item.reversedBy,
        reversalDari: item.reversalOf,
      })),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
