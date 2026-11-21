import { Prisma, Role, type RaporSantri } from "@prisma/client";
import type { z } from "zod";
import type { JenisKegiatan, RekapKehadiran } from "@/lib/api-types";
import type { NilaiRow, PeriodeAkademik, RaporDetail, RaporIsi, RaporRosterItem, RaporSummary } from "@/lib/akademik-types";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { mapelSchema, nilaiMassalSchema, nilaiQuerySchema, raporSchema } from "@/lib/validators/akademik";

export const AKADEMIK_ROLES = [Role.OPERATOR, Role.USTADZ_PENGURUS] as const;
export const MAPEL_INCLUDE = { pengampu: { select: { id: true, namaLengkap: true } } } satisfies Prisma.MataPelajaranInclude;
const SANTRI_RINGKAS = { id: true, nis: true, name: true, kelas: true } satisfies Prisma.SantriSelect;
const NILAI_SELECT = { id: true, santriId: true, nilaiHarian: true, nilaiUTS: true, nilaiUAS: true, nilaiAkhir: true, predikat: true, catatanGuru: true } satisfies Prisma.NilaiUlanganSelect;

export function rentangSemester({ semester, tahunAjaran }: PeriodeAkademik) {
  const [awal, akhir] = tahunAjaran.split("/").map(Number);
  return semester === "GANJIL"
    ? { mulai: new Date(Date.UTC(awal, 6, 1)), sampai: new Date(Date.UTC(akhir, 0, 1)) }
    : { mulai: new Date(Date.UTC(akhir, 0, 1)), sampai: new Date(Date.UTC(akhir, 6, 1)) };
}

export function hitungNilai(harian: number, uts: number, uas: number) {
  const nilaiAkhir = Math.round(((harian + uts + uas) / 3) * 100) / 100;
  return { nilaiAkhir, predikat: nilaiAkhir >= 90 ? "A" : nilaiAkhir >= 80 ? "B" : nilaiAkhir >= 70 ? "C" : "D" };
}

async function kunciPeriode(tx: Prisma.TransactionClient, periode: PeriodeAkademik) {
  // Input nilai dan penerbitan harus membaca keadaan periode yang sama.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`akademik:${periode.tahunAjaran}:${periode.semester}`}))`;
}

export async function simpanMapel(input: z.infer<typeof mapelSchema>, id?: string) {
  return prisma.$transaction(async (tx) => {
    const guru = await tx.guruDanTendik.findUnique({ where: { id: input.pengampuId }, select: { statusAktif: true } });
    if (!guru?.statusAktif) throw new AppError(422, "PENGAMPU_TIDAK_VALID", "Pilih guru atau ustadz yang aktif.");
    return id
      ? tx.mataPelajaran.update({ where: { id }, data: input, include: MAPEL_INCLUDE })
      : tx.mataPelajaran.create({ data: input, include: MAPEL_INCLUDE });
  });
}

