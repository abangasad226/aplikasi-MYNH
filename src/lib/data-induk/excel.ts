import * as XLSX from "xlsx";

import type { GuruItem, SantriItem } from "@/lib/api-types";
import { AppError } from "@/lib/errors";

export type ExcelJenis = "santri" | "guru";

export const SANTRI_EXCEL_HEADERS = [
  "NIS",
  "NIK",
  "NISN",
  "NISM",
  "Nama Lengkap",
  "Tempat Lahir",
  "Tanggal Lahir (YYYY-MM-DD)",
  "Jenis Kelamin (LAKI_LAKI/PEREMPUAN)",
  "Kelas",
  "Kamar",
  "Alamat Lengkap",
  "RT/RW",
  "Desa/Kelurahan",
  "Kecamatan",
  "Kabupaten/Kota",
  "Provinsi",
  "Nomor KK",
  "Nama Ayah",
  "NIK Ayah",
  "Pekerjaan Ayah",
  "Nama Ibu",
  "NIK Ibu",
  "Pekerjaan Ibu",
  "Status Mukim (MUKIM/NON_MUKIM)",
  "Status Santri (AKTIF/ALUMNI/PINDAH/DROPOUT)",
  "Tahun Masuk",
  "Tahun Lulus",
  "Nomor Syahadah",
  "RFID UID",
  "Barcode",
  "Email Wali",
] as const;

export const GURU_EXCEL_HEADERS = [
  "NIK",
  "NIP",
  "NUPTK",
  "NPK",
  "Nama Lengkap",
  "Gelar Depan",
  "Gelar Belakang",
  "Tempat Lahir",
  "Tanggal Lahir (YYYY-MM-DD)",
  "Jenis Kelamin (LAKI_LAKI/PEREMPUAN)",
  "Pendidikan Terakhir (TIDAK_SEKOLAH/SD/SMP/SMA_MA/D3/S1/S2/S3/PESANTREN_SALAF)",
  "Jurusan",
  "Jabatan (PENGASUH/KEPALA_MADRASAH/USTADZ_NGAJI/GURU_MAPEL/BENDAHARA/STAF_TATA_USAHA)",
  "Status Kepegawaian (GTY/GTT/PNS_DPK/PENGABDIAN)",
  "Mapel/Kitab",
  "No HP",
  "Alamat",
  "Tanggal Mulai Tugas (YYYY-MM-DD)",
  "Status Aktif (YA/TIDAK)",
  "Email Akun",
] as const;

function santriRow(item: SantriItem): Array<string | number> {
  return [
    item.nis,
    item.nik,
    item.nisn ?? "",
    item.nism ?? "",
    item.name,
    item.tempatLahir,
    item.tanggalLahir,
    item.jenisKelamin,
    item.kelas,
    item.kamar,
    item.alamatLengkap,
    item.rtRw ?? "",
    item.desaKelurahan,
    item.kecamatan,
    item.kabupatenKota,
    item.provinsi,
    item.nomorKK,
    item.namaAyah,
    item.nikAyah ?? "",
    item.pekerjaanAyah ?? "",
    item.namaIbu,
    item.nikIbu ?? "",
    item.pekerjaanIbu ?? "",
    item.statusMukim,
    item.statusSantri,
    item.tahunMasuk,
    item.tahunLulus ?? "",
    item.nomorSyahadah ?? "",
    item.rfidUid ?? "",
    item.barcodeCode,
    item.wali.email,
  ];
}

function guruRow(item: GuruItem): Array<string | number> {
  return [
    item.nik,
    item.nip ?? "",
    item.nuptk ?? "",
    item.npk ?? "",
    item.namaLengkap,
    item.gelarDepan ?? "",
    item.gelarBelakang ?? "",
    item.tempatLahir,
    item.tanggalLahir,
    item.jenisKelamin,
    item.pendidikanTerakhir,
    item.jurusan ?? "",
    item.jabatan,
    item.statusKepegawaian,
    item.mataPelajaranAtauKitab ?? "",
    item.noHp,
    item.alamat,
    item.tanggalMulaiTugas,
    item.statusAktif ? "YA" : "TIDAK",
    item.akun?.email ?? "",
  ];
}

