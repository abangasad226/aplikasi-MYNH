import {
  JabatanGtk,
  JenisKelamin,
  PendidikanTerakhir,
  RentangPenghasilan,
  StatusHidup,
  StatusKepegawaian,
  StatusMukim,
  StatusSantri,
} from "@prisma/client";
import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(max: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(max).optional(),
  );
}

const tanggalSchema = z
  .string()
  .trim()
  .regex(DATE_PATTERN, "Tanggal harus berformat YYYY-MM-DD.")
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .refine(
    (value) => !Number.isNaN(value.getTime()),
    "Tanggal tidak valid.",
  );

const tanggalOpsional = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  tanggalSchema.optional(),
);

const noHpOpsional = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(/^\+?[0-9-]{8,20}$/, "Nomor HP tidak valid.")
    .optional(),
);

const urlBerkas = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .max(500, "URL berkas maksimal 500 karakter.")
    .refine(
      (value) => value.startsWith("/uploads/") || /^https?:\/\//.test(value),
      "URL berkas tidak valid.",
    )
    .optional(),
);

const nik16 = z
  .string()
  .trim()
  .regex(/^\d{16}$/, "NIK harus terdiri dari 16 digit angka.");

const nikOpsional = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(/^\d{16}$/, "NIK harus terdiri dari 16 digit angka.")
    .optional(),
);

const angkaTahun = z
  .number()
  .int("Tahun harus bilangan bulat.")
  .min(1900, "Tahun minimal 1900.")
  .max(2200, "Tahun maksimal 2200.");

// ------------------------------- SANTRI -------------------------------------

const santriFields = {
  nis: z
    .string()
    .trim()
    .min(3, "NIS minimal 3 karakter.")
    .max(30, "NIS maksimal 30 karakter.")
    .regex(/^[A-Za-z0-9-]+$/, "NIS hanya boleh berisi huruf, angka, dan tanda hubung."),
  nik: nik16,
  nisn: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .trim()
      .regex(/^\d{10}$/, "NISN harus terdiri dari 10 digit angka.")
      .optional(),
  ),
  nism: optionalText(30),
  name: z
    .string()
    .trim()
    .min(2, "Nama minimal 2 karakter.")
    .max(150, "Nama maksimal 150 karakter."),
  kelas: z.string().trim().min(1, "Kelas wajib diisi.").max(50),
  kamar: z.string().trim().min(1, "Kamar wajib diisi.").max(100),
  rfidUid: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .trim()
      .min(4, "RFID UID minimal 4 karakter.")
      .max(128, "RFID UID maksimal 128 karakter.")
      .regex(/^[A-Za-z0-9-]+$/, "RFID UID hanya boleh berisi huruf, angka, dan tanda hubung.")
      .transform((value) => value.toUpperCase())
      .optional(),
  ),
  barcodeCode: optionalText(128),
  tempatLahir: z
    .string()
    .trim()
    .min(2, "Tempat lahir wajib diisi.")
    .max(100),
  tanggalLahir: tanggalSchema.refine(
    (value) => value.getTime() <= Date.now(),
    "Tanggal lahir tidak boleh di masa depan.",
  ),
  jenisKelamin: z.nativeEnum(JenisKelamin),
  alamatLengkap: z
    .string()
    .trim()
    .min(5, "Alamat lengkap minimal 5 karakter.")
    .max(500),
  rtRw: optionalText(20),
  desaKelurahan: z.string().trim().min(2, "Desa/kelurahan wajib diisi.").max(100),
  kecamatan: z.string().trim().min(2, "Kecamatan wajib diisi.").max(100),
  kabupatenKota: z.string().trim().min(2, "Kabupaten/kota wajib diisi.").max(100),
  provinsi: z.string().trim().min(2, "Provinsi wajib diisi.").max(100),
  nomorKK: z
    .string()
    .trim()
    .regex(/^\d{16}$/, "Nomor KK harus terdiri dari 16 digit angka."),

  // Ayah
  namaAyah: z.string().trim().min(2, "Nama ayah wajib diisi.").max(150),
  nikAyah: nikOpsional,
  tempatLahirAyah: optionalText(100),
  tanggalLahirAyah: tanggalOpsional,
  statusHidupAyah: z.nativeEnum(StatusHidup).optional(),
  pendidikanAyah: z.nativeEnum(PendidikanTerakhir).optional(),
  pekerjaanAyah: optionalText(100),
  penghasilanAyah: z.nativeEnum(RentangPenghasilan).optional(),
  noHpAyah: noHpOpsional,

  // Ibu
  namaIbu: z.string().trim().min(2, "Nama ibu wajib diisi.").max(150),
  nikIbu: nikOpsional,
  tempatLahirIbu: optionalText(100),
  tanggalLahirIbu: tanggalOpsional,
  statusHidupIbu: z.nativeEnum(StatusHidup).optional(),
  pendidikanIbu: z.nativeEnum(PendidikanTerakhir).optional(),
  pekerjaanIbu: optionalText(100),
  penghasilanIbu: z.nativeEnum(RentangPenghasilan).optional(),
  noHpIbu: noHpOpsional,

  // Wali pengasuh (opsional)
  namaWali: optionalText(150),
  hubunganWali: optionalText(50),
  tempatLahirWali: optionalText(100),
  tanggalLahirWali: tanggalOpsional,
  pekerjaanWali: optionalText(100),
  penghasilanWali: z.nativeEnum(RentangPenghasilan).optional(),
  noHpWali: noHpOpsional,
  alamatWali: optionalText(500),

  // Berkas digital
  fotoSantriUrl: urlBerkas,
  fileKkUrl: urlBerkas,
  fileAktaUrl: urlBerkas,
  fileIjazahUrl: urlBerkas,

  statusMukim: z.nativeEnum(StatusMukim),
  statusSantri: z.nativeEnum(StatusSantri),
  tahunMasuk: angkaTahun,
  tahunLulus: angkaTahun.optional(),
  nomorSyahadah: optionalText(100),
  waliId: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().trim().min(1).max(64).optional()),
};

