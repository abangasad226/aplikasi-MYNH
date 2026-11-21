import {
  JenisKegiatan,
  KategoriPelanggaran,
  Prisma,
  Role,
  StatusKehadiran,
} from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  getWibDayRange,
  getWibHourRange,
  getWibMonthRange,
  parseTanggal,
} from "@/lib/waktu";

const DUPLICATE_WINDOW_MS = 5_000;

const ALLOWED_ABSENSI_ROLES = new Set<Role>([
  Role.USTADZ_PENGURUS,
  Role.BENDAHARA,
]);

const ALLOWED_MONITORING_ROLES = new Set<Role>([
  Role.USTADZ_PENGURUS,
  Role.BENDAHARA,
]);

export interface KesantrianActor {
  id: string;
  role: Role;
}

export interface SantriProfile {
  id: string;
  nis: string;
  name: string;
  kelas: string;
  kamar: string;
}

interface SantriRow extends SantriProfile {
  statusAktif: boolean;
}

export interface LogAkademikRingkas {
  id: string;
  santriId: string;
  tanggal: Date;
  jenisKegiatan: JenisKegiatan;
  statusKehadiran: StatusKehadiran;
  catatanUstadz: string;
  nilaiHafalan: number | null;
  createdAt: Date;
}

export interface PelanggaranRingkas {
  id: string;
  santriId: string;
  tanggal: Date;
  kategori: KategoriPelanggaran;
  deskripsiPelanggaran: string;
  poin: number;
  tindakanPembinaan: string;
  dicatatOlehId: string;
  createdAt: Date;
}

export interface AbsensiInput {
  cardIdentifier: string;
  jenisKegiatan: JenisKegiatan;
  statusKehadiran: StatusKehadiran;
  catatanUstadz?: string;
}

export interface RekapKehadiran {
  HADIR: number;
  IZIN: number;
  SAKIT: number;
  ALPA: number;
  total: number;
}

export interface HasilAbsensi {
  santri: SantriProfile;
  log: LogAkademikRingkas;
  rekapBulanIni: RekapKehadiran;
  riwayatBulanIni: LogAkademikRingkas[];
}

export type MonitoringInput =
  | {
      tipe: "PELANGGARAN";
      cardIdentifier: string;
      kategori: KategoriPelanggaran;
      deskripsiPelanggaran: string;
      poin: number;
      tindakanPembinaan: string;
      tanggal?: string;
    }
  | {
      tipe: "AKADEMIK";
      cardIdentifier: string;
      jenisKegiatan: JenisKegiatan;
      statusKehadiran: StatusKehadiran;
      catatanUstadz?: string;
      nilaiHafalan: number;
      tanggal?: string;
    };

export type HasilMonitoring =
  | {
      tipe: "PELANGGARAN";
      santri: SantriProfile;
      pelanggaran: PelanggaranRingkas;
      totalPoinBulanIni: number;
    }
  | {
      tipe: "AKADEMIK";
      santri: SantriProfile;
      akademik: LogAkademikRingkas;
    };

async function kunciSantriByKartu(
  tx: Prisma.TransactionClient,
  cardIdentifier: string,
): Promise<SantriRow> {
  const santriRows = await tx.$queryRaw<SantriRow[]>`
    SELECT "id", "nis", "name", "kelas", "kamar", "statusAktif"
    FROM "Santri"
    WHERE "rfidUid" = ${cardIdentifier}
       OR "barcodeCode" = ${cardIdentifier}
    FOR UPDATE
  `;

  if (santriRows.length === 0) {
    throw new AppError(404, "SANTRI_NOT_FOUND", "Kartu santri tidak dikenali.");
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
    throw new AppError(409, "SANTRI_INACTIVE", "Kartu santri tidak aktif.");
  }

  return santri;
}

function toProfile(santri: SantriRow): SantriProfile {
  return {
    id: santri.id,
    nis: santri.nis,
    name: santri.name,
    kelas: santri.kelas,
    kamar: santri.kamar,
  };
}

