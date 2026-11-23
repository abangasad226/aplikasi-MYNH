import { NextRequest } from "next/server";
import { Role } from "@prisma/client";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireRoles(request, [Role.OPERATOR, Role.BENDAHARA, Role.USTADZ_PENGURUS, Role.KASIR_KANTIN]);
    const student = await prisma.santri.findUnique({
      where: { id: params.id },
      include: {
        wali: { select: { id: true, name: true, email: true, phone: true } },
        tagihan: { include: { jenisPembayaranKustom: { select: { nama: true } } }, orderBy: [{ tahun: "desc" }, { bulan: "desc" }], take: 50 },
        transaksi: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, jenisTransaksi: true, nominal: true, keterangan: true, createdAt: true, metodePembayaran: true } },
        logAkademik: { orderBy: { tanggal: "desc" }, take: 50 },
        nilaiUlangan: { orderBy: { createdAt: "desc" }, take: 50 },
        auditPenyesuaianKeuangan: { include: { diubahOleh: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
    if (!student) throw new AppError(404, "SANTRI_NOT_FOUND", "Santri tidak ditemukan.");
    const user = actor.role === Role.OPERATOR ? { id: student.wali.id, name: student.wali.name, email: student.wali.email, phone: student.wali.phone } : undefined;
    return jsonData({ item: {
      ...student,
      wali: user,
      saldoJajan: student.saldoJajan.toString(), limitJajanHarian: student.limitJajanHarian.toString(),
      tagihan: student.tagihan.map((bill) => ({ ...bill, nominalTagihan: bill.nominalTagihan.toString(), nominalTerbayar: bill.nominalTerbayar.toString() })),
      transaksi: student.transaksi.map((tx) => ({ ...tx, nominal: tx.nominal.toString() })),
      riwayatKeuangan: actor.role === Role.BENDAHARA ? student.tagihan.map((bill) => ({ ...bill, nominalTagihan: bill.nominalTagihan.toString(), nominalTerbayar: bill.nominalTerbayar.toString() })) : undefined,
      riwayatAkademik: actor.role === Role.USTADZ_PENGURUS ? { absensi: student.logAkademik, nilai: student.nilaiUlangan } : undefined,
      informasiKantin: actor.role === Role.KASIR_KANTIN ? { saldoJajan: student.saldoJajan.toString(), transaksi: student.transaksi.filter((tx) => tx.jenisTransaksi === "JAJAN_KANTIN") } : undefined,
      kelengkapanBerkas: actor.role === Role.OPERATOR ? { fotoSantriUrl: student.fotoSantriUrl, fileKkUrl: student.fileKkUrl, fileAktaUrl: student.fileAktaUrl, fileIjazahUrl: student.fileIjazahUrl } : undefined,
      auditPenyesuaianKeuangan: actor.role === Role.BENDAHARA ? student.auditPenyesuaianKeuangan.map((entry) => ({ ...entry, nominalLama: entry.nominalLama.toString(), nominalBaru: entry.nominalBaru.toString(), selisih: entry.selisih.toString() })) : undefined,
    } });
  } catch (error) { return errorResponse(error); }
}
