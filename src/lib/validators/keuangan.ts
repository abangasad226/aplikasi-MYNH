import { MetodePembayaran } from "@prisma/client";
import { z } from "zod";
import { MAX_NOMINAL_SETORAN } from "@/lib/constants";

// String diutamakan agar nominal besar tidak kehilangan presisi saat melewati
// JSON. Number tetap diterima hanya jika bilangan bulat dan aman.
const nominalSetoranSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(
        /^\d+$/,
        "nominalSetor harus berupa angka bulat tanpa titik, koma, atau tanda minus.",
      ),
    z
      .number()
      .int("nominalSetor harus berupa bilangan bulat.")
      .positive("nominalSetor harus lebih dari 0.")
      .safe("nominalSetor melebihi batas bilangan aman JavaScript."),
  ])
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, "nominalSetor harus lebih dari 0.")
  .refine(
    (value) => value <= MAX_NOMINAL_SETORAN,
    `nominalSetor maksimal ${MAX_NOMINAL_SETORAN.toString()} rupiah.`,
  );

export const setoranJajanSchema = z
  .object({
    santriId: z
      .string()
      .trim()
      .min(1, "santriId wajib diisi.")
      .max(64, "santriId terlalu panjang."),
    nominalSetor: nominalSetoranSchema,
    metodePembayaran: z
      .nativeEnum(MetodePembayaran)
      .refine(
        (method) => method !== MetodePembayaran.AUTO_SYSTEM,
        "AUTO_SYSTEM tidak valid untuk setoran manual.",
      ),
    keterangan: z
      .string()
      .trim()
      .max(500, "keterangan maksimal 500 karakter.")
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .strict();

export const updateAutoRedirectSchema = z
  .object({
    value: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((value) => value === true || value === "true"),
  })
  .strict();

const nominalPencairanSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(
        /^\d+$/,
        "nominalPencairan harus berupa angka bulat tanpa titik, koma, atau tanda minus.",
      ),
    z
      .number()
      .int("nominalPencairan harus berupa bilangan bulat.")
      .positive("nominalPencairan harus lebih dari 0.")
      .safe("nominalPencairan melebihi batas bilangan aman JavaScript."),
  ])
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, "nominalPencairan harus lebih dari 0.")
  .refine(
    (value) => value <= MAX_NOMINAL_SETORAN,
    `nominalPencairan maksimal ${MAX_NOMINAL_SETORAN.toString()} rupiah.`,
  );

export const pencairanSaldoJajanSchema = z
  .object({
    santriId: z
      .string()
      .trim()
      .min(1, "santriId wajib diisi.")
      .max(64, "santriId terlalu panjang."),
    nominalPencairan: nominalPencairanSchema,
    metodePembayaran: z
      .nativeEnum(MetodePembayaran)
      .refine(
        (method) =>
          method === MetodePembayaran.TUNAI_BENDAHARA ||
          method === MetodePembayaran.TRANSFER_VA,
        "Pencairan hanya dapat dibayarkan tunai oleh bendahara atau transfer.",
      ),
    keterangan: z
      .string()
      .trim()
      .max(500, "keterangan maksimal 500 karakter.")
      .optional()
      .transform((value) => (value ? value : undefined)),
  })
  .strict();

export const reversalInfaqKeJajanSchema = z
  .object({
    transaksiId: z
      .string()
      .trim()
      .min(1, "transaksiId wajib diisi.")
      .max(64, "transaksiId terlalu panjang."),
    alasanDispensasi: z
      .string()
      .trim()
      .min(1, "Alasan dispensasi wajib diisi.")
      .max(500, "Alasan dispensasi maksimal 500 karakter."),
  })
  .strict();

export type SetoranJajanPayload = z.infer<typeof setoranJajanSchema>;
export type PencairanSaldoJajanPayload = z.infer<
  typeof pencairanSaldoJajanSchema
>;
export type ReversalInfaqKeJajanPayload = z.infer<
  typeof reversalInfaqKeJajanSchema
>;
