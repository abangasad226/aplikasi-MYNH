import * as XLSX from "xlsx";
import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import type { ImportReport } from "@/lib/api-types";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createSantriBatch } from "@/lib/data-induk/santri-service";
import { cellText } from "@/lib/data-induk/excel";
import { santriCreateSchema, type SantriCreatePayload } from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_ERRORS = 100;
const text = (value: unknown) => cellText(value).trim();
const optional = (value: unknown) => text(value) || undefined;

function dateKey(value: unknown): string | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const raw = text(value);
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const parsed = XLSX.SSF.parse_date_code(Number(raw));
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(raw);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime()) && parsed.getFullYear() >= 1900 && parsed.getFullYear() <= 2200) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  return undefined;
}
function parentBirth(value: unknown) {
  const raw = text(value);
  const match = /^(.*?)[,;.]\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})$/.exec(raw);
  return match ? { place: match[1].trim(), date: dateKey(match[2]) } : { place: raw || undefined, date: undefined };
}
function addressParts(address: string) {
  const extract = (pattern: RegExp) => pattern.exec(address)?.[1]?.trim().replace(/\s+/g, " ");
  return {
    rtRw: (() => { const value = extract(/\b(?:RT\s*\/\s*RW|RT\s*\/RW|RT\/RW)\s*([^,;]+)/i); return value && value.length <= 20 ? value : undefined; })(),
    desaKelurahan: (() => { const value = extract(/\b(?:Ds\.?|Desa|Kel\.?|Kelurahan)\s*([^,;]+)/i); return value && value.length >= 2 ? value : "Belum diverifikasi"; })(),
    kecamatan: (() => { const value = extract(/\b(?:Kec\.?|Kecamatan)\s*([^,;]+)/i); return value && value.length >= 2 ? value : "Belum diverifikasi"; })(),
    kabupatenKota: (() => { const value = extract(/\b(?:Kab\.?|Kabupaten|Kota)\s*([^,;]+)/i); return value && value.length >= 2 ? value : "Belum diverifikasi"; })(),
    provinsi: "Belum diverifikasi",
  };
}
function education(value: unknown): string | undefined {
  const raw = text(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!raw) return undefined;
  if (raw.includes("SLTP") || raw === "SMP") return "SMP";
  if (raw.includes("SLTA") || raw.includes("SMA") || raw.includes("SMK") || raw === "MA") return "SMA_MA";
  if (raw === "SD" || raw === "MI") return "SD";
  if (["D3", "S1", "S2", "S3"].includes(raw)) return raw;
  return undefined;
}
function cleanId(value: unknown, formatted?: unknown) {
  if (typeof value === "number" && Math.abs(value) > Number.MAX_SAFE_INTEGER) return undefined;
  const raw = text(formatted ?? value);
  return /^\d{16}$/.test(raw) ? raw : undefined;
}
function dateParts(value: unknown) {
  const parsed = parentBirth(value);
  return { tempat: parsed.place, tanggal: parsed.date ? new Date(`${parsed.date}T00:00:00.000Z`) : undefined };
}