export async function daftarNilai(input: z.infer<typeof nilaiQuerySchema>) {
  const { mapelId, kelas, semester, tahunAjaran } = input;
  const mapel = await prisma.mataPelajaran.findUnique({ where: { id: mapelId }, include: MAPEL_INCLUDE });
  if (!mapel) throw new AppError(404, "MAPEL_NOT_FOUND", "Mata pelajaran tidak ditemukan.");
  const rows = await prisma.santri.findMany({
    where: { kelas, statusAktif: true },
    select: { ...SANTRI_RINGKAS, nilaiUlangan: { where: { mapelId, semester, tahunAjaran }, select: NILAI_SELECT }, rapor: { where: { semester, tahunAjaran }, select: { statusRapor: true } } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const items: NilaiRow[] = rows.map(({ nilaiUlangan, rapor, ...santri }) => ({ santri, nilai: nilaiUlangan[0] ?? null, diterbitkan: rapor[0]?.statusRapor === "DITERBITKAN" }));
  return { items, mapel };
}

export async function simpanNilai(input: z.infer<typeof nilaiMassalSchema>) {
  const { kelas, mapelId, semester, tahunAjaran, items } = input;
  return prisma.$transaction(async (tx) => {
    await kunciPeriode(tx, input);
    const mapel = await tx.mataPelajaran.findUnique({ where: { id: mapelId }, select: { id: true } });
    if (!mapel) throw new AppError(404, "MAPEL_NOT_FOUND", "Mata pelajaran tidak ditemukan.");
    const ids = items.map((item) => item.santriId);
    const count = await tx.santri.count({ where: { id: { in: ids }, kelas, statusAktif: true } });
    if (count !== ids.length) throw new AppError(422, "KELAS_TIDAK_SESUAI", "Semua santri harus aktif dan berada pada kelas yang dipilih.");
    const terbit = await tx.raporSantri.count({ where: { santriId: { in: ids }, semester, tahunAjaran, statusRapor: "DITERBITKAN" } });
    if (terbit) throw new AppError(409, "RAPOR_TERBIT", "Tarik rapor ke draft sebelum mengubah nilai santri yang sudah diterbitkan.");
    for (const item of items) {
      const data = { ...item, ...hitungNilai(item.nilaiHarian, item.nilaiUTS, item.nilaiUAS), catatanGuru: item.catatanGuru || null };
      await tx.nilaiUlangan.upsert({
        where: { santriId_mapelId_semester_tahunAjaran: { santriId: item.santriId, mapelId, semester, tahunAjaran } },
        create: { ...data, mapelId, semester, tahunAjaran },
        update: data,
      });
    }
    return { tersimpan: items.length };
  }, { timeout: 120_000, maxWait: 15_000 });
}

export function ringkasanRapor(row: RaporSantri): RaporSummary {
  return { id: row.id, semester: row.semester, tahunAjaran: row.tahunAjaran, statusRapor: row.statusRapor, tanggalTerbit: row.tanggalTerbit?.toISOString() ?? null };
}

export async function daftarRapor(input: PeriodeAkademik & { kelas: string }) {
  const { kelas, semester, tahunAjaran } = input;
  const rows = await prisma.santri.findMany({ where: { kelas }, select: { ...SANTRI_RINGKAS, rapor: { where: { semester, tahunAjaran } } }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const items: RaporRosterItem[] = rows.map(({ rapor, ...santri }) => ({ santri, rapor: rapor[0] ? ringkasanRapor(rapor[0]) : null }));
  return { items };
}

const rekapKosong = (): RekapKehadiran => ({ HADIR: 0, SAKIT: 0, IZIN: 0, ALPA: 0, total: 0 });

async function susunIsiRapor(tx: Prisma.TransactionClient, santriId: string, periode: PeriodeAkademik): Promise<RaporIsi> {
  const santri = await tx.santri.findUnique({
    where: { id: santriId },
    select: { ...SANTRI_RINGKAS, nisn: true, tempatLahir: true, tanggalLahir: true, fotoSantriUrl: true, namaWali: true, wali: { select: { name: true } } },
  });
  if (!santri) throw new AppError(404, "SANTRI_NOT_FOUND", "Data santri tidak ditemukan.");
  const { mulai, sampai } = rentangSemester(periode);
  const tanggal = { gte: mulai, lt: sampai };
  const [nilai, logs, pelanggaran] = await Promise.all([
    tx.nilaiUlangan.findMany({ where: { santriId, ...periode }, select: { ...NILAI_SELECT, mapel: { include: MAPEL_INCLUDE } }, orderBy: { mapel: { namaMapel: "asc" } } }),
    tx.logAkademikDanNgaji.groupBy({ by: ["jenisKegiatan", "statusKehadiran"], where: { santriId, tanggal }, _count: { _all: true } }),
    tx.logPelanggaran.findMany({ where: { santriId, tanggal }, select: { tanggal: true, kategori: true, deskripsiPelanggaran: true, poin: true, tindakanPembinaan: true }, orderBy: { tanggal: "asc" } }),
  ]);
  const absensi: Record<JenisKegiatan, RekapKehadiran> = { SHOLAT_JEMAAH: rekapKosong(), NGAJI_KITAB: rekapKosong(), TAHFIDZ: rekapKosong(), SEKOLAH_FORMAL: rekapKosong() };
  const totalAbsensi = rekapKosong();
  for (const log of logs) {
    absensi[log.jenisKegiatan][log.statusKehadiran] += log._count._all;
    absensi[log.jenisKegiatan].total += log._count._all;
    totalAbsensi[log.statusKehadiran] += log._count._all;
    totalAbsensi.total += log._count._all;
  }
  const { wali, tanggalLahir, ...biodata } = santri;
  return {
    santri: { ...biodata, tanggalLahir: tanggalLahir.toISOString().slice(0, 10), namaWali: santri.namaWali || wali.name },
    periode: { ...periode, mulai: mulai.toISOString().slice(0, 10), selesai: new Date(sampai.getTime() - 86_400_000).toISOString().slice(0, 10) },
    nilai: nilai.map((row) => ({ ...row, mapel: { id: row.mapel.id, kodeMapel: row.mapel.kodeMapel, namaMapel: row.mapel.namaMapel, kategori: row.mapel.kategori, kkm: row.mapel.kkm, pengampuId: row.mapel.pengampuId, pengampu: row.mapel.pengampu }, tuntas: row.nilaiAkhir >= row.mapel.kkm })),
    absensi,
    totalAbsensi,
    pelanggaran: pelanggaran.map((row) => ({ tanggal: row.tanggal.toISOString().slice(0, 10), kategori: row.kategori, deskripsi: row.deskripsiPelanggaran, poin: row.poin, tindakan: row.tindakanPembinaan })),
    totalPoin: pelanggaran.reduce((total, row) => total + row.poin, 0),
  };
}

async function detailRapor(tx: Prisma.TransactionClient, row: RaporSantri | null, santriId: string, periode: PeriodeAkademik): Promise<RaporDetail> {
  const isi = row?.statusRapor === "DITERBITKAN"
    ? row.snapshot as unknown as RaporIsi
    : await susunIsiRapor(tx, santriId, periode);
  return { ...periode, id: row?.id ?? null, statusRapor: row?.statusRapor ?? "DRAFT", catatanWaliKelas: row?.catatanWaliKelas ?? "", keputusanKenaikan: row?.keputusanKenaikan ?? "", tanggalTerbit: row?.tanggalTerbit?.toISOString() ?? null, isi };
}

export async function previewRapor(input: PeriodeAkademik & { santriId: string }) {
  const { santriId, ...periode } = input;
  return prisma.$transaction(async (tx) => {
    const row = await tx.raporSantri.findUnique({ where: { santriId_semester_tahunAjaran: input } });
    return detailRapor(tx, row, santriId, periode);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}

export async function simpanRapor(input: z.infer<typeof raporSchema>) {
  const { santriId, semester, tahunAjaran, statusRapor, catatanWaliKelas, keputusanKenaikan } = input;
  const periode = { semester, tahunAjaran };
  return prisma.$transaction(async (tx) => {
    await kunciPeriode(tx, periode);
    const key = { santriId, ...periode };
    const existing = await tx.raporSantri.findUnique({ where: { santriId_semester_tahunAjaran: key } });
    if (existing?.statusRapor === "DITERBITKAN" && statusRapor === "DITERBITKAN") throw new AppError(409, "RAPOR_TERBIT", "Rapor sudah terbit. Tarik ke draft untuk melakukan perubahan.");
    const isi = await susunIsiRapor(tx, santriId, periode);
    if (statusRapor === "DITERBITKAN" && !isi.nilai.length) throw new AppError(422, "NILAI_KOSONG", "Isi setidaknya satu nilai lengkap sebelum menerbitkan rapor.");
    const data = { statusRapor, catatanWaliKelas, keputusanKenaikan, tanggalTerbit: statusRapor === "DITERBITKAN" ? new Date() : null, snapshot: statusRapor === "DITERBITKAN" ? isi as unknown as Prisma.InputJsonValue : Prisma.DbNull };
    const row = await tx.raporSantri.upsert({ where: { santriId_semester_tahunAjaran: key }, create: { ...key, ...data }, update: data });
    return { ...periode, id: row.id, statusRapor: row.statusRapor, catatanWaliKelas: row.catatanWaliKelas, keputusanKenaikan: row.keputusanKenaikan, tanggalTerbit: row.tanggalTerbit?.toISOString() ?? null, isi } satisfies RaporDetail;
  }, { timeout: 30_000, maxWait: 15_000 });
}

export async function bacaRapor(id: string, actor: { id: string; role: Role }) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.raporSantri.findFirst({ where: { id, ...(actor.role === Role.WALI_SANTRI ? { statusRapor: "DITERBITKAN", santri: { waliId: actor.id } } : {}) } });
    if (!row) throw new AppError(404, "RAPOR_NOT_FOUND", "Rapor tidak ditemukan atau belum diterbitkan.");
    return detailRapor(tx, row, row.santriId, { semester: row.semester, tahunAjaran: row.tahunAjaran });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 });
}