function petunjukSheet(jenis: ExcelJenis): XLSX.WorkSheet {
  const rows: string[][] =
    jenis === "santri"
      ? [
          ["PETUNJUK PENGISIAN TEMPLATE DATA SANTRI"],
          ["1. Jangan mengubah nama kolom pada sheet Data."],
          ["2. Tanggal wajib berformat YYYY-MM-DD, contoh 2010-07-01."],
          [
            "3. Isi kolom bertanda pilihan dengan kode yang tertera, misalnya MUKIM, ALUMNI, LAKI_LAKI.",
          ],
          [
            "4. Email Wali harus terdaftar sebagai akun WALI_SANTRI di aplikasi.",
          ],
          ["5. NIS, NIK, NISN, RFID UID, dan Barcode harus unik."],
          ["6. Santri ALUMNI wajib mengisi Tahun Lulus dan Nomor Syahadah."],
          ["7. Maksimal 1.000 baris per unggahan."],
        ]
      : [
          ["PETUNJUK PENGISIAN TEMPLATE DATA GURU & USTADZ"],
          ["1. Jangan mengubah nama kolom pada sheet Data."],
          ["2. Tanggal wajib berformat YYYY-MM-DD, contoh 1980-08-15."],
          [
            "3. Isi kolom bertanda pilihan dengan kode yang tertera, misalnya S1, USTADZ_NGAJI, GTY.",
          ],
          ["4. NIK, NIP, NUPTK, dan NPK harus unik bila diisi."],
          [
            "5. Email Akun hanya untuk referensi; akun login dibuat melalui form data guru di aplikasi.",
          ],
          ["6. Maksimal 1.000 baris per unggahan."],
        ];

  return XLSX.utils.aoa_to_sheet(rows);
}

function workbookWithData(
  headers: readonly string[],
  rows: Array<Array<string | number>>,
  jenis: ExcelJenis,
): XLSX.WorkBook {
  const sheet = XLSX.utils.aoa_to_sheet([Array.from(headers), ...rows]);
  sheet["!cols"] = headers.map(() => ({ wch: 24 }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Data");
  XLSX.utils.book_append_sheet(workbook, petunjukSheet(jenis), "Petunjuk");

  return workbook;
}

function toBuffer(workbook: XLSX.WorkBook): Buffer {
  return XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
}

export function buildTemplateWorkbook(jenis: ExcelJenis): Buffer {
  return toBuffer(
    workbookWithData(
      jenis === "santri" ? SANTRI_EXCEL_HEADERS : GURU_EXCEL_HEADERS,
      [],
      jenis,
    ),
  );
}

export function buildSantriWorkbook(items: SantriItem[]): Buffer {
  return toBuffer(
    workbookWithData(
      SANTRI_EXCEL_HEADERS,
      items.map(santriRow),
      "santri",
    ),
  );
}

export function buildGuruWorkbook(items: GuruItem[]): Buffer {
  return toBuffer(
    workbookWithData(GURU_EXCEL_HEADERS, items.map(guruRow), "guru"),
  );
}

export function toDateKey(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function excelDateToKey(value: Date): string {
  // SheetJS menghasilkan Date pada zona lokal pembaca; gunakan komponen lokal
  // agar tanggal tidak bergeser satu hari.
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return excelDateToKey(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return String(value).trim();
}

export function cellNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  const text = cellText(value);

  if (!text) {
    return undefined;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
}

export function cellDateKey(value: unknown): string {
  if (value instanceof Date) {
    return excelDateToKey(value);
  }

  const text = cellText(value);

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);

  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  return text;
}

export function cellBoolean(
  value: unknown,
  defaultWhenEmpty = true,
): boolean {
  const text = cellText(value).toUpperCase();

  if (!text) {
    return defaultWhenEmpty;
  }

  return ["YA", "TRUE", "1", "AKTIF", "Y"].includes(text);
}

export interface WorkbookRow {
  baris: number;
  cells: Record<string, unknown>;
}

export function readDataWorkbook(buffer: Buffer): {
  headers: string[];
  rows: WorkbookRow[];
} {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw new AppError(
      400,
      "FILE_TIDAK_VALID",
      "File tidak dapat dibaca sebagai Excel (.xlsx).",
    );
  }

  const sheetName = workbook.SheetNames.includes("Data")
    ? "Data"
    : workbook.SheetNames[0];

  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;

  if (!sheet) {
    throw new AppError(400, "SHEET_KOSONG", "File Excel tidak memiliki sheet data.");
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: true,
  });

  const headers = (aoa[0] ?? []).map((cell) => cellText(cell));
  const rows: WorkbookRow[] = [];

  for (let index = 1; index < aoa.length; index += 1) {
    const cells = aoa[index] ?? [];
    const isEmpty = cells.every((cell) => cellText(cell) === "");

    if (isEmpty) {
      continue;
    }

    const values: Record<string, unknown> = {};
    headers.forEach((header, columnIndex) => {
      if (header) {
        values[header] = cells[columnIndex] ?? "";
      }
    });

    rows.push({ baris: index + 1, cells: values });
  }

  return { headers, rows };
}

export function assertTemplateHeaders(
  headers: string[],
  jenis: ExcelJenis,
): void {
  const expected =
    jenis === "santri" ? SANTRI_EXCEL_HEADERS : GURU_EXCEL_HEADERS;
  const missing = expected.filter((header) => !headers.includes(header));

  if (missing.length > 0) {
    throw new AppError(
      400,
      "TEMPLATE_TIDAK_SESUAI",
      "Header Excel tidak sesuai template. Unduh template terbaru dari aplikasi.",
      { missing: missing.slice(0, 10) },
    );
  }
}
