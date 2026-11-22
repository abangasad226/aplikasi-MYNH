import { randomUUID } from "node:crypto";
import { JenisTransaksi, MetodePembayaran, Prisma, Role, Web3SyncStatus } from "@prisma/client";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { MAX_NOMINAL_SETORAN } from "@/lib/constants";
import { web3Service } from "@/lib/web3Service";

const schema = z.object({ santriId: z.string().trim().min(1).max(64), nominal: z.string().regex(/^\d+$/).transform(BigInt).refine((value) => value > 0n && value <= MAX_NOMINAL_SETORAN, "Nominal top-up di luar batas yang diizinkan."), keterangan: z.string().trim().max(300).optional() }).strict();

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.BENDAHARA]);
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const items = await prisma.santri.findMany({ where: { statusAktif: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { nis: { contains: q, mode: "insensitive" as const } }] } : {}) }, select: { id: true, name: true, nis: true, kelas: true, saldoJajan: true }, orderBy: { name: "asc" }, take: 100 });
    return jsonData({ items: items.map((item) => ({ ...item, saldoJajan: item.saldoJajan.toString() })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [Role.BENDAHARA]);
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Data top-up tunai tidak valid.", parsed.error.flatten());
    const { santriId, nominal, keterangan } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Santri" WHERE "id" = ${santriId} FOR UPDATE`;
      const student = await tx.santri.findUnique({ where: { id: santriId }, select: { id: true, name: true, nis: true, kelas: true, statusAktif: true } });
      if (!student) throw new AppError(404, "SANTRI_NOT_FOUND", "Santri tidak ditemukan.");
      if (!student.statusAktif) throw new AppError(409, "SANTRI_INACTIVE", "Tidak dapat top-up untuk santri nonaktif.");
      const updated = await tx.santri.update({ where: { id: santriId }, data: { saldoJajan: { increment: nominal } }, select: { saldoJajan: true } });
      const transaction = await tx.transaksiKeuangan.create({ data: { kodeTransaksi: `TOPUP-CASH-${randomUUID()}`, santriId, jenisTransaksi: JenisTransaksi.TOPUP_JAJAN, nominal, metodePembayaran: MetodePembayaran.TUNAI_BENDAHARA, keterangan: keterangan || `Top-up saldo jajan tunai di Bendahara oleh ${actor.name}`, createdById: actor.id, web3Status: Web3SyncStatus.PENDING }, select: { id: true, kodeTransaksi: true, nominal: true, createdAt: true, web3Status: true } });
      return { student, saldoJajanAkhir: updated.saldoJajan, transaction };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 10000 });
    web3Service.catatTransaksi(result.transaction.id);
    return jsonData({ santri: result.student, saldoJajanAkhir: result.saldoJajanAkhir.toString(), transaksi: { ...result.transaction, nominal: result.transaction.nominal.toString(), createdAt: result.transaction.createdAt.toISOString() } }, 201);
  } catch (error) { return errorResponse(error); }
}
