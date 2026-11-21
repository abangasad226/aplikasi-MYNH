import {
  JenisKegiatan,
  KategoriPelanggaran,
  StatusKehadiran,
} from "@prisma/client";
import { z } from "zod";

const cardIdentifierSchema = z
  .string()
  .trim()
  .min(1, "cardIdentifier wajib diisi.")
  .max(128, "cardIdentifier terlalu panjang.");

const tanggalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD.")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Tanggal tidak valid.")
  .optional();

export const absensiSchema = z
  .object({
    cardIdentifier: cardIdentifierSchema,
    jenisKegiatan: z.nativeEnum(JenisKegiatan),
    statusKehadiran: z.nativeEnum(StatusKehadiran),
    catatanUstadz: z
      .string()
      .trim()
      .max(1000, "catatanUstadz maksimal 1000 karakter.")
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .strict();

const pelanggaranSchema = z
  .object({
    tipe: z.literal("PELANGGARAN"),
    cardIdentifier: cardIdentifierSchema,
    kategori: z.nativeEnum(KategoriPelanggaran),
    deskripsiPelanggaran: z
      .string()
      .trim()
      .min(3, "deskripsiPelanggaran minimal 3 karakter.")
      .max(2000, "deskripsiPelanggaran maksimal 2000 karakter."),
    poin: z
      .number()
      .int("poin harus bilangan bulat.")
      .positive("poin harus lebih dari 0.")
      .max(1000, "poin maksimal 1000."),
    tindakanPembinaan: z
      .string()
      .trim()
      .min(3, "tindakanPembinaan minimal 3 karakter.")
      .max(2000, "tindakanPembinaan maksimal 2000 karakter."),
    tanggal: tanggalSchema,
  })
  .strict();

const akademikSchema = z
  .object({
    tipe: z.literal("AKADEMIK"),
    cardIdentifier: cardIdentifierSchema,
    jenisKegiatan: z.nativeEnum(JenisKegiatan),
    statusKehadiran: z.nativeEnum(StatusKehadiran),
    catatanUstadz: z
      .string()
      .trim()
      .max(2000, "catatanUstadz maksimal 2000 karakter.")
      .optional()
      .transform((value) => (value ? value : undefined)),
    nilaiHafalan: z
      .number()
      .int("nilaiHafalan harus bilangan bulat.")
      .min(0, "nilaiHafalan minimal 0.")
      .max(100, "nilaiHafalan maksimal 100."),
    tanggal: tanggalSchema,
  })
  .strict();

export const monitoringSchema = z.discriminatedUnion("tipe", [
  pelanggaranSchema,
  akademikSchema,
]);

export type AbsensiPayload = z.infer<typeof absensiSchema>;
export type MonitoringPayload = z.infer<typeof monitoringSchema>;