export async function catatAbsensi(
  input: AbsensiInput,
  actor: KesantrianActor,
): Promise<HasilAbsensi> {
  if (!ALLOWED_ABSENSI_ROLES.has(actor.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Role Anda tidak dapat mencatat absensi santri.",
    );
  }

  const cardIdentifier = input.cardIdentifier.trim();
  const now = new Date();
  const hariIni = getWibDayRange(now);
  const sesi = getWibHourRange(now);

  const hasil = await prisma.$transaction<{
    santri: SantriRow;
    log: LogAkademikRingkas;
  }>(
    async (tx) => {
      const santri = await kunciSantriByKartu(tx, cardIdentifier);

      // Sesi didefinisikan sebagai jam kalender WIB yang sama untuk jenis
      // kegiatan yang sama. Santri row lock membuat dua scan bersamaan
      // diproses berurutan sehingga scan kedua melihat log pertama.
      const logSesiSama = await tx.logAkademikDanNgaji.findFirst({
        where: {
          santriId: santri.id,
          tanggal: hariIni.tanggal,
          jenisKegiatan: input.jenisKegiatan,
          createdAt: { gte: sesi.start, lt: sesi.end },
        },
        select: { id: true },
      });

      if (logSesiSama) {
        throw new AppError(
          409,
          "ABSENSI_DUPLIKAT",
          "Santri sudah tercatat absen pada sesi/jam ini.",
        );
      }

      const log = await tx.logAkademikDanNgaji.create({
        data: {
          santriId: santri.id,
          tanggal: hariIni.tanggal,
          jenisKegiatan: input.jenisKegiatan,
          statusKehadiran: input.statusKehadiran,
          catatanUstadz: input.catatanUstadz ?? "",
          nilaiHafalan: null,
        },
        select: {
          id: true,
          santriId: true,
          tanggal: true,
          jenisKegiatan: true,
          statusKehadiran: true,
          catatanUstadz: true,
          nilaiHafalan: true,
          createdAt: true,
        },
      });

      return { santri, log };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 2_000,
      timeout: 5_000,
    },
  );

  // Riwayat dibaca setelah commit agar lock santri tidak ditahan selama
  // query rekap. Log yang baru dibuat sudah termasuk dalam hasil.
  const bulanIni = getWibMonthRange(now);
  const [riwayatBulanIni, rekapRows] = await Promise.all([
    prisma.logAkademikDanNgaji.findMany({
      where: {
        santriId: hasil.santri.id,
        tanggal: {
          gte: bulanIni.startTanggal,
          lt: bulanIni.endTanggal,
        },
      },
      orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        santriId: true,
        tanggal: true,
        jenisKegiatan: true,
        statusKehadiran: true,
        catatanUstadz: true,
        nilaiHafalan: true,
        createdAt: true,
      },
    }),
    prisma.logAkademikDanNgaji.groupBy({
      by: ["statusKehadiran"],
      where: {
        santriId: hasil.santri.id,
        tanggal: {
          gte: bulanIni.startTanggal,
          lt: bulanIni.endTanggal,
        },
      },
      _count: { _all: true },
    }),
  ]);

  const rekapBulanIni: RekapKehadiran = {
    HADIR: 0,
    IZIN: 0,
    SAKIT: 0,
    ALPA: 0,
    total: 0,
  };

  for (const row of rekapRows) {
    rekapBulanIni[row.statusKehadiran] = row._count._all;
    rekapBulanIni.total += row._count._all;
  }

  return {
    santri: toProfile(hasil.santri),
    log: hasil.log,
    rekapBulanIni,
    riwayatBulanIni,
  };
}

