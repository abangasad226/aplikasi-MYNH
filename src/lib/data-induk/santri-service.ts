import { Prisma, Role, StatusSantri, JenisMutasiSantri } from "@prisma/client";
import bcrypt from "bcryptjs";

import type { SantriItem } from "@/lib/api-types";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { deriveCustodialWallet } from "@/lib/web3/custodial-wallet";
import type { SantriCreatePayload } from "@/lib/validators/data-induk";

type DbClient = Prisma.TransactionClient | typeof prisma;

// Kunci advisory PostgreSQL agar dua operator yang menambah santri bersamaan
// tidak memperoleh walletIndex yang sama.
const WALLET_INDEX_LOCK_KEY = 981_700_001;

export const SANTRI_SELECT = {
  id: true,
  nis: true,
  nik: true,
  nisn: true,
  nism: true,
  name: true,
  kelas: true,
  kamar: true,
  rfidUid: true,
  barcodeCode: true,
  tempatLahir: true,
  tanggalLahir: true,
  jenisKelamin: true,
  alamatLengkap: true,
  rtRw: true,
  desaKelurahan: true,
  kecamatan: true,
  kabupatenKota: true,
  provinsi: true,
  nomorKK: true,
  namaAyah: true,
  nikAyah: true,
  tempatLahirAyah: true,
  tanggalLahirAyah: true,
  statusHidupAyah: true,
  pendidikanAyah: true,
  pekerjaanAyah: true,
  penghasilanAyah: true,
  noHpAyah: true,
  namaIbu: true,
  nikIbu: true,
  tempatLahirIbu: true,
  tanggalLahirIbu: true,
  statusHidupIbu: true,
  pendidikanIbu: true,
  pekerjaanIbu: true,
  penghasilanIbu: true,
  noHpIbu: true,
  namaWali: true,
  hubunganWali: true,
  tempatLahirWali: true,
  tanggalLahirWali: true,
  pekerjaanWali: true,
  penghasilanWali: true,
  noHpWali: true,
  alamatWali: true,
  fotoSantriUrl: true,
  fileKkUrl: true,
  fileAktaUrl: true,
  fileIjazahUrl: true,
  statusMukim: true,
  statusSantri: true,
  statusAktif: true,
  tahunMasuk: true,
  tahunLulus: true,
  nomorSyahadah: true,
  waliId: true,
  saldoJajan: true,
  limitJajanHarian: true,
  isDispensasiInfaq: true,
  catatanDispensasi: true,
  walletAddress: true,
  createdAt: true,
  updatedAt: true,
  wali: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
    },
  },
} as const;

export type SantriRow = Prisma.SantriGetPayload<{
  select: typeof SANTRI_SELECT;
}>;

function walletMnemonic(): string {
  const mnemonic = process.env.CUSTODIAL_MASTER_MNEMONIC?.trim();

  if (!mnemonic) {
    throw new AppError(
      500,
      "WALLET_NOT_CONFIGURED",
      "CUSTODIAL_MASTER_MNEMONIC belum dikonfigurasi di server.",
    );
  }

  return mnemonic;
}

export async function assertWaliUser(
  db: DbClient,
  waliId: string,
): Promise<void> {
  const wali = await db.user.findUnique({
    where: { id: waliId },
    select: { role: true },
  });

  if (!wali || wali.role !== Role.WALI_SANTRI) {
    throw new AppError(
      400,
      "WALI_INVALID",
      "Wali yang dipilih tidak valid atau bukan akun wali santri.",
    );
  }
}

type SantriUniqueInput = {
  nis: string;
  nik: string;
  nisn?: string | null;
  rfidUid?: string | null;
  barcodeCode?: string | null;
};

