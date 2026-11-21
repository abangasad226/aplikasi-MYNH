import { NextRequest } from "next/server";
import { Role, JenisTagihan, Prisma } from "@prisma/client";
import { z } from "zod";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  nama: z.string().trim().min(2).max(120),
  nominal: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  jatuhTempo: z.string().date(),
  target: z.enum(["SEMUA", "KELAS", "PILIH"]),
  kelas: z.string().trim().max(50).optional(),
  santriIds: z.array(z.string().min(1)).max(2000).optional(),
  keterangan: z.string().trim().max(500).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.target === "KELAS" && !data.kelas) ctx.addIssue({ code: "custom", path: ["kelas"], message: "Pilih kelas." });
  if (data.target === "PILIH" && !data.santriIds?.length) ctx.addIssue({ code: "custom", path: ["santriIds"], message: "Pilih minimal satu santri." });
});

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.BENDAHARA]);
    const [students, classes] = await Promise.all([
      prisma.santri.findMany({ where: { statusAktif: true }, select: { id: true, name: true, nis: true, kelas: true }, orderBy: { name: "asc" } }),
      prisma.santri.findMany({ where: { statusAktif: true }, distinct: ["kelas"], select: { kelas: true }, orderBy: { kelas: "asc" } }),
    ]);
    return jsonData({ students, classes: classes.map((row) => row.kelas) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [Role.BENDAHARA]);
    const parsed = schema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Data tagihan insidental tidak valid.", parsed.error.flatten());
    const data = parsed.data;
    const where: Prisma.SantriWhereInput = { statusAktif: true };
    if (data.target === "KELAS") where.kelas = data.kelas;
    if (data.target === "PILIH") where.id = { in: data.santriIds };
    const students = await prisma.santri.findMany({ where, select: { id: true } });
    if (!students.length) throw new AppError(400, "TARGET_KOSONG", "Tidak ada santri aktif pada target yang dipilih.");
    const year = new Date(`${data.jatuhTempo}T00:00:00.000Z`).getUTCFullYear();
    const result = await prisma.$transaction(async (tx) => {
      const category = await tx.jenisPembayaranKustom.create({ data: { nama: data.nama, nominal: BigInt(data.nominal), jatuhTempo: new Date(`${data.jatuhTempo}T00:00:00.000Z`), keterangan: data.keterangan || null, dibuatOlehId: actor.id } });
      await tx.tagihan.createMany({ data: students.map(({ id }) => ({ santriId: id, jenisPembayaranKustomId: category.id, jenisTagihan: JenisTagihan.LAINNYA, bulan: new Date(`${data.jatuhTempo}T00:00:00.000Z`).getUTCMonth() + 1, tahun: year, nominalTagihan: BigInt(data.nominal), jatuhTempo: new Date(`${data.jatuhTempo}T00:00:00.000Z`) })) });
      return category;
    });
    return jsonData({ item: { id: result.id, nama: result.nama, jumlahSantri: students.length } }, 201);
  } catch (error) { return errorResponse(error); }
}
