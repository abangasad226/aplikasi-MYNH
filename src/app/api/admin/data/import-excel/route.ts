import { Prisma, Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import type { ZodError } from "zod";

import { errorResponse, jsonData } from "@/lib/api";
import type { ImportReport } from "@/lib/api-types";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import {
  GURU_EXCEL_HEADERS,
  SANTRI_EXCEL_HEADERS,
  assertTemplateHeaders,
  cellBoolean,
  cellDateKey,
  cellNumber,
  cellText,
  readDataWorkbook,
} from "@/lib/data-induk/excel";
import { createSantriBatch } from "@/lib/data-induk/santri-service";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  guruCreateSchema,
  santriCreateSchema,
  type GuruCreatePayload,
  type SantriCreatePayload,
} from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1_000;
const MAX_ERRORS = 50;

function formatZodError(error: ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

function optionalFromCell(value: unknown): string | undefined {
  const text = cellText(value);
  return text === "" ? undefined : text;
}

function guruImportData(
  input: GuruCreatePayload,
): Prisma.GuruDanTendikCreateManyInput {
  return {
    userId: null,
    nip: input.nip ?? null,
    nuptk: input.nuptk ?? null,
    npk: input.npk ?? null,
    nik: input.nik,
    namaLengkap: input.namaLengkap,
    gelarDepan: input.gelarDepan ?? null,
    gelarBelakang: input.gelarBelakang ?? null,
    tempatLahir: input.tempatLahir,
    tanggalLahir: input.tanggalLahir,
    jenisKelamin: input.jenisKelamin,
    pendidikanTerakhir: input.pendidikanTerakhir,
    jurusan: input.jurusan ?? null,
    jabatan: input.jabatan,
    statusKepegawaian: input.statusKepegawaian,
    mataPelajaranAtauKitab: input.mataPelajaranAtauKitab ?? null,
    noHp: input.noHp,
    alamat: input.alamat,
    statusAktif: input.statusAktif,
    tanggalMulaiTugas: input.tanggalMulaiTugas,
    updatedAt: new Date(),
  };
}

async function importSantri(
  rows: ReturnType<typeof readDataWorkbook>["rows"],
): Promise<ImportReport> {
  const [waliUsers, existing] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.WALI_SANTRI },
      select: { id: true, email: true },
    }),
    prisma.santri.findMany({
      select: {
        nis: true,
        nik: true,
        nisn: true,
        rfidUid: true,
        barcodeCode: true,
      },
    }),
  ]);

  const waliByEmail = new Map(
    waliUsers.map((user) => [user.email.toLowerCase(), user.id]),
  );
  const dbNis = new Set(existing.map((row) => row.nis));
  const dbNik = new Set(existing.map((row) => row.nik));
  const dbNisn = new Set(
    existing.map((row) => row.nisn).filter((value): value is string => Boolean(value)),
  );
  const dbRfid = new Set(
    existing
      .map((row) => row.rfidUid)
      .filter((value): value is string => Boolean(value)),
  );
  const dbBarcode = new Set(existing.map((row) => row.barcodeCode));

  const fileNis = new Set<string>();
  const fileNik = new Set<string>();
  const fileNisn = new Set<string>();
  const fileRfid = new Set<string>();
  const fileBarcode = new Set<string>();

  const valid: SantriCreatePayload[] = [];
  const errors: ImportReport["errors"] = [];

  const catat = (baris: number, pesan: string) => {
    if (errors.length < MAX_ERRORS) {
      errors.push({ baris, pesan });
    }
  };

  for (const row of rows) {
    const cells = row.cells;
    const waliEmail = cellText(cells["Email Wali"]).toLowerCase();

    if (!waliEmail) {
      catat(row.baris, "Email Wali wajib diisi.");
      continue;
    }

    const waliId = waliByEmail.get(waliEmail);

    if (!waliId) {
      catat(row.baris, `Email Wali "${waliEmail}" belum terdaftar sebagai akun wali.`);
      continue;
    }

    const parsed = santriCreateSchema.safeParse({
      nis: cellText(cells["NIS"]),
      nik: cellText(cells["NIK"]),
      nisn: optionalFromCell(cells["NISN"]),
      nism: optionalFromCell(cells["NISM"]),
      name: cellText(cells["Nama Lengkap"]),
      tempatLahir: cellText(cells["Tempat Lahir"]),
      tanggalLahir: cellDateKey(cells[SANTRI_EXCEL_HEADERS[6]]),
      jenisKelamin: cellText(cells[SANTRI_EXCEL_HEADERS[7]]),
      kelas: cellText(cells["Kelas"]),
      kelasNgaji: optionalFromCell(cells["Kelas Ngaji"]),
      kamar: cellText(cells["Kamar"]),
      alamatLengkap: cellText(cells["Alamat Lengkap"]),
      rtRw: optionalFromCell(cells["RT/RW"]),
      desaKelurahan: cellText(cells["Desa/Kelurahan"]),
      kecamatan: cellText(cells["Kecamatan"]),
      kabupatenKota: cellText(cells["Kabupaten/Kota"]),
      provinsi: cellText(cells["Provinsi"]),
      nomorKK: cellText(cells["Nomor KK"]),
      namaAyah: cellText(cells["Nama Ayah"]),
      nikAyah: optionalFromCell(cells["NIK Ayah"]),
      pekerjaanAyah: optionalFromCell(cells["Pekerjaan Ayah"]),
      namaIbu: cellText(cells["Nama Ibu"]),
      nikIbu: optionalFromCell(cells["NIK Ibu"]),
      pekerjaanIbu: optionalFromCell(cells["Pekerjaan Ibu"]),
      statusMukim: cellText(cells[SANTRI_EXCEL_HEADERS[23]]) || "MUKIM",
      statusSantri: cellText(cells[SANTRI_EXCEL_HEADERS[24]]) || "AKTIF",
      tahunMasuk: cellNumber(cells["Tahun Masuk"]),
      tahunLulus: cellNumber(cells["Tahun Lulus"]),
      nomorSyahadah: optionalFromCell(cells["Nomor Syahadah"]),
      rfidUid: optionalFromCell(cells["RFID UID"]),
      barcodeCode: optionalFromCell(cells["Barcode"]),
      waliId,
    });

    if (!parsed.success) {
      catat(row.baris, formatZodError(parsed.error));
      continue;
    }

    const input = parsed.data;
    const barcode = input.barcodeCode ?? `SANTRI-${input.nis}`;
    const bentrok: string[] = [];

    if (dbNis.has(input.nis) || fileNis.has(input.nis)) bentrok.push("NIS");
    if (dbNik.has(input.nik) || fileNik.has(input.nik)) bentrok.push("NIK");
    if (input.nisn && (dbNisn.has(input.nisn) || fileNisn.has(input.nisn))) {
      bentrok.push("NISN");
    }
    if (input.rfidUid && (dbRfid.has(input.rfidUid) || fileRfid.has(input.rfidUid))) {
      bentrok.push("RFID UID");
    }
    if (dbBarcode.has(barcode) || fileBarcode.has(barcode)) {
      bentrok.push("Barcode");
    }

    if (bentrok.length > 0) {
      catat(row.baris, `Data duplikat: ${bentrok.join(", ")} sudah terdaftar.`);
      continue;
    }

    fileNis.add(input.nis);
    fileNik.add(input.nik);
    if (input.nisn) fileNisn.add(input.nisn);
    if (input.rfidUid) fileRfid.add(input.rfidUid);
    fileBarcode.add(barcode);
    valid.push(input);
  }

  const berhasil = await createSantriBatch(valid);

  return {
    jenis: "santri",
    totalBaris: rows.length,
    berhasil,
    gagal: rows.length - berhasil,
    errors,
  };
}