export async function assertSantriUnique(
  db: DbClient,
  input: SantriUniqueInput,
  excludeId?: string,
): Promise<void> {
  const conditions: Prisma.SantriWhereInput[] = [
    { nis: input.nis },
    { nik: input.nik },
  ];

  if (input.nisn) {
    conditions.push({ nisn: input.nisn });
  }
  if (input.rfidUid) {
    conditions.push({ rfidUid: input.rfidUid });
  }
  if (input.barcodeCode) {
    conditions.push({ barcodeCode: input.barcodeCode });
  }

  const candidates = await db.santri.findMany({
    where: {
      OR: conditions,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      nis: true,
      nik: true,
      nisn: true,
      rfidUid: true,
      barcodeCode: true,
    },
  });

  if (candidates.length === 0) {
    return;
  }

  const bentrok = new Set<string>();

  for (const row of candidates) {
    if (row.nis === input.nis) bentrok.add("NIS");
    if (row.nik === input.nik) bentrok.add("NIK");
    if (input.nisn && row.nisn === input.nisn) bentrok.add("NISN");
    if (input.rfidUid && row.rfidUid === input.rfidUid) bentrok.add("RFID UID");
    if (input.barcodeCode && row.barcodeCode === input.barcodeCode) {
      bentrok.add("Barcode");
    }
  }

  throw new AppError(
    409,
    "DUPLIKAT_SANTRI",
    `Data santri sudah terdaftar: ${Array.from(bentrok).join(", ")}.`,
    { field: Array.from(bentrok) },
  );
}

function buildSantriCreateData(
  input: SantriCreatePayload,
  waliId: string,
  walletIndex: number,
  walletAddress: string,
): Prisma.SantriUncheckedCreateInput {
  return {
    nis: input.nis,
    nik: input.nik,
    nisn: input.nisn ?? null,
    nism: input.nism ?? null,
    name: input.name,
    kelas: input.kelas,
    kamar: input.kamar,
    rfidUid: input.rfidUid ?? null,
    barcodeCode: input.barcodeCode ?? `SANTRI-${input.nis}`,
    tempatLahir: input.tempatLahir,
    tanggalLahir: input.tanggalLahir,
    jenisKelamin: input.jenisKelamin,
    alamatLengkap: input.alamatLengkap,
    rtRw: input.rtRw ?? null,
    desaKelurahan: input.desaKelurahan,
    kecamatan: input.kecamatan,
    kabupatenKota: input.kabupatenKota,
    provinsi: input.provinsi,
    nomorKK: input.nomorKK,
    namaAyah: input.namaAyah,
    nikAyah: input.nikAyah ?? null,
    tempatLahirAyah: input.tempatLahirAyah ?? null,
    tanggalLahirAyah: input.tanggalLahirAyah ?? null,
    statusHidupAyah: input.statusHidupAyah ?? undefined,
    pendidikanAyah: input.pendidikanAyah ?? null,
    pekerjaanAyah: input.pekerjaanAyah ?? null,
    penghasilanAyah: input.penghasilanAyah ?? null,
    noHpAyah: input.noHpAyah ?? null,
    namaIbu: input.namaIbu,
    nikIbu: input.nikIbu ?? null,
    tempatLahirIbu: input.tempatLahirIbu ?? null,
    tanggalLahirIbu: input.tanggalLahirIbu ?? null,
    statusHidupIbu: input.statusHidupIbu ?? undefined,
    pendidikanIbu: input.pendidikanIbu ?? null,
    pekerjaanIbu: input.pekerjaanIbu ?? null,
    penghasilanIbu: input.penghasilanIbu ?? null,
    noHpIbu: input.noHpIbu ?? null,
    namaWali: input.namaWali ?? null,
    hubunganWali: input.hubunganWali ?? null,
    tempatLahirWali: input.tempatLahirWali ?? null,
    tanggalLahirWali: input.tanggalLahirWali ?? null,
    pekerjaanWali: input.pekerjaanWali ?? null,
    penghasilanWali: input.penghasilanWali ?? null,
    noHpWali: input.noHpWali ?? null,
    alamatWali: input.alamatWali ?? null,
    fotoSantriUrl: input.fotoSantriUrl ?? null,
    fileKkUrl: input.fileKkUrl ?? null,
    fileAktaUrl: input.fileAktaUrl ?? null,
    fileIjazahUrl: input.fileIjazahUrl ?? null,
    statusMukim: input.statusMukim,
    statusSantri: input.statusSantri,
    statusAktif: input.statusSantri === StatusSantri.AKTIF,
    tahunMasuk: input.tahunMasuk,
    tahunLulus: input.tahunLulus ?? null,
    nomorSyahadah: input.nomorSyahadah ?? null,
    waliId,
    walletIndex,
    walletAddress,
  };
}