export async function catatMonitoring(
  input: MonitoringInput,
  actor: KesantrianActor,
): Promise<HasilMonitoring> {
  if (!ALLOWED_MONITORING_ROLES.has(actor.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Role Anda tidak dapat mencatat monitoring santri.",
    );
  }

  const cardIdentifier = input.cardIdentifier.trim();
  const now = new Date();
  const tanggal = parseTanggal(input.tanggal, now);

  // Poin dan nilai tidak boleh dicatat untuk tanggal yang belum terjadi;
  // selain tidak masuk akal, data tersebut tidak akan muncul di rekap bulan
  // berjalan padahal sudah tercatat.
  if (tanggal.getTime() > getWibDayRange(now).tanggal.getTime()) {
    throw new AppError(
      400,
      "TANGGAL_MASA_DEPAN",
      "Tanggal tidak boleh melebihi hari ini (WIB).",
    );
  }

  const batasDuplikat = new Date(now.getTime() - DUPLICATE_WINDOW_MS);

  return prisma.$transaction<HasilMonitoring>(
    async (tx) => {
      const santri = await kunciSantriByKartu(tx, cardIdentifier);

      if (input.tipe === "PELANGGARAN") {
        const pelanggaranDuplikat = await tx.logPelanggaran.findFirst({
          where: {
            santriId: santri.id,
            tanggal,
            kategori: input.kategori,
            deskripsiPelanggaran: input.deskripsiPelanggaran,
            poin: input.poin,
            tindakanPembinaan: input.tindakanPembinaan,
            createdAt: { gt: batasDuplikat },
          },
          select: { id: true },
        });

        if (pelanggaranDuplikat) {
          throw new AppError(
            409,
            "DUPLIKAT_INPUT",
            "Catatan pelanggaran yang sama baru saja disimpan.",
          );
        }

        const pelanggaran = await tx.logPelanggaran.create({
          data: {
            santriId: santri.id,
            tanggal,
            kategori: input.kategori,
            deskripsiPelanggaran: input.deskripsiPelanggaran,
            poin: input.poin,
            tindakanPembinaan: input.tindakanPembinaan,
            dicatatOlehId: actor.id,
          },
          select: {
            id: true,
            santriId: true,
            tanggal: true,
            kategori: true,
            deskripsiPelanggaran: true,
            poin: true,
            tindakanPembinaan: true,
            dicatatOlehId: true,
            createdAt: true,
          },
        });

        const bulanIni = getWibMonthRange(now);
        const totalPoin = await tx.logPelanggaran.aggregate({
          where: {
            santriId: santri.id,
            tanggal: {
              gte: bulanIni.startTanggal,
              lt: bulanIni.endTanggal,
            },
          },
          _sum: { poin: true },
        });

        return {
          tipe: "PELANGGARAN",
          santri: toProfile(santri),
          pelanggaran,
          totalPoinBulanIni: totalPoin._sum.poin ?? 0,
        };
      }

      const catatanUstadz = input.catatanUstadz ?? "";
      const akademikDuplikat = await tx.logAkademikDanNgaji.findFirst({
        where: {
          santriId: santri.id,
          tanggal,
          jenisKegiatan: input.jenisKegiatan,
          statusKehadiran: input.statusKehadiran,
          catatanUstadz,
          nilaiHafalan: input.nilaiHafalan,
          createdAt: { gt: batasDuplikat },
        },
        select: { id: true },
      });

      if (akademikDuplikat) {
        throw new AppError(
          409,
          "DUPLIKAT_INPUT",
          "Catatan perkembangan yang sama baru saja disimpan.",
        );
      }

      const akademik = await tx.logAkademikDanNgaji.create({
        data: {
          santriId: santri.id,
          tanggal,
          jenisKegiatan: input.jenisKegiatan,
          statusKehadiran: input.statusKehadiran,
          catatanUstadz,
          nilaiHafalan: input.nilaiHafalan,
        },
        select: {
          id: true,
          santriId: true,
          tanggal: true,
          jenisKegiatan: true,
          statusKehadiran: true,
          catatanUstadz: true,
          nilaiHafalan: true,
          createdAt: true,
        },
      });

      return {
        tipe: "AKADEMIK",
        santri: toProfile(santri),
        akademik,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: 2_000,
      timeout: 5_000,
    },
  );
}
