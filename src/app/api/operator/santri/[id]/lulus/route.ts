import { NextRequest } from "next/server";
import { Prisma, StatusSantri } from "@prisma/client";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const schema = z.object({ tahunLulus: z.number().int().min(1900).max(2200).optional() }).strict().default({});
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await requireDataIndukOperator(request);
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Tahun kelulusan tidak valid.", parsed.error.flatten());
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(981700011)`;
      const student = await tx.santri.findUnique({ where: { id: params.id }, select: { id: true, nis: true, name: true, tahunMasuk: true, statusSantri: true } });
      if (!student) throw new AppError(404, "SANTRI_NOT_FOUND", "Santri tidak ditemukan.");
      if (student.statusSantri === StatusSantri.ALUMNI) throw new AppError(409, "SUDAH_ALUMNI", "Santri sudah berstatus alumni.");
      const year = parsed.data.tahunLulus ?? new Date().getFullYear();
      if (year < student.tahunMasuk) throw new AppError(400, "TAHUN_INVALID", "Tahun lulus tidak boleh sebelum tahun masuk.");
      const count = await tx.santri.count({ where: { nomorSyahadah: { startsWith: `SYH/NH/${year}/` } } });
      const nomorSyahadah = `SYH/NH/${year}/${String(count + 1).padStart(4, "0")}`;
      const updated = await tx.santri.update({ where: { id: student.id }, data: { statusSantri: StatusSantri.ALUMNI, statusAktif: false, tahunLulus: year, nomorSyahadah }, select: { id: true, nis: true, name: true, statusSantri: true, tahunLulus: true, nomorSyahadah: true } });
      await tx.riwayatMutasiSantri.create({ data: { santriId: student.id, jenisMutasi: "KELULUSAN_ALUMNI", keterangan: `Lulus tahun ${year}; syahadah ${nomorSyahadah}.`, tanggalMutasi: new Date(`${year}-06-30T00:00:00.000Z`), dicatatOleh: actor.name } });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
    return jsonData({ item: result });
  } catch (error) { return errorResponse(error); }
}
