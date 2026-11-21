import {
  JenisTransaksi,
  MetodePembayaran,
  Prisma,
  Role,
  Web3SyncStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { MAX_NOMINAL_BELANJA_KANTIN } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { getWibDayRange } from "@/lib/waktu";
import { web3Service } from "@/lib/web3Service";

const DOUBLE_SCAN_WINDOW_MS = 5_000;

const ALLOWED_KANTIN_ROLES = new Set<Role>([
  Role.KASIR_KANTIN,
  Role.BENDAHARA,
]);

interface SantriKantinRow {
  id: string;
  nis: string;
  name: string;
  kelas: string;
  kamar: string;
  statusAktif: boolean;
  saldoJajan: bigint;
  limitJajanHarian: bigint;
  pinHash: string | null;
}

interface MerchantKantinRow {
  id: string;
  namaKantin: string;
  pemilikUserId: string;
}

export interface KantinActor {
  id: string;
  role: Role;
}

export interface TransaksiKantinInput {
  cardIdentifier: string;
  merchantId: string;
  nominalBelanja: bigint;
  pinSantri?: string;
}

export interface HasilTransaksiKantin {
  santri: {
    id: string;
    nis: string;
    name: string;
    kelas: string;
    kamar: string;
  };
  merchant: {
    id: string;
    namaKantin: string;
  };
  transaksi: {
    id: string;
    kodeTransaksi: string;
    nominal: bigint;
    createdAt: Date;
    web3Status: Web3SyncStatus;
  };
  saldoJajanAkhir: bigint;
  totalJajanHariIni: bigint;
  sisaLimitHarian: bigint;
}

export async function transaksiKantin(
  input: TransaksiKantinInput,
  actor: KantinActor,
): Promise<HasilTransaksiKantin> {
  if (!ALLOWED_KANTIN_ROLES.has(actor.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Role Anda tidak dapat memproses transaksi kantin.",
    );
  }

  if (
    input.nominalBelanja <= 0n ||
    input.nominalBelanja > MAX_NOMINAL_BELANJA_KANTIN
  ) {
    throw new AppError(
      400,
      "NOMINAL_TIDAK_VALID",
      `nominalBelanja harus lebih dari 0 dan maksimal ${MAX_NOMINAL_BELANJA_KANTIN.toString()} rupiah.`,
    );
  }

  const cardIdentifier = input.cardIdentifier.trim();
  const merchantId = input.merchantId.trim();
  const now = new Date();

  const hasil = await prisma.$transaction<HasilTransaksiKantin>(
    async (tx) => {
      // Satu query melakukan lookup kartu sekaligus mengunci baris Santri.
      // Ini menjadi titik serialisasi untuk saldo, limit, dan double-tap.
      const santriRows = await tx.$queryRaw<SantriKantinRow[]>`
        SELECT
          "id",
          "nis",
          "name",
          "kelas",
          "kamar",
          "statusAktif",
          "saldoJajan",
          "limitJajanHarian",
          "pinHash"
        FROM "Santri"
        WHERE "rfidUid" = ${cardIdentifier}
           OR "barcodeCode" = ${cardIdentifier}
        FOR UPDATE
      `;

      if (santriRows.length === 0) {
        throw new AppError(
          404,
          "SANTRI_NOT_FOUND",
          "Kartu santri tidak dikenali.",
        );
      }

      if (santriRows.length > 1) {
        throw new AppError(
          409,
          "KARTU_AMBIGU",
          "Kartu cocok dengan lebih dari satu santri. Hubungi admin data santri.",
        );
      }

      const santri = santriRows[0];

      if (!santri.statusAktif) {
        throw new AppError(
          409,
          "SANTRI_INACTIVE",
          "Kartu santri tidak aktif.",
        );
      }

      // Kunci merchant setelah Santri. Urutan lock selalu Santri -> Merchant
      // agar transaksi kasir yang bersamaan tidak saling deadlock.
      const merchantRows = await tx.$queryRaw<MerchantKantinRow[]>`
        SELECT "id", "namaKantin", "pemilikUserId"
        FROM "MerchantKantin"
        WHERE "id" = ${merchantId}
        FOR UPDATE
      `;

      if (merchantRows.length === 0) {
        throw new AppError(
          404,
          "MERCHANT_NOT_FOUND",
          "Merchant kantin tidak ditemukan.",
        );
      }

      const merchant = merchantRows[0];

      // Kasir kantin hanya boleh mengkredit merchant miliknya sendiri.
      if (
        actor.role === Role.KASIR_KANTIN &&
        merchant.pemilikUserId !== actor.id
      ) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Anda tidak berhak memproses transaksi untuk merchant ini.",
        );
      }

      // PIN bersifat opsional: hanya diverifikasi jika Santri.pinHash diisi.
      if (santri.pinHash) {
        if (!input.pinSantri) {
          throw new AppError(
            403,
            "PIN_DIPERLUKAN",
            "PIN santri diperlukan untuk transaksi ini.",
          );
        }

        const pinCocok = await bcrypt.compare(input.pinSantri, santri.pinHash);

        if (!pinCocok) {
          throw new AppError(403, "PIN_SALAH", "PIN santri salah.");
        }
      }

      // Anti double-tap: transaksi identik pada merchant yang sama dalam
      // waktu kurang dari 5 detik dianggap hasil scan ganda.
      const batasDoubleScan = new Date(
        now.getTime() - DOUBLE_SCAN_WINDOW_MS,
      );
      const transaksiDuplikat = await tx.transaksiKeuangan.findFirst({
        where: {
          santriId: santri.id,
          merchantId: merchant.id,
          jenisTransaksi: JenisTransaksi.JAJAN_KANTIN,
          nominal: input.nominalBelanja,
          createdAt: { gt: batasDoubleScan },
        },
        select: { id: true },
      });

      if (transaksiDuplikat) {
        throw new AppError(
          409,
          "DUPLIKAT_SCAN",
          "Transaksi identik terdeteksi dalam waktu kurang dari 5 detik.",
        );
      }

      // Limit dihitung dari total JAJAN_KANTIN pada hari kalender WIB.
      const hariIni = getWibDayRange(now);
      const agregatJajan = await tx.transaksiKeuangan.aggregate({
        where: {
          santriId: santri.id,
          jenisTransaksi: JenisTransaksi.JAJAN_KANTIN,
          createdAt: { gte: hariIni.start, lt: hariIni.end },
        },
        _sum: { nominal: true },
      });

      const totalJajanHariIni = agregatJajan._sum.nominal ?? 0n;
      const totalSetelahTransaksi =
        totalJajanHariIni + input.nominalBelanja;

      if (totalSetelahTransaksi > santri.limitJajanHarian) {
        throw new AppError(
          422,
          "LIMIT_HARIAN_TERLAMPAUI",
          "Melebihi batas jajan harian santri",
        );
      }

      // Saldo jajan adalah satu-satunya sumber dana. Dana SPP/Infaq tidak
      // dapat dipakai untuk pembelian kantin.
      if (santri.saldoJajan < input.nominalBelanja) {
        throw new AppError(
          422,
          "SALDO_JAJAN_TIDAK_CUKUP",
          "Saldo jajan santri tidak mencukupi",
        );
      }

      const transaksi = await tx.transaksiKeuangan.create({
        data: {
          kodeTransaksi: `KANTIN-${Date.now()}-${randomUUID()}`,
          santriId: santri.id,
          merchantId: merchant.id,
          jenisTransaksi: JenisTransaksi.JAJAN_KANTIN,
          nominal: input.nominalBelanja,
          metodePembayaran: MetodePembayaran.AUTO_SYSTEM,
          keterangan: `Pembelian kantin di ${merchant.namaKantin}`,
          createdById: actor.id,
          web3Status: Web3SyncStatus.PENDING,
        },
        select: {
          id: true,
          kodeTransaksi: true,
          nominal: true,
          createdAt: true,
          web3Status: true,
        },
      });

      const santriSetelahUpdate = await tx.santri.update({
        where: { id: santri.id },
        data: {
          saldoJajan: { decrement: input.nominalBelanja },
        },
        select: { saldoJajan: true },
      });

      await tx.merchantKantin.update({
        where: { id: merchant.id },
        data: {
          saldoPendapatan: { increment: input.nominalBelanja },
        },
      });

      return {
        santri: {
          id: santri.id,
          nis: santri.nis,
          name: santri.name,
          kelas: santri.kelas,
          kamar: santri.kamar,
        },
        merchant: {
          id: merchant.id,
          namaKantin: merchant.namaKantin,
        },
        transaksi,
        saldoJajanAkhir: santriSetelahUpdate.saldoJajan,
        totalJajanHariIni: totalSetelahTransaksi,
        sisaLimitHarian:
          santri.limitJajanHarian - totalSetelahTransaksi,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 2_000,
      timeout: 5_000,
    },
  );

  // Audit on-chain tidak boleh menahan respons kasir.
  web3Service.catatTransaksi(hasil.transaksi.id);

  return hasil;
}