async function allocateWallet(
  tx: Prisma.TransactionClient,
): Promise<{ walletIndex: number; walletAddress: string }> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WALLET_INDEX_LOCK_KEY})`;

  const aggregate = await tx.santri.aggregate({
    _max: { walletIndex: true },
  });
  const walletIndex = (aggregate._max.walletIndex ?? -1) + 1;
  const wallet = deriveCustodialWallet(walletIndex, walletMnemonic());

  return { walletIndex, walletAddress: wallet.address };
}

async function resolveWaliAccount(
  tx: Prisma.TransactionClient,
  input: SantriCreatePayload,
): Promise<string> {
  if (input.waliId) {
    await assertWaliUser(tx, input.waliId);
    return input.waliId;
  }
  const rawPhone = input.noHpWali || input.noHpAyah || input.noHpIbu || null;
  const phone = rawPhone ? rawPhone.replace(/\\D/g, "") : null;
  const name = input.namaWali || input.namaAyah || input.namaIbu || "Wali Santri";
  if (phone) {
    const existing = await tx.user.findFirst({ where: { role: Role.WALI_SANTRI, phone } });
    if (existing) return existing.id;
  }
  const email = phone ? `wali.${phone}@wali.mynurulhuda.id` : `wali.${input.nis.toLowerCase()}@wali.mynurulhuda.id`;
  const collision = await tx.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (collision) {
    if (collision.role !== Role.WALI_SANTRI) throw new AppError(409, "WALI_USERNAME_DIPAKAI", "Nomor HP/akun wali sudah dipakai role lain.");
    return collision.id;
  }
  const wali = await tx.user.create({ data: {
    email, name, phone, role: Role.WALI_SANTRI,
    passwordHash: await bcrypt.hash(input.nis, 12),
  }, select: { id: true } });
  return wali.id;
}

export async function createSantriWithWallet(
  input: SantriCreatePayload,
): Promise<SantriRow> {
  return prisma.$transaction(
    async (tx) => {
      const waliId = await resolveWaliAccount(tx, input);
      await assertSantriUnique(tx, {
        ...input,
        barcodeCode: input.barcodeCode ?? `SANTRI-${input.nis}`,
      });

      const { walletIndex, walletAddress } = await allocateWallet(tx);

      return tx.santri.create({
        data: buildSantriCreateData(input, waliId, walletIndex, walletAddress),
        select: SANTRI_SELECT,
      });
    },
    { timeout: 15_000 },
  );
}

// Import Excel sudah memvalidasi duplikasi di luar transaksi. Di sini wallet
// dialokasikan sekaligus agar seluruh baris memakai index yang berurutan.
export async function createSantriBatch(
  inputs: SantriCreatePayload[],
): Promise<number> {
  if (inputs.length === 0) {
    return 0;
  }

  return prisma.$transaction(
    async (tx) => {
      const mnemonic = walletMnemonic();
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WALLET_INDEX_LOCK_KEY})`;

      const aggregate = await tx.santri.aggregate({
        _max: { walletIndex: true },
      });
      let nextIndex = (aggregate._max.walletIndex ?? -1) + 1;

      for (const input of inputs) {
        const wallet = deriveCustodialWallet(nextIndex, mnemonic);
        const waliId = await resolveWaliAccount(tx, input);
        await tx.santri.create({
          data: buildSantriCreateData(input, waliId, nextIndex, wallet.address),
        });
        nextIndex += 1;
      }

      return inputs.length;
    },
    { timeout: 60_000 },
  );
}

