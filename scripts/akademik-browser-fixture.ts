import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";

const db = new PrismaClient();
const statePath = resolve("scripts/akademik-browser-state.json");
type Fixture = { santriIds: string[]; guruId: string; kelas: string; kodeMapel: string; semester: string; tahunAjaran: string };
async function main() {
  if (process.argv[2] === "cleanup") {
    const state = JSON.parse(await readFile(statePath, "utf8")) as Fixture;
    await db.$transaction(async (tx) => {
      await tx.raporSantri.deleteMany({ where: { santriId: { in: state.santriIds } } });
      await tx.nilaiUlangan.deleteMany({ where: { santriId: { in: state.santriIds } } });
      await tx.mataPelajaran.deleteMany({ where: { pengampuId: state.guruId } });
      await tx.logAkademikDanNgaji.deleteMany({ where: { santriId: { in: state.santriIds } } });
      await tx.logPelanggaran.deleteMany({ where: { santriId: { in: state.santriIds } } });
      await tx.santri.deleteMany({ where: { id: { in: state.santriIds }, kelas: state.kelas } });
      await tx.guruDanTendik.delete({ where: { id: state.guruId } });
    });
    await unlink(statePath);
    console.log("Browser fixtures cleaned; existing data unchanged.");
    return;
  }
  const wali = await db.user.findUniqueOrThrow({ where: { email: "wali@pesantren.test" } });
  const actor = await db.user.findUniqueOrThrow({ where: { email: "ustadz@pesantren.test" } });
  const suffix = randomBytes(4).toString("hex");
  const base = Date.now().toString();
  const state = await db.$transaction(async (tx) => {
    const guru = await tx.guruDanTendik.create({ data: {
      namaLengkap: `Guru Uji Browser ${suffix}`, nik: `900${base}`, tempatLahir: "Pangauban", tanggalLahir: new Date("1980-01-01T00:00:00Z"), jenisKelamin: "LAKI_LAKI", pendidikanTerakhir: "S1", jabatan: "GURU_MAPEL", statusKepegawaian: "GTY", noHp: "080000000000", alamat: "Data uji sementara", tanggalMulaiTugas: new Date("2026-07-01T00:00:00Z"),
    } });
    const kelas = `UJI-RAPOR-${suffix}`;
    const santriIds: string[] = [];
    for (let index = 0; index < 2; index++) {
      const row = await tx.santri.create({ data: {
        nis: `UJI-${suffix}-${index}`, nik: `${index}91${base}`, barcodeCode: `UJI-${suffix}-${index}`, name: `Santri Uji Rapor ${index + 1}`, kelas, kamar: "UJI", waliId: wali.id, walletAddress: `0x${randomBytes(20).toString("hex")}`, walletIndex: 1_000_000_000 + randomBytes(4).readUInt32BE() % 900_000_000, tempatLahir: "Pangauban", tanggalLahir: new Date("2012-01-01T00:00:00Z"), jenisKelamin: "LAKI_LAKI", alamatLengkap: "Data uji sementara", desaKelurahan: "Pangauban", kecamatan: "Uji", kabupatenKota: "Uji", provinsi: "Jawa Barat", nomorKK: "9000000000000000", namaAyah: "Ayah Uji", namaIbu: "Ibu Uji", tahunMasuk: 2026,
      } });
      santriIds.push(row.id);
      await tx.logAkademikDanNgaji.createMany({ data: (["SHOLAT_JEMAAH", "NGAJI_KITAB", "TAHFIDZ", "SEKOLAH_FORMAL"] as const).map((jenisKegiatan) => ({ santriId: row.id, jenisKegiatan, tanggal: new Date("2026-11-01T00:00:00Z"), statusKehadiran: "HADIR", catatanUstadz: "Log uji browser" })) });
      if (!index) await tx.logPelanggaran.create({ data: { santriId: row.id, tanggal: new Date("2026-11-02T00:00:00Z"), kategori: "RINGAN", deskripsiPelanggaran: "Catatan uji kedisiplinan", poin: 2, tindakanPembinaan: "Pembinaan uji", dicatatOlehId: actor.id } });
    }
    return { santriIds, guruId: guru.id, kelas, kodeMapel: `UJI-${suffix.toUpperCase()}`, semester: "GANJIL", tahunAjaran: "2026/2027" };
  }, { timeout: 30_000 });
  await writeFile(statePath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state));
}
main().catch(() => { console.error("Browser fixture operation failed; inspect fixture state before retrying."); process.exitCode = 1; }).finally(() => db.$disconnect());
