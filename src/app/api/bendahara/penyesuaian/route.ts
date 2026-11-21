import { randomUUID } from "node:crypto";
import { JenisTargetPenyesuaian, JenisTransaksi, Prisma, Role, StatusTagihan } from "@prisma/client";
import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, jsonData } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { web3Service } from "@/lib/web3Service";

const bodySchema = z.object({
  targetId: z.string().trim().min(1).max(100),
  jenisTarget: z.nativeEnum(JenisTargetPenyesuaian),
  nominalBaru: z.string().trim().regex(/^\d{1,16}$/, "Nominal harus berupa rupiah bulat non-negatif."),
  alasan: z.string().trim().min(5, "Alasan penyesuaian wajib diisi (minimal 5 karakter). ").max(1000),
}).strict();

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [Role.BENDAHARA]);
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Input penyesuaian tidak valid.", parsed.error.flatten());
    const { targetId, jenisTarget, alasan } = parsed.data;
    const nominalBaru = BigInt(parsed.data.nominalBaru);

    const audit = await prisma.$transaction(async (tx) => {
      if (jenisTarget === JenisTargetPenyesuaian.TAGIHAN) {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Tagihan" WHERE "id" = ${targetId} FOR UPDATE`;
        if (!rows.length) throw new AppError(404, "TAGIHAN_NOT_FOUND", "Tagihan tidak ditemukan.");
        const tagihan = await tx.tagihan.findUniqueOrThrow({ where: { id: targetId } });
        if (nominalBaru < tagihan.nominalTerbayar) {
          throw new AppError(409, "NOMINAL_DI_BAWAH_PEMBAYARAN", "Nominal baru tidak boleh lebih kecil dari jumlah yang sudah dibayar.");
        }
        const status = nominalBaru === tagihan.nominalTerbayar
          ? StatusTagihan.LUNAS
          : tagihan.nominalTerbayar > 0n ? StatusTagihan.CICILAN : StatusTagihan.BELUM_LUNAS;
        await tx.tagihan.update({ where: { id: targetId }, data: { nominalTagihan: nominalBaru, status } });
        const audit = await tx.auditPenyesuaianKeuangan.create({ data: {
          santriId: tagihan.santriId, targetId, jenisTarget, nominalLama: tagihan.nominalTagihan,
          nominalBaru, selisih: nominalBaru - tagihan.nominalTagihan, alasanWajib: alasan, diubahOlehId: actor.id,
        } });
        return { audit, transaksiKompensasiId: null as string | null };
      }

      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "TransaksiKeuangan" WHERE "id" = ${targetId} FOR UPDATE`;
      if (!rows.length) throw new AppError(404, "REVERSAL_NOT_FOUND", "Transaksi pengembalian tidak ditemukan.");
      const reversal = await tx.transaksiKeuangan.findUniqueOrThrow({ where: { id: targetId } });
      if (reversal.jenisTransaksi !== JenisTransaksi.REVERSAL_INFAQ_KE_JAJAN) {
        throw new AppError(400, "TARGET_INVALID", "Target bukan transaksi pengembalian Auto-Redirect.");
      }

      const santriRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Santri" WHERE "id" = ${reversal.santriId} FOR UPDATE`;
      if (!santriRows.length) throw new AppError(404, "SANTRI_NOT_FOUND", "Santri tidak ditemukan.");
      const santri = await tx.santri.findUniqueOrThrow({ where: { id: reversal.santriId }, select: { saldoJajan: true } });
      const previousAdjustment = await tx.auditPenyesuaianKeuangan.findFirst({ where: { targetId, jenisTarget }, orderBy: { createdAt: "desc" }, select: { nominalBaru: true } });
      const nominalLama = previousAdjustment?.nominalBaru ?? reversal.nominal;
      const delta = nominalBaru - nominalLama;
      if (santri.saldoJajan + delta < 0n) throw new AppError(409, "SALDO_TIDAK_CUKUP", "Penyesuaian akan membuat saldo jajan negatif.");
      await tx.santri.update({ where: { id: reversal.santriId }, data: { saldoJajan: { increment: delta } } });
      let transaksiKompensasiId: string | null = null;
      if (reversal.web3Status === "SYNCED" || reversal.txHashWeb3) {
        if (delta !== 0n) {
          const compensation = await tx.transaksiKeuangan.create({ data: {
            kodeTransaksi: `KOMP-${randomUUID()}`,
            santriId: reversal.santriId,
            jenisTransaksi: delta > 0n ? JenisTransaksi.TOPUP_JAJAN : JenisTransaksi.PENARIKAN_TUNAI,
            nominal: delta > 0n ? delta : -delta,
            metodePembayaran: "AUTO_SYSTEM",
            keterangan: `Kompensasi penyesuaian reversal ${reversal.kodeTransaksi}: ${alasan}`,
            createdById: actor.id,
            web3Status: "PENDING",
          }, select: { id: true } });
          transaksiKompensasiId = compensation.id;
        }
      } else {
        await tx.transaksiKeuangan.update({ where: { id: targetId }, data: { nominal: nominalBaru, keterangan: `${reversal.keterangan ?? "Reversal"} | Penyesuaian: ${alasan}` } });
      }
      const audit = await tx.auditPenyesuaianKeuangan.create({ data: {
        santriId: reversal.santriId, targetId, jenisTarget, nominalLama,
        nominalBaru, selisih: delta, alasanWajib: alasan, diubahOlehId: actor.id,
      } });
      return { audit, transaksiKompensasiId };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 15_000 });

    if (audit.transaksiKompensasiId) web3Service.catatTransaksi(audit.transaksiKompensasiId);
    const item = audit.audit;
    return jsonData({ item: { ...item, nominalLama: item.nominalLama.toString(), nominalBaru: item.nominalBaru.toString(), selisih: item.selisih.toString() }, transaksiKompensasiId: audit.transaksiKompensasiId }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.BENDAHARA]);
    const targetId = request.nextUrl.searchParams.get("targetId")?.trim();
    const jenisTarget = request.nextUrl.searchParams.get("jenisTarget");
    if (targetId && jenisTarget === JenisTargetPenyesuaian.TAGIHAN) {
      const target = await prisma.tagihan.findUnique({ where: { id: targetId }, select: { id: true, santriId: true, nominalTagihan: true, nominalTerbayar: true, santri: { select: { name: true, nis: true } } } });
      if (!target) throw new AppError(404, "TARGET_NOT_FOUND", "Tagihan tidak ditemukan.");
      return jsonData({ target: { ...target, nominalTagihan: target.nominalTagihan.toString(), nominalTerbayar: target.nominalTerbayar.toString() } });
    }
    if (targetId && jenisTarget === JenisTargetPenyesuaian.REVERSAL_JAJAN) {
      const target = await prisma.transaksiKeuangan.findUnique({ where: { id: targetId }, select: { id: true, santriId: true, nominal: true, jenisTransaksi: true, santri: { select: { name: true, nis: true } } } });
      if (!target || target.jenisTransaksi !== JenisTransaksi.REVERSAL_INFAQ_KE_JAJAN) throw new AppError(404, "TARGET_NOT_FOUND", "Transaksi pengembalian tidak ditemukan.");
      const latest = await prisma.auditPenyesuaianKeuangan.findFirst({ where: { targetId, jenisTarget: JenisTargetPenyesuaian.REVERSAL_JAJAN }, orderBy: { createdAt: "desc" }, select: { nominalBaru: true } });
      return jsonData({ target: { ...target, nominal: (latest?.nominalBaru ?? target.nominal).toString() } });
    }
    const santriId = request.nextUrl.searchParams.get("santriId")?.trim();
    const items = await prisma.auditPenyesuaianKeuangan.findMany({
      where: santriId ? { santriId } : undefined,
      include: { diubahOleh: { select: { name: true } }, santri: { select: { name: true, nis: true } } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    return jsonData({ items: items.map((item) => ({ ...item, nominalLama: item.nominalLama.toString(), nominalBaru: item.nominalBaru.toString(), selisih: item.selisih.toString() })) });
  } catch (error) {
    return errorResponse(error);
  }
}