async function importGuru(
  rows: ReturnType<typeof readDataWorkbook>["rows"],
): Promise<ImportReport> {
  const existing = await prisma.guruDanTendik.findMany({
    select: { nik: true, nip: true, nuptk: true, npk: true },
  });

  const dbNik = new Set(existing.map((row) => row.nik));
  const dbNip = new Set(
    existing.map((row) => row.nip).filter((value): value is string => Boolean(value)),
  );
  const dbNuptk = new Set(
    existing
      .map((row) => row.nuptk)
      .filter((value): value is string => Boolean(value)),
  );
  const dbNpk = new Set(
    existing.map((row) => row.npk).filter((value): value is string => Boolean(value)),
  );

  const fileNik = new Set<string>();
  const fileNip = new Set<string>();
  const fileNuptk = new Set<string>();
  const fileNpk = new Set<string>();

  const valid: GuruCreatePayload[] = [];
  const errors: ImportReport["errors"] = [];

  const catat = (baris: number, pesan: string) => {
    if (errors.length < MAX_ERRORS) {
      errors.push({ baris, pesan });
    }
  };

  for (const row of rows) {
    const cells = row.cells;

    const parsed = guruCreateSchema.safeParse({
      nik: cellText(cells["NIK"]),
      nip: optionalFromCell(cells["NIP"]),
      nuptk: optionalFromCell(cells["NUPTK"]),
      npk: optionalFromCell(cells["NPK"]),
      namaLengkap: cellText(cells["Nama Lengkap"]),
      gelarDepan: optionalFromCell(cells["Gelar Depan"]),
      gelarBelakang: optionalFromCell(cells["Gelar Belakang"]),
      tempatLahir: cellText(cells["Tempat Lahir"]),
      tanggalLahir: cellDateKey(cells[GURU_EXCEL_HEADERS[8]]),
      jenisKelamin: cellText(cells[GURU_EXCEL_HEADERS[9]]),
      pendidikanTerakhir: cellText(cells[GURU_EXCEL_HEADERS[10]]),
      jurusan: optionalFromCell(cells["Jurusan"]),
      jabatan: cellText(cells[GURU_EXCEL_HEADERS[12]]),
      statusKepegawaian: cellText(cells[GURU_EXCEL_HEADERS[13]]),
      mataPelajaranAtauKitab: optionalFromCell(cells["Mapel/Kitab"]),
      noHp: cellText(cells["No HP"]),
      alamat: cellText(cells["Alamat"]),
      tanggalMulaiTugas: cellDateKey(cells[GURU_EXCEL_HEADERS[17]]),
      statusAktif: cellBoolean(cells[GURU_EXCEL_HEADERS[18]], true),
    });

    if (!parsed.success) {
      catat(row.baris, formatZodError(parsed.error));
      continue;
    }

    const input = parsed.data;
    const bentrok: string[] = [];

    if (dbNik.has(input.nik) || fileNik.has(input.nik)) bentrok.push("NIK");
    if (input.nip && (dbNip.has(input.nip) || fileNip.has(input.nip))) {
      bentrok.push("NIP");
    }
    if (input.nuptk && (dbNuptk.has(input.nuptk) || fileNuptk.has(input.nuptk))) {
      bentrok.push("NUPTK");
    }
    if (input.npk && (dbNpk.has(input.npk) || fileNpk.has(input.npk))) {
      bentrok.push("NPK");
    }

    if (bentrok.length > 0) {
      catat(row.baris, `Data duplikat: ${bentrok.join(", ")} sudah terdaftar.`);
      continue;
    }

    fileNik.add(input.nik);
    if (input.nip) fileNip.add(input.nip);
    if (input.nuptk) fileNuptk.add(input.nuptk);
    if (input.npk) fileNpk.add(input.npk);
    valid.push(input);
  }

  if (valid.length > 0) {
    await prisma.guruDanTendik.createMany({
      data: valid.map(guruImportData),
    });
  }

  return {
    jenis: "guru",
    totalBaris: rows.length,
    berhasil: valid.length,
    gagal: rows.length - valid.length,
    errors,
  };
}