export async function hitungTunggakan(
  santriIds: string[],
): Promise<Map<string, bigint>> {
  const map = new Map<string, bigint>();

  if (santriIds.length === 0) {
    return map;
  }

  const tagihan = await prisma.tagihan.findMany({
    where: {
      santriId: { in: santriIds },
      status: { not: "LUNAS" },
    },
    select: {
      santriId: true,
      nominalTagihan: true,
      nominalTerbayar: true,
    },
  });

  for (const item of tagihan) {
    const sisa = item.nominalTagihan - item.nominalTerbayar;
    if (sisa > 0n) {
      map.set(item.santriId, (map.get(item.santriId) ?? 0n) + sisa);
    }
  }

  return map;
}

export function serializeSantri(
  row: SantriRow,
  tunggakanTotal: bigint,
): SantriItem {
  return {
    id: row.id,
    nis: row.nis,
    nik: row.nik,
    nisn: row.nisn,
    nism: row.nism,
    name: row.name,
    kelas: row.kelas,
    kamar: row.kamar,
    rfidUid: row.rfidUid,
    barcodeCode: row.barcodeCode,
    tempatLahir: row.tempatLahir,
    tanggalLahir: row.tanggalLahir.toISOString().slice(0, 10),
    jenisKelamin: row.jenisKelamin,
    alamatLengkap: row.alamatLengkap,
    rtRw: row.rtRw,
    desaKelurahan: row.desaKelurahan,
    kecamatan: row.kecamatan,
    kabupatenKota: row.kabupatenKota,
    provinsi: row.provinsi,
    nomorKK: row.nomorKK,
    namaAyah: row.namaAyah,
    nikAyah: row.nikAyah,
    tempatLahirAyah: row.tempatLahirAyah,
    tanggalLahirAyah: row.tanggalLahirAyah
      ? row.tanggalLahirAyah.toISOString().slice(0, 10)
      : null,
    statusHidupAyah: row.statusHidupAyah,
    pendidikanAyah: row.pendidikanAyah,
    pekerjaanAyah: row.pekerjaanAyah,
    penghasilanAyah: row.penghasilanAyah,
    noHpAyah: row.noHpAyah,
    namaIbu: row.namaIbu,
    nikIbu: row.nikIbu,
    tempatLahirIbu: row.tempatLahirIbu,
    tanggalLahirIbu: row.tanggalLahirIbu
      ? row.tanggalLahirIbu.toISOString().slice(0, 10)
      : null,
    statusHidupIbu: row.statusHidupIbu,
    pendidikanIbu: row.pendidikanIbu,
    pekerjaanIbu: row.pekerjaanIbu,
    penghasilanIbu: row.penghasilanIbu,
    noHpIbu: row.noHpIbu,
    namaWali: row.namaWali,
    hubunganWali: row.hubunganWali,
    tempatLahirWali: row.tempatLahirWali,
    tanggalLahirWali: row.tanggalLahirWali
      ? row.tanggalLahirWali.toISOString().slice(0, 10)
      : null,
    pekerjaanWali: row.pekerjaanWali,
    penghasilanWali: row.penghasilanWali,
    noHpWali: row.noHpWali,
    alamatWali: row.alamatWali,
    fotoSantriUrl: row.fotoSantriUrl,
    fileKkUrl: row.fileKkUrl,
    fileAktaUrl: row.fileAktaUrl,
    fileIjazahUrl: row.fileIjazahUrl,
    statusMukim: row.statusMukim,
    statusSantri: row.statusSantri,
    statusAktif: row.statusAktif,
    tahunMasuk: row.tahunMasuk,
    tahunLulus: row.tahunLulus,
    nomorSyahadah: row.nomorSyahadah,
    saldoJajan: row.saldoJajan.toString(),
    limitJajanHarian: row.limitJajanHarian.toString(),
    isDispensasiInfaq: row.isDispensasiInfaq,
    catatanDispensasi: row.catatanDispensasi,
    walletAddress: row.walletAddress,
    wali: row.wali,
    tunggakanTotal: tunggakanTotal.toString(),
    bebasTunggakan: tunggakanTotal === 0n,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
