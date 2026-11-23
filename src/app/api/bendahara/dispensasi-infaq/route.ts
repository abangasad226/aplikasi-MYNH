import { NextRequest } from "next/server";
import { Prisma, Role, StatusTagihan, StatusMukim, StatusHidup, JenisTagihan } from "@prisma/client";
import { z } from "zod";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const eligibility: Prisma.SantriWhereInput = {
  statusAktif: true,
  OR: [
    { statusMukim: StatusMukim.NON_MUKIM },
    { statusHidupAyah: StatusHidup.MENINGGAL, statusHidupIbu: StatusHidup.MENINGGAL },
  ],
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.BENDAHARA]);
    const students = await prisma.santri.findMany({
      where: eligibility,
      select: { id: true, name: true, nis: true, kelas: true, statusMukim: true, statusHidupAyah: true, statusHidupIbu: true, isDispensasiInfaq: true, catatanDispensasi: true, tagihan: { where: { jenisTagihan: JenisTagihan.INFAQ_MAKAN, status: { in: [StatusTagihan.BELUM_LUNAS, StatusTagihan.CICILAN] } }, select: { id: true, bulan: true, tahun: true, nominalTagihan: true, nominalTerbayar: true, status: true } } },
      orderBy: [{ kelas: "asc" }, { name: "asc" }],
    });
    return jsonData({ items: students.map((student) => ({
      id: student.id, name: student.name, nis: student.nis, kelas: student.kelas,
      alasanLayak: student.statusMukim === StatusMukim.NON_MUKIM ? "SANTRI_KALONG" : "YATIM_PIATU",
      isDispensasiInfaq: student.isDispensasiInfaq, catatanDispensasi: student.catatanDispensasi,
      tunggakan: student.tagihan.map((bill) => ({ id: bill.id, bulan: bill.bulan, tahun: bill.tahun, nominalTagihan: bill.nominalTagihan.toString(), nominalTerbayar: bill.nominalTerbayar.toString(), status: bill.status })),
    })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [Role.BENDAHARA]);
    const parsed = z.object({ santriId: z.string().min(1), aktif: z.boolean() }).strict().safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Data dispensasi Infaq Makan tidak valid.", parsed.error.flatten());
    const { santriId, aktif } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const student = await tx.santri.findUnique({ where: { id: santriId }, select: { id: true, statusAktif: true, statusMukim: true, statusHidupAyah: true, statusHidupIbu: true, isDispensasiInfaq: true } });
      if (!student || !student.statusAktif) throw new AppError(404, "SANTRI_NOT_FOUND", "Santri aktif tidak ditemukan.");
      const eligible = student.statusMukim === StatusMukim.NON_MUKIM || (student.statusHidupAyah === StatusHidup.MENINGGAL && student.statusHidupIbu === StatusHidup.MENINGGAL);
      if (aktif && !eligible) throw new AppError(403, "DISPENSASI_TIDAK_MEMENUHI_SYARAT", "Dispensasi hanya tersedia bagi santri kalong atau yatim piatu.");
      if (student.isDispensasiInfaq === aktif) return { aktif, diperbarui: 0 };
      let diperbarui = 0;
      if (aktif) {
        const unpaid = await tx.tagihan.findMany({ where: { santriId, jenisTagihan: JenisTagihan.INFAQ_MAKAN, status: { in: [StatusTagihan.BELUM_LUNAS, StatusTagihan.CICILAN] } }, select: { id: true, nominalTagihan: true, nominalTerbayar: true } });
        for (const bill of unpaid) {
          const reason = student.statusMukim === StatusMukim.NON_MUKIM ? "Dispensasi Infaq Makan: santri kalong" : "Dispensasi Infaq Makan: yatim piatu";
          const nominalBaru = bill.nominalTerbayar;
          await tx.auditPenyesuaianKeuangan.create({ data: { santriId, targetId: bill.id, jenisTarget: "TAGIHAN", nominalLama: bill.nominalTagihan, nominalBaru, selisih: nominalBaru - bill.nominalTagihan, alasanWajib: reason, diubahOlehId: actor.id } });
          await tx.tagihan.update({ where: { id: bill.id }, data: { nominalTagihan: nominalBaru, status: StatusTagihan.LUNAS } });
          diperbarui++;
        }
      }
      const note = aktif ? (student.statusMukim === StatusMukim.NON_MUKIM ? "Dispensasi Infaq Makan: santri kalong" : "Dispensasi Infaq Makan: yatim piatu") : null;
      await tx.santri.update({ where: { id: santriId }, data: { isDispensasiInfaq: aktif, catatanDispensasi: note } });
      return { aktif, diperbarui };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return jsonData({ item: { santriId, ...result } });
  } catch (error) { return errorResponse(error); }
}