export async function POST(request: NextRequest) {
  try {
    await requireRoles(request, [Role.OPERATOR]);
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new AppError(400, "FILE_KOSONG", "Pilih file Excel terlebih dahulu.");
    if (file.size > MAX_FILE_BYTES) throw new AppError(413, "FILE_TERLALU_BESAR", "Ukuran file maksimal 5 MB.");
    if (!/\.(xlsx|xls)$/i.test(file.name)) throw new AppError(400, "FORMAT_FILE_SALAH", "File harus berformat Excel .xlsx atau .xls.");
    const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
    const [existing, sheets] = await Promise.all([
      prisma.santri.findMany({ select: { nis: true, nik: true, nisn: true } }),
      Promise.resolve(workbook.SheetNames.filter((name) => /^(MTs|MA)$/i.test(name))),
    ]);
    if (!sheets.length) throw new AppError(400, "SHEET_TIDAK_DITEMUKAN", "Workbook harus memiliki sheet MTs dan/atau MA.");
    const existingNis = new Set(existing.map((item) => item.nis));
    const existingNik = new Set(existing.map((item) => item.nik));
    const existingNisn = new Set(existing.map((item) => item.nisn).filter((item): item is string => Boolean(item)));
    const fileNis = new Set<string>(); const fileNik = new Set<string>(); const fileNisn = new Set<string>();
    const valid: SantriCreatePayload[] = [];
    const errors: ImportReport["errors"] = [];
    let totalBaris = 0;
    const recordError = (baris: number, pesan: string) => { if (errors.length < MAX_ERRORS) errors.push({ baris, pesan }); };

    for (const sheetName of sheets) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: false });
      const formattedRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
      const level = sheetName.toUpperCase();
      const levelCode = level === "MTS" ? "MTS" : "MA";
      for (let index = 3; index < rows.length; index++) {
        const row = rows[index] ?? [];
        const display = formattedRows[index] ?? [];
        const name = text(row[2]);
        if (!name) continue;
        totalBaris++;
        if (totalBaris > MAX_ROWS) throw new AppError(413, "TERLALU_BANYAK_BARIS", `Maksimal ${MAX_ROWS} baris data per unggahan.`);
        const sourceNo = Number(text(row[0])) || index - 2;
        const nis = `${levelCode}-${String(sourceNo).padStart(4, "0")}`;
        const dateBirth = dateKey(row[6]);
        const dateAdmitted = dateKey(row[27]);
        const dateLeft = dateKey(row[29]);
        const address = text(row[22]) || "Alamat belum tersedia di arsip lama";
        const parts = addressParts(address);
        const ayahBorn = parentBirth(row[13]);
        const ibuBorn = parentBirth(row[18]);
        const yearEntered = dateAdmitted ? Number(dateAdmitted.slice(0, 4)) : new Date().getFullYear();
        const notes = [
          "NIS dibuat otomatis dari jenjang dan nomor urut sumber karena file tidak menyediakan kolom NIS.",
          "Kamar, status mukim, dan wilayah administratif perlu diverifikasi Operator.",
          !dateAdmitted ? "Tahun masuk sementara menggunakan tahun impor karena tanggal diterima kosong." : "",
          "Kolom PASS di file sumber sengaja tidak diimpor.",
        ].filter(Boolean).join(" ");
        const payload = {
          nis,
          nik: cleanId(row[10], display[10]) ?? "",
          nisn: /^\d{10}$/.test(text(display[1] ?? row[1])) ? text(display[1] ?? row[1]) : undefined,
          name,
          kelas: text(row[4]) || "Belum ditentukan",
          kamar: "Belum diverifikasi",
          tempatLahir: text(row[5]) || "Belum diketahui",
          tanggalLahir: dateBirth ?? "",
          jenisKelamin: /^P(?:EREMPUAN)?$/i.test(text(row[3])) ? "PEREMPUAN" : "LAKI_LAKI",
          alamatLengkap: address,
          ...parts,
          nomorKK: cleanId(row[11], display[11]) ?? "",
          namaAyah: text(row[12]) || "Belum diketahui",
          nikAyah: cleanId(row[14], display[14]),
          tempatLahirAyah: ayahBorn.place,
          tanggalLahirAyah: ayahBorn.date,
          pendidikanAyah: education(row[15]),
          pekerjaanAyah: optional(row[16]),
          namaIbu: text(row[17]) || "Belum diketahui",
          nikIbu: cleanId(row[19], display[19]),
          tempatLahirIbu: ibuBorn.place,
          tanggalLahirIbu: ibuBorn.date,
          pendidikanIbu: education(row[20]),
          pekerjaanIbu: optional(row[21]),
          statusMukim: "MUKIM",
          statusSantri: "AKTIF",
          tahunMasuk: yearEntered,
          nomorUrutAsal: sourceNo,
          jenjangAsal: levelCode,
          anakKe: Number(text(row[8])) || undefined,
          dariSaudara: Number(text(row[9])) || undefined,
          noIjazahSebelumnya: optional(row[24]),
          noPesertaUjianSebelumnya: optional(row[23]),
          noSkhunSebelumnya: optional(row[25]),
          diterimaDiKelas: optional(row[26]),
          tanggalDiterima: dateAdmitted,
          keluarDiKelas: optional(row[28]),
          tanggalKeluar: dateLeft,
          alasanKeluar: optional(row[30]),
          nomorKartuPip: optional(row[31]),
          kks: optional(row[32]), kps: optional(row[33]), pkh: optional(row[34]),
          catatanDataLegacy: notes,
        };
        const parsed = santriCreateSchema.safeParse(payload);
        if (!parsed.success) { recordError(index + 1, `${levelCode}: ${parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`); continue; }
        const student = parsed.data;
        const duplicate: string[] = [];
        if (existingNis.has(student.nis) || fileNis.has(student.nis)) duplicate.push("NIS");
        if (existingNik.has(student.nik) || fileNik.has(student.nik)) duplicate.push("NIK");
        if (student.nisn && (existingNisn.has(student.nisn) || fileNisn.has(student.nisn))) duplicate.push("NISN");
        if (duplicate.length) { recordError(index + 1, `${levelCode}: duplikat ${duplicate.join(", ")}; baris dilewati agar data tidak tertimpa.`); continue; }
        fileNis.add(student.nis); fileNik.add(student.nik); if (student.nisn) fileNisn.add(student.nisn);
        valid.push(student);
      }
    }
    const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";
    const berhasil = dryRun ? 0 : await createSantriBatch(valid);
    return jsonData({ jenis: "santri", totalBaris, berhasil, siapDiimpor: valid.length, dryRun, gagal: totalBaris - (dryRun ? valid.length : berhasil), errors, warnings: ["Akun wali dibuat dengan email internal berbasis NIS dan password awal NIS karena spreadsheet tidak berisi nomor HP/email wali. Operator harus melengkapi kontak sebelum membagikan akses.", "NIS dibuat otomatis; kamar, status mukim, wilayah administratif, dan tahun masuk default perlu diverifikasi. Kolom PASS diabaikan."] });
  } catch (error) { return errorResponse(error); }
}