export async function POST(request: NextRequest) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const jenis = request.nextUrl.searchParams.get("jenis");

    if (jenis !== "santri" && jenis !== "guru") {
      throw new AppError(
        400,
        "JENIS_TIDAK_VALID",
        "Parameter jenis harus santri atau guru.",
      );
    }

    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      throw new AppError(
        400,
        "FORM_TIDAK_VALID",
        "Unggahan harus menggunakan multipart/form-data dengan field file.",
      );
    }

    const file = formData.get("file");

    if (!file || typeof file === "string") {
      throw new AppError(400, "FILE_KOSONG", "Pilih file Excel terlebih dahulu.");
    }

    if (file.size > MAX_FILE_BYTES) {
      throw new AppError(
        413,
        "FILE_TERLALU_BESAR",
        "Ukuran file maksimal 5 MB.",
      );
    }

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      throw new AppError(
        400,
        "FORMAT_FILE_SALAH",
        "File harus berformat .xlsx atau .xls.",
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { headers, rows } = readDataWorkbook(buffer);
    assertTemplateHeaders(headers, jenis);

    if (rows.length === 0) {
      throw new AppError(
        400,
        "DATA_KOSONG",
        "Sheet Data tidak memiliki baris untuk diimpor.",
      );
    }

    if (rows.length > MAX_ROWS) {
      throw new AppError(
        413,
        "TERLALU_BANYAK_BARIS",
        `Maksimal ${MAX_ROWS} baris per unggahan.`,
      );
    }

    const report =
      jenis === "santri" ? await importSantri(rows) : await importGuru(rows);

    return jsonData(report);
  } catch (error) {
    return errorResponse(error);
  }
}