export const santriCreateSchema = z
  .object({
    ...santriFields,
    statusMukim: z.nativeEnum(StatusMukim).default(StatusMukim.MUKIM),
    statusSantri: z.nativeEnum(StatusSantri).default(StatusSantri.AKTIF),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.statusSantri === StatusSantri.ALUMNI &&
      (!data.tahunLulus || !data.nomorSyahadah)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tahunLulus"],
        message:
          "Santri berstatus ALUMNI wajib memiliki tahun lulus dan nomor syahadah.",
      });
    }

    if (data.tahunLulus !== undefined && data.tahunLulus < data.tahunMasuk) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tahunLulus"],
        message: "Tahun lulus tidak boleh lebih kecil dari tahun masuk.",
      });
    }
  });

export const santriUpdateSchema = z
  .object({
    ...santriFields,
    isDispensasiInfaq: z.boolean(),
    catatanDispensasi: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      z
        .string()
        .trim()
        .max(500, "Catatan dispensasi maksimal 500 karakter.")
        .nullable(),
    ),
  })
  .partial()
  .strict();

export const pairingRfidSchema = z
  .object({
    rfidUid: z
      .string()
      .trim()
      .min(4, "RFID UID minimal 4 karakter.")
      .max(128, "RFID UID maksimal 128 karakter.")
      .regex(/^[A-Za-z0-9-]+$/, "RFID UID hanya boleh berisi huruf, angka, dan tanda hubung.")
      .transform((value) => value.toUpperCase()),
  })
  .strict();

export const mutasiMassalSchema = z
  .object({
    mode: z.enum(["NAIK_KELAS", "LULUSKAN"]),
    santriIds: z
      .array(z.string().trim().min(1).max(64))
      .min(1, "Pilih minimal satu santri.")
      .max(500, "Maksimal 500 santri per proses."),
    kelasBaru: optionalText(50),
    tahunLulus: angkaTahun.optional(),
    nomorSyahadahPrefix: optionalText(100),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.mode === "NAIK_KELAS" && !data.kelasBaru) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["kelasBaru"],
        message: "Kelas baru wajib diisi untuk kenaikan kelas massal.",
      });
    }

    if (data.mode === "LULUSKAN" && !data.tahunLulus) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tahunLulus"],
        message: "Tahun lulus wajib diisi untuk kelulusan massal.",
      });
    }
  });

// --------------------------------- GTK --------------------------------------

const guruFields = {
  nip: optionalText(30),
  nuptk: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .trim()
      .regex(/^\d{16}$/, "NUPTK harus terdiri dari 16 digit angka.")
      .optional(),
  ),
  npk: optionalText(30),
  nik: nik16,
  namaLengkap: z.string().trim().min(2, "Nama lengkap wajib diisi.").max(150),
  gelarDepan: optionalText(30),
  gelarBelakang: optionalText(50),
  tempatLahir: z.string().trim().min(2, "Tempat lahir wajib diisi.").max(100),
  tanggalLahir: tanggalSchema.refine(
    (value) => value.getTime() <= Date.now(),
    "Tanggal lahir tidak boleh di masa depan.",
  ),
  jenisKelamin: z.nativeEnum(JenisKelamin),
  pendidikanTerakhir: z.nativeEnum(PendidikanTerakhir),
  jurusan: optionalText(100),
  jabatan: z.nativeEnum(JabatanGtk),
  statusKepegawaian: z.nativeEnum(StatusKepegawaian),
  mataPelajaranAtauKitab: optionalText(200),
  noHp: z
    .string()
    .trim()
    .regex(/^\+?[0-9-]{8,20}$/, "Nomor HP tidak valid."),
  alamat: z.string().trim().min(5, "Alamat minimal 5 karakter.").max(500),
  statusAktif: z.boolean(),
  tanggalMulaiTugas: tanggalSchema.refine(
    (value) => value.getTime() <= Date.now(),
    "Tanggal mulai tugas tidak boleh di masa depan.",
  ),
};

const akunFields = {
  buatAkun: z.boolean(),
  emailAkun: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().email("Email akun tidak valid.").max(255).optional(),
  ),
  passwordAkun: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().min(8, "Password minimal 8 karakter.").max(200).optional(),
  ),
};

export const guruCreateSchema = z
  .object({
    ...guruFields,
    statusAktif: z.boolean().default(true),
    ...akunFields,
    buatAkun: z.boolean().default(false),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.buatAkun) {
      if (!data.emailAkun) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["emailAkun"],
          message: "Email wajib diisi bila membuat akun login.",
        });
      }
      if (!data.passwordAkun) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["passwordAkun"],
          message: "Password wajib diisi bila membuat akun login.",
        });
      }
    }
  });

export const guruUpdateSchema = z
  .object({
    ...guruFields,
    ...akunFields,
  })
  .partial()
  .strict();

export type SantriCreatePayload = z.infer<typeof santriCreateSchema>;
export type SantriUpdatePayload = z.infer<typeof santriUpdateSchema>;
export type MutasiMassalPayload = z.infer<typeof mutasiMassalSchema>;
export type GuruCreatePayload = z.infer<typeof guruCreateSchema>;
export type GuruUpdatePayload = z.infer<typeof guruUpdateSchema>;
