import { z } from "zod";

export const semesterSchema = z.enum(["GANJIL", "GENAP"]);
export const tahunAjaranSchema = z.string().regex(/^20\d{2}\/20\d{2}$/, "Gunakan format 2026/2027.").refine((value) => {
  const [awal, akhir] = value.split("/").map(Number);
  return akhir === awal + 1;
}, "Tahun ajaran harus berurutan, misalnya 2026/2027.");
export const periodeSchema = z.object({ semester: semesterSchema, tahunAjaran: tahunAjaranSchema });
const id = z.string().cuid();
const skor = z.number().int().min(0).max(100);
export const mapelSchema = z.object({
  kodeMapel: z.string().trim().min(1).max(30).regex(/^[a-zA-Z0-9._-]+$/).transform((v) => v.toUpperCase()),
  namaMapel: z.string().trim().min(2).max(120),
  kategori: z.enum(["SEKOLAH_FORMAL", "NGAJI_DINIYAH", "TAHFIDZ"]),
  kkm: skor.default(75),
  pengampuId: id,
}).strict();
export const kelasPeriodeSchema = periodeSchema.extend({ kelas: z.string().trim().min(1).max(100) }).strict();
export const nilaiQuerySchema = kelasPeriodeSchema.extend({ mapelId: id }).strict();
export const nilaiMassalSchema = nilaiQuerySchema.extend({
  items: z.array(z.object({
    santriId: id,
    nilaiHarian: skor,
    nilaiUTS: skor,
    nilaiUAS: skor,
    catatanGuru: z.string().trim().max(2000).nullable(),
  }).strict()).min(1).max(500),
}).strict().refine((input) => new Set(input.items.map((row) => row.santriId)).size === input.items.length, "Santri tidak boleh duplikat dalam satu pengiriman.");
export const previewQuerySchema = periodeSchema.extend({ santriId: id }).strict();
export const raporSchema = previewQuerySchema.extend({
  catatanWaliKelas: z.string().trim().max(4000),
  keputusanKenaikan: z.string().trim().max(200),
  statusRapor: z.enum(["DRAFT", "DITERBITKAN"]),
}).strict().refine((input) => input.statusRapor !== "DITERBITKAN" || input.keputusanKenaikan.length > 0, { path: ["keputusanKenaikan"], message: "Keputusan kenaikan wajib diisi sebelum rapor diterbitkan." });
export const waliRaporQuerySchema = z.object({ santriId: id }).strict();
