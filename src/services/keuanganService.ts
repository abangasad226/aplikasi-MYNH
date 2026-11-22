import {
  JenisTagihan,
  JenisTransaksi,
  MetodePembayaran,
  Prisma,
  Role,
  StatusSantri,
  StatusTagihan,
  Web3SyncStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { MAX_NOMINAL_SETORAN } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { web3Service } from "@/lib/web3Service";

const NAMA_BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

const ALLOWED_ACTOR_ROLES = new Set<Role>([
  Role.BENDAHARA,
  Role.WALI_SANTRI,
]);

const PENCAIRAN_ACTOR_ROLES = new Set<Role>([
  Role.BENDAHARA,
]);

interface TagihanTerbuka {
  id: string;
  bulan: number;
  tahun: number;
  nominalTagihan: bigint;
  nominalTerbayar: bigint;
}

export interface KeuanganActor {
  id: string;
  role: Role;
}

export interface SetoranJajanInput {
  santriId: string;
  nominalSetor: bigint;
  metodePembayaran: MetodePembayaran;
  keterangan?: string;
}

export interface AlokasiInfaq {
  tagihanId: string;
  bulan: number;
  tahun: number;
  nominal: bigint;
  status: StatusTagihan;
}

export interface TransaksiRingkas {
  id: string;
  kodeTransaksi: string;
  jenisTransaksi: JenisTransaksi;
  nominal: bigint;
  web3Status: Web3SyncStatus;
}

export interface HasilSetoranJajan {
  referensiSetoran: string;
  santriId: string;
  nominalSetor: bigint;
  autoRedirectAktif: boolean;
  totalDialihkanKeInfaq: bigint;
  totalMasukSaldoJajan: bigint;
  saldoJajanAkhir: bigint;
  alokasiInfaq: AlokasiInfaq[];
  transaksi: TransaksiRingkas[];
}

function namaBulan(bulan: number): string {
  return NAMA_BULAN[bulan - 1] ?? `bulan ${bulan}`;
}

function buatReferensiSetoran(): string {
  return `SETOR-${Date.now()}-${randomUUID()}`;
}

function buatKodeTransaksi(prefix: "TOPUP" | "REDIRECT" | "REVERSAL"): string {
  return `${prefix}-${Date.now()}-${randomUUID()}`;
}

/**
 * Menyimpan setoran uang jajan dan menjalankan auto-redirect ke tunggakan
 * Infaq Makan sesuai kebijakan AUTO_REDIRECT_JAJAN_TO_INFAQ.
 *
 * Satu setoran dapat menghasilkan beberapa transaksi ledger: satu
 * REDIRECT_JAJAN_KE_INFAQ per tagihan yang dialokasikan, lalu satu
 * TOPUP_JAJAN untuk sisa yang benar-benar masuk saldo jajan.
 */
export async function setorTitipanJajan(
  input: SetoranJajanInput,
  actor: KeuanganActor,
): Promise<HasilSetoranJajan> {
  if (!ALLOWED_ACTOR_ROLES.has(actor.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Role Anda tidak dapat melakukan setoran uang jajan.",
    );
  }

  if (input.nominalSetor <= 0n || input.nominalSetor > MAX_NOMINAL_SETORAN) {
    throw new AppError(
      400,
      "NOMINAL_TIDAK_VALID",
      `nominalSetor harus lebih dari 0 dan maksimal ${MAX_NOMINAL_SETORAN.toString()} rupiah.`,
    );
  }

  if (input.metodePembayaran === MetodePembayaran.AUTO_SYSTEM) {
    throw new AppError(
      400,
      "METODE_TIDAK_VALID",
      "AUTO_SYSTEM tidak dapat digunakan untuk setoran manual.",
    );
  }

  const referensiSetoran = buatReferensiSetoran();

  const hasil = await prisma.$transaction<HasilSetoranJajan>(
    async (tx) => {
      // Kunci baris Santri lebih dahulu. Semua setoran untuk santri yang sama
      // akan antre di titik ini sehingga saldo tidak bisa terkena lost update.
      // Urutan lock selalu Santri -> Tagihan untuk menghindari deadlock.
      await tx.$queryRaw`
        SELECT "id"
        FROM "Santri"
        WHERE "id" = ${input.santriId}
        FOR UPDATE
      `;

      const santri = await tx.santri.findUnique({
        where: { id: input.santriId },
        select: {
          id: true,
          waliId: true,
          statusAktif: true,
          saldoJajan: true,
          isDispensasiInfaq: true,
        },
      });

      if (!santri) {
        throw new AppError(
          404,
          "SANTRI_NOT_FOUND",
          "Santri tidak ditemukan.",
        );
      }

      if (actor.role === Role.WALI_SANTRI && santri.waliId !== actor.id) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Wali hanya dapat menyetor untuk santri miliknya.",
        );
      }

      if (!santri.statusAktif) {
        throw new AppError(
          409,
          "SANTRI_INACTIVE",
          "Santri tidak aktif sehingga setoran tidak dapat diproses.",
        );
      }

      // Langkah A: baca kebijakan auto-redirect. Setting yang tidak ada
      // diperlakukan sebagai nonaktif agar tidak ada pengalihan tanpa opt-in.
      // Santri dengan dispensasi Infaq Makan selalu dilewati, sehingga seluruh
      // setoran langsung menjadi saldo jajan.
      const autoRedirectAktif = true;

      let tagihanList: TagihanTerbuka[] = [];

      if (autoRedirectAktif && !santri.isDispensasiInfaq) {
        // Langkah B: kunci lalu ambil semua Infaq Makan yang masih terbuka,
        // diurutkan dari tahun/bulan paling lama.
        await tx.$queryRaw`
          SELECT "id"
          FROM "Tagihan"
          WHERE "santriId" = ${input.santriId}
            AND "jenisTagihan" = ${JenisTagihan.INFAQ_MAKAN}::"JenisTagihan"
            AND "status" IN (
              ${StatusTagihan.BELUM_LUNAS}::"StatusTagihan",
              ${StatusTagihan.CICILAN}::"StatusTagihan"
            )
          ORDER BY "tahun" ASC, "bulan" ASC
          FOR UPDATE
        `;

        tagihanList = await tx.tagihan.findMany({
          where: {
            santriId: input.santriId,
            jenisTagihan: JenisTagihan.INFAQ_MAKAN,
            status: {
              in: [StatusTagihan.BELUM_LUNAS, StatusTagihan.CICILAN],
            },
          },
          orderBy: [{ tahun: "asc" }, { bulan: "asc" }],
          select: {
            id: true,
            bulan: true,
            tahun: true,
            nominalTagihan: true,
            nominalTerbayar: true,
          },
        });
      }

      let sisaSetoran = input.nominalSetor;
      let totalDialihkanKeInfaq = 0n;
      const alokasiInfaq: AlokasiInfaq[] = [];
      const transaksi: TransaksiRingkas[] = [];

      // Langkah C: alokasikan setoran ke tagihan terlama. Selama masih ada
      // sisa dan tagihan berikutnya, proses pelunasan diulang.
      for (const tagihan of tagihanList) {
        if (sisaSetoran === 0n) {
          break;
        }

        const sisaTagihan =
          tagihan.nominalTagihan - tagihan.nominalTerbayar;

        if (sisaTagihan <= 0n) {
          continue;
        }

        const nominalAlokasi =
          sisaSetoran >= sisaTagihan ? sisaTagihan : sisaSetoran;

        if (nominalAlokasi <= 0n) {
          break;
        }

        const statusBaru =
          tagihan.nominalTerbayar + nominalAlokasi >=
          tagihan.nominalTagihan
            ? StatusTagihan.LUNAS
            : StatusTagihan.CICILAN;

        await tx.tagihan.update({
          where: { id: tagihan.id },
          data: {
            nominalTerbayar: { increment: nominalAlokasi },
            status: statusBaru,
          },
        });

        const kataAlokasi =
          statusBaru === StatusTagihan.LUNAS ? "pelunasan" : "cicilan";

        const redirect = await tx.transaksiKeuangan.create({
          data: {
            kodeTransaksi: buatKodeTransaksi("REDIRECT"),
            santriId: input.santriId,
            jenisTransaksi: JenisTransaksi.REDIRECT_JAJAN_KE_INFAQ,
            nominal: nominalAlokasi,
            metodePembayaran: MetodePembayaran.AUTO_SYSTEM,
            keterangan:
              `Otomatis dialihkan dari uang jajan untuk ` +
              `${kataAlokasi} Infaq Makan bulan ${namaBulan(tagihan.bulan)} ` +
              `${tagihan.tahun} (ref: ${referensiSetoran}, ` +
              `sumber: ${input.metodePembayaran}).`,
            createdById: actor.id,
            web3Status: Web3SyncStatus.PENDING,
            tagihanId: tagihan.id,
          },
          select: {
            id: true,
            kodeTransaksi: true,
            jenisTransaksi: true,
            nominal: true,
            web3Status: true,
          },
        });

        transaksi.push(redirect);
        alokasiInfaq.push({
          tagihanId: tagihan.id,
          bulan: tagihan.bulan,
          tahun: tagihan.tahun,
          nominal: nominalAlokasi,
          status: statusBaru,
        });

        sisaSetoran -= nominalAlokasi;
        totalDialihkanKeInfaq += nominalAlokasi;
      }

      // Langkah D: sisa setoran masuk saldo jajan. Jika setting nonaktif atau
      // tidak ada tunggakan, seluruh nominalSetor akan mencapai blok ini.
      let totalMasukSaldoJajan = 0n;
      let saldoJajanAkhir = santri.saldoJajan;

      if (sisaSetoran > 0n) {
        const santriSetelahUpdate = await tx.santri.update({
          where: { id: input.santriId },
          data: { saldoJajan: { increment: sisaSetoran } },
          select: { saldoJajan: true },
        });

        saldoJajanAkhir = santriSetelahUpdate.saldoJajan;
        totalMasukSaldoJajan = sisaSetoran;

        const keteranganTopup = [
          `Uang jajan (ref: ${referensiSetoran})`,
          input.keterangan,
        ]
          .filter((bagian): bagian is string => Boolean(bagian))
          .join(" - ");

        const topup = await tx.transaksiKeuangan.create({
          data: {
            kodeTransaksi: buatKodeTransaksi("TOPUP"),
            santriId: input.santriId,
            jenisTransaksi: JenisTransaksi.TOPUP_JAJAN,
            nominal: sisaSetoran,
            metodePembayaran: input.metodePembayaran,
            keterangan: keteranganTopup,
            createdById: actor.id,
            web3Status: Web3SyncStatus.PENDING,
          },
          select: {
            id: true,
            kodeTransaksi: true,
            jenisTransaksi: true,
            nominal: true,
            web3Status: true,
          },
        });

        transaksi.push(topup);
      }

      return {
        referensiSetoran,
        santriId: input.santriId,
        nominalSetor: input.nominalSetor,
        autoRedirectAktif,
        totalDialihkanKeInfaq,
        totalMasukSaldoJajan,
        saldoJajanAkhir,
        alokasiInfaq,
        transaksi,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );

  // Langkah E: antrekan sinkronisasi on-chain SETELAH commit. Jika RPC mati,
  // record tetap tersimpan dengan status PENDING dan dapat di-retry.
  for (const transaksiTercatat of hasil.transaksi) {
    web3Service.catatTransaksi(transaksiTercatat.id);
  }

  return hasil;
}

export interface PencairanSaldoJajanInput {
  santriId: string;
  nominalPencairan: bigint;
  metodePembayaran: MetodePembayaran;
  keterangan?: string;
}

export interface HasilPencairanSaldoJajan {
  transaksi: TransaksiRingkas;
  santri: {
    id: string;
    nis: string;
    name: string;
    statusSantri: StatusSantri;
  };
  saldoJajanAkhir: bigint;
}

function buatKodePencairan(): string {
  return `PENARIKAN-${Date.now()}-${randomUUID()}`;
}

/**
 * Mencairkan sisa saldo jajan santri (termasuk alumni/keluar) secara tunai
 * atau transfer. Saldo dikunci dan dikurangi dalam satu transaksi DB, lalu
 * jejaknya dicatat sebagai PENARIKAN_TUNAI yang tidak perlu disinkronkan
 * on-chain (dana tunai di luar ledger kontrak).
 */
export async function cairkanSaldoJajan(
  input: PencairanSaldoJajanInput,
  actor: KeuanganActor,
): Promise<HasilPencairanSaldoJajan> {
  if (!PENCAIRAN_ACTOR_ROLES.has(actor.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Hanya Bendahara atau Super Admin yang dapat mencairkan saldo jajan.",
    );
  }

  if (
    input.nominalPencairan <= 0n ||
    input.nominalPencairan > MAX_NOMINAL_SETORAN
  ) {
    throw new AppError(
      400,
      "NOMINAL_TIDAK_VALID",
      `nominalPencairan harus lebih dari 0 dan maksimal ${MAX_NOMINAL_SETORAN.toString()} rupiah.`,
    );
  }

  if (
    input.metodePembayaran !== MetodePembayaran.TUNAI_BENDAHARA &&
    input.metodePembayaran !== MetodePembayaran.TRANSFER_VA
  ) {
    throw new AppError(
      400,
      "METODE_TIDAK_VALID",
      "Pencairan hanya dapat dibayarkan tunai oleh bendahara atau transfer.",
    );
  }

  return prisma.$transaction<HasilPencairanSaldoJajan>(
    async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "Santri"
        WHERE "id" = ${input.santriId}
        FOR UPDATE
      `;

      const santri = await tx.santri.findUnique({
        where: { id: input.santriId },
        select: {
          id: true,
          nis: true,
          name: true,
          statusSantri: true,
          saldoJajan: true,
        },
      });

      if (!santri) {
        throw new AppError(
          404,
          "SANTRI_NOT_FOUND",
          "Santri tidak ditemukan.",
        );
      }

      if (santri.saldoJajan <= 0n) {
        throw new AppError(
          409,
          "SALDO_KOSONG",
          "Saldo jajan santri sudah kosong.",
        );
      }

      if (input.nominalPencairan > santri.saldoJajan) {
        throw new AppError(
          409,
          "NOMINAL_MELEBIHI_SALDO",
          `Nominal pencairan melebihi saldo jajan tersedia (${santri.saldoJajan.toString()} rupiah).`,
        );
      }

      const santriSetelahUpdate = await tx.santri.update({
        where: { id: santri.id },
        data: { saldoJajan: { decrement: input.nominalPencairan } },
        select: { saldoJajan: true },
      });

      const keterangan = [
        `Pencairan saldo jajan (status ${santri.statusSantri}, metode ${input.metodePembayaran})`,
        input.keterangan,
      ]
        .filter((bagian): bagian is string => Boolean(bagian))
        .join(" - ");

      const transaksi = await tx.transaksiKeuangan.create({
        data: {
          kodeTransaksi: buatKodePencairan(),
          santriId: santri.id,
          jenisTransaksi: JenisTransaksi.PENARIKAN_TUNAI,
          nominal: input.nominalPencairan,
          metodePembayaran: input.metodePembayaran,
          keterangan,
          createdById: actor.id,
          // Penarikan tunai/transfer tidak meninggalkan jejak on-chain.
          web3Status: Web3SyncStatus.NOT_REQUIRED,
        },
        select: {
          id: true,
          kodeTransaksi: true,
          jenisTransaksi: true,
          nominal: true,
          web3Status: true,
        },
      });

      return {
        transaksi,
        santri: {
          id: santri.id,
          nis: santri.nis,
          name: santri.name,
          statusSantri: santri.statusSantri,
        },
        saldoJajanAkhir: santriSetelahUpdate.saldoJajan,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );
}

export interface HasilReversalInfaq {
  transaksi: TransaksiRingkas;
  transaksiAsalId: string;
  santri: {
    id: string;
    nis: string;
    name: string;
    saldoJajanAkhir: bigint;
  };
  tagihan: {
    id: string;
    bulan: number;
    tahun: number;
    nominalTerbayar: bigint;
    status: StatusTagihan;
  };
}

function cariPeriodeDariKeterangan(
  keterangan: string | null,
): { bulan: number; tahun: number } | null {
  if (!keterangan) {
    return null;
  }

  const cocok = /bulan\s+([A-Za-z]+)\s+(\d{4})/i.exec(keterangan);
  if (!cocok) {
    return null;
  }

  const indeks = NAMA_BULAN.findIndex(
    (nama) => nama.toLowerCase() === cocok[1].toLowerCase(),
  );

  return indeks >= 0 ? { bulan: indeks + 1, tahun: Number(cocok[2]) } : null;
}

/**
 * Mengembalikan dana auto-redirect Infaq Makan ke saldo uang jajan santri
 * (dispensasi Bendahara). Tagihan terkait dikurangi sebesar nominal transaksi
 * asal dan statusnya dikembalikan ke CICILAN/BELUM_LUNAS. Setiap transaksi
 * hanya boleh di-reversal satu kali; jejak on-chain dicatat sebagai kategori 6.
 */
export async function kembalikanInfaqKeJajan(
  transaksiId: string,
  bendaharaId: string,
  alasanDispensasi: string,
): Promise<HasilReversalInfaq> {
  const alasan = alasanDispensasi.trim();

  if (!alasan) {
    throw new AppError(
      400,
      "ALASAN_WAJIB",
      "Alasan dispensasi wajib diisi.",
    );
  }

  if (alasan.length > 500) {
    throw new AppError(
      400,
      "ALASAN_TERLALU_PANJANG",
      "Alasan dispensasi maksimal 500 karakter.",
    );
  }

  const hasil = await prisma.$transaction<HasilReversalInfaq>(
    async (tx) => {
      const pelaku = await tx.user.findUnique({
        where: { id: bendaharaId },
        select: { role: true },
      });

      if (!pelaku || !PENCAIRAN_ACTOR_ROLES.has(pelaku.role)) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "Hanya Bendahara atau Super Admin yang dapat mengembalikan dana Infaq Makan.",
        );
      }

      // Kunci transaksi asal lebih dahulu agar dua permintaan reversal pada
      // transaksi yang sama tidak lolos validasi secara bersamaan.
      await tx.$queryRaw`
        SELECT "id"
        FROM "TransaksiKeuangan"
        WHERE "id" = ${transaksiId}
        FOR UPDATE
      `;

      const asal = await tx.transaksiKeuangan.findUnique({
        where: { id: transaksiId },
        select: {
          id: true,
          santriId: true,
          jenisTransaksi: true,
          nominal: true,
          tagihanId: true,
          keterangan: true,
          reversedBy: { select: { id: true } },
        },
      });

      if (!asal) {
        throw new AppError(
          404,
          "TRANSAKSI_NOT_FOUND",
          "Transaksi tidak ditemukan.",
        );
      }

      if (asal.jenisTransaksi !== JenisTransaksi.REDIRECT_JAJAN_KE_INFAQ) {
        throw new AppError(
          400,
          "JENIS_TRANSAKSI_TIDAK_VALID",
          "Hanya transaksi REDIRECT_JAJAN_KE_INFAQ yang dapat dikembalikan ke uang jajan.",
        );
      }

      if (asal.reversedBy) {
        throw new AppError(
          409,
          "SUDAH_DIREVERSAL",
          "Transaksi ini sudah pernah dikembalikan ke uang jajan.",
        );
      }

      // Lock Santri lalu Tagihan, mengikuti urutan lock setoran agar tidak
      // terjadi deadlock.
      await tx.$queryRaw`
        SELECT "id"
        FROM "Santri"
        WHERE "id" = ${asal.santriId}
        FOR UPDATE
      `;

      const santri = await tx.santri.findUnique({
        where: { id: asal.santriId },
        select: { id: true, nis: true, name: true },
      });

      if (!santri) {
        throw new AppError(
          404,
          "SANTRI_NOT_FOUND",
          "Santri transaksi tidak ditemukan.",
        );
      }

      let tagihanId = asal.tagihanId;

      if (!tagihanId) {
        // Data lama (pra-kolom tagihanId): tebak tagihan dari keterangan.
        const periode = cariPeriodeDariKeterangan(asal.keterangan);

        if (!periode) {
          throw new AppError(
            409,
            "TAGIHAN_TIDAK_DITEMUKAN",
            "Tagihan Infaq Makan terkait transaksi ini tidak dapat ditentukan.",
          );
        }

        const kandidat = await tx.tagihan.findFirst({
          where: {
            santriId: asal.santriId,
            jenisTagihan: JenisTagihan.INFAQ_MAKAN,
            bulan: periode.bulan,
            tahun: periode.tahun,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });

        if (!kandidat) {
          throw new AppError(
            409,
            "TAGIHAN_TIDAK_DITEMUKAN",
            "Tagihan Infaq Makan terkait transaksi ini tidak ditemukan.",
          );
        }

        tagihanId = kandidat.id;
      }

      await tx.$queryRaw`
        SELECT "id"
        FROM "Tagihan"
        WHERE "id" = ${tagihanId}
        FOR UPDATE
      `;

      const tagihan = await tx.tagihan.findUnique({
        where: { id: tagihanId },
        select: {
          id: true,
          santriId: true,
          bulan: true,
          tahun: true,
          nominalTerbayar: true,
        },
      });

      if (!tagihan || tagihan.santriId !== asal.santriId) {
        throw new AppError(
          409,
          "TAGIHAN_TIDAK_SESUAI",
          "Tagihan Infaq Makan tidak sesuai dengan santri transaksi ini.",
        );
      }

      if (tagihan.nominalTerbayar < asal.nominal) {
        throw new AppError(
          409,
          "TAGIHAN_TIDAK_SESUAI",
          "Nominal terbayar tagihan lebih kecil dari nominal transaksi yang akan dikembalikan.",
        );
      }

      const nominalTerbayarBaru = tagihan.nominalTerbayar - asal.nominal;
      const statusBaru =
        nominalTerbayarBaru > 0n
          ? StatusTagihan.CICILAN
          : StatusTagihan.BELUM_LUNAS;

      const tagihanSetelahUpdate = await tx.tagihan.update({
        where: { id: tagihan.id },
        data: {
          nominalTerbayar: nominalTerbayarBaru,
          status: statusBaru,
        },
        select: { nominalTerbayar: true, status: true },
      });

      const santriSetelahUpdate = await tx.santri.update({
        where: { id: santri.id },
        data: { saldoJajan: { increment: asal.nominal } },
        select: { saldoJajan: true },
      });

      const transaksi = await tx.transaksiKeuangan.create({
        data: {
          kodeTransaksi: buatKodeTransaksi("REVERSAL"),
          santriId: santri.id,
          jenisTransaksi: JenisTransaksi.REVERSAL_INFAQ_KE_JAJAN,
          nominal: asal.nominal,
          metodePembayaran: MetodePembayaran.AUTO_SYSTEM,
          keterangan: `Dispensasi Bendahara: ${alasan}`,
          createdById: bendaharaId,
          web3Status: Web3SyncStatus.PENDING,
          tagihanId: tagihan.id,
          reversalOfId: asal.id,
        },
        select: {
          id: true,
          kodeTransaksi: true,
          jenisTransaksi: true,
          nominal: true,
          web3Status: true,
        },
      });

      return {
        transaksi,
        transaksiAsalId: asal.id,
        santri: {
          id: santri.id,
          nis: santri.nis,
          name: santri.name,
          saldoJajanAkhir: santriSetelahUpdate.saldoJajan,
        },
        tagihan: {
          id: tagihan.id,
          bulan: tagihan.bulan,
          tahun: tagihan.tahun,
          nominalTerbayar: tagihanSetelahUpdate.nominalTerbayar,
          status: tagihanSetelahUpdate.status,
        },
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 5_000,
      timeout: 15_000,
    },
  );

  web3Service.catatTransaksi(hasil.transaksi.id);

  return hasil;
}
