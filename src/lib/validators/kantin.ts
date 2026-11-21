import { z } from "zod";
import { MAX_NOMINAL_BELANJA_KANTIN } from "@/lib/constants";

const nominalBelanjaSchema = z
  .union([
    z
      .string()
      .trim()
      .regex(
        /^\d+$/,
        "nominalBelanja harus berupa angka bulat tanpa titik, koma, atau tanda minus.",
      ),
    z
      .number()
      .int("nominalBelanja harus berupa bilangan bulat.")
      .positive("nominalBelanja harus lebih dari 0.")
      .safe("nominalBelanja melebihi batas bilangan aman JavaScript."),
  ])
  .transform((value) => BigInt(value))
  .refine((value) => value > 0n, "nominalBelanja harus lebih dari 0.")
  .refine(
    (value) => value <= MAX_NOMINAL_BELANJA_KANTIN,
    `nominalBelanja maksimal ${MAX_NOMINAL_BELANJA_KANTIN.toString()} rupiah.`,
  );

export const transaksiKantinSchema = z
  .object({
    cardIdentifier: z
      .string()
      .trim()
      .min(1, "cardIdentifier wajib diisi.")
      .max(128, "cardIdentifier terlalu panjang."),
    merchantId: z
      .string()
      .trim()
      .min(1, "merchantId wajib diisi.")
      .max(64, "merchantId terlalu panjang."),
    nominalBelanja: nominalBelanjaSchema,
    pinSantri: z
      .string()
      .trim()
      .regex(/^\d{4,8}$/, "pinSantri harus 4-8 digit angka.")
      .optional(),
  })
  .strict();

export type TransaksiKantinPayload = z.infer<typeof transaksiKantinSchema>;
