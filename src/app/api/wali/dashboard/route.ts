import {
  JenisTagihan,
  Role,
  StatusTagihan,
  type JenisKegiatan,
  type StatusKehadiran,
} from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AUTO_REDIRECT_JAJAN_TO_INFAQ_KEY } from "@/lib/constants";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  formatTanggal,
  getWibMonthRange,
  getWibYearMonth,
} from "@/lib/waktu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [
  Role.WALI_SANTRI,
  Role.BENDAHARA,
] as const;

const CHILD_SELECT = {
  id: true,
  nis: true,
  name: true,
  kelas: true,
  kamar: true,
  saldoJajan: true,
  statusAktif: true,
} as const;

type ChildRow = {
  id: string;
  nis: string;
  name: string;
  kelas: string;
  kamar: string;
  saldoJajan: bigint;
  statusAktif: boolean;
};

type TagihanRow = {
  id: string;
  jenisTagihan: JenisTagihan;
  bulan: number;
  tahun: number;
  nominalTagihan: bigint;
  nominalTerbayar: bigint;
  status: StatusTagihan;
  jatuhTempo: Date;
};

function serializeSantri(santri: ChildRow) {
  return {
    id: santri.id,
    nis: santri.nis,
    name: santri.name,
    kelas: santri.kelas,
    kamar: santri.kamar,
    saldoJajan: santri.saldoJajan.toString(),
    statusAktif: santri.statusAktif,
  };
}

function serializeTagihan(tagihan: TagihanRow) {
  const sisa =
    tagihan.nominalTagihan > tagihan.nominalTerbayar
      ? tagihan.nominalTagihan - tagihan.nominalTerbayar
      : 0n;

  return {
    id: tagihan.id,
    jenisTagihan: tagihan.jenisTagihan,
    bulan: tagihan.bulan,
    tahun: tagihan.tahun,
    nominalTagihan: tagihan.nominalTagihan.toString(),
    nominalTerbayar: tagihan.nominalTerbayar.toString(),
    sisa: sisa.toString(),
    status: tagihan.status,
    jatuhTempo: formatTanggal(tagihan.jatuhTempo),
  };
}

function extractReferensiSetoran(keterangan: string | null): string | null {
  if (!keterangan) {
    return null;
  }

  const match = keterangan.match(/\(ref:\s*([^)]+)\)/i);
  return match?.[1]?.trim() || null;
}

function rekapKosong() {
  return { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0, total: 0 };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRoles(request, ALLOWED_ROLES);
    const santriIdParam =
      request.nextUrl.searchParams.get("santriId")?.trim() || null;
    const isWali = actor.role === Role.WALI_SANTRI;

    const children = await prisma.santri.findMany({
      where: isWali ? { waliId: actor.id } : { statusAktif: true },
      orderBy: { name: "asc" },
      take: isWali ? undefined : 100,
      select: CHILD_SELECT,
    });

    let target: ChildRow | null = null;

    if (santriIdParam) {
      target = children.find((child) => child.id === santriIdParam) ?? null;

      if (!target) {
        if (isWali) {
          throw new AppError(
            403,
            "FORBIDDEN",
            "Santri tersebut tidak terhubung dengan akun wali ini.",
          );
        }

        target = await prisma.santri.findUnique({
          where: { id: santriIdParam },
          select: CHILD_SELECT,
        });

        if (!target) {
          throw new AppError(
            404,
            "SANTRI_NOT_FOUND",
            "Data santri tidak ditemukan.",
          );
        }
      }
    } else {
      target = children[0] ?? null;
    }

    const wali = {
      name: actor.name,
      email: actor.email,
    };

    if (!target) {
      return jsonData({
        wali,
        children: children.map(serializeSantri),
        selected: null,
        generatedAt: new Date().toISOString(),
      });
    }

    const periode = getWibYearMonth();
    const bulanIni = getWibMonthRange();

    const [
      tagihanBulanIni,
      tunggakanInfaq,
      transaksi,
      kehadiranGroups,
      perkembangan,
      pelanggaran,
      poinBulanIni,
      poinTotal,
      setting,
    ] = await Promise.all([
      prisma.tagihan.findMany({
        where: {
          santriId: target.id,
          bulan: periode.bulan,
          tahun: periode.tahun,
        },
        orderBy: [{ jenisTagihan: "asc" }],
        select: {
          id: true,
          jenisTagihan: true,
          bulan: true,
          tahun: true,
          nominalTagihan: true,
          nominalTerbayar: true,
          status: true,
          jatuhTempo: true,
        },
      }),
      prisma.tagihan.findMany({
        where: {
          santriId: target.id,
          jenisTagihan: JenisTagihan.INFAQ_MAKAN,
          status: { not: StatusTagihan.LUNAS },
        },
        orderBy: [{ tahun: "asc" }, { bulan: "asc" }],
        select: {
          id: true,
          jenisTagihan: true,
          bulan: true,
          tahun: true,
          nominalTagihan: true,
          nominalTerbayar: true,
          status: true,
          jatuhTempo: true,
        },
      }),
      prisma.transaksiKeuangan.findMany({
        where: { santriId: target.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50,
        select: {
          id: true,
          kodeTransaksi: true,
          jenisTransaksi: true,
          nominal: true,
          metodePembayaran: true,
          keterangan: true,
          createdAt: true,
          web3Status: true,
          txHashWeb3: true,
          merchant: { select: { namaKantin: true } },
        },
      }),
      prisma.logAkademikDanNgaji.groupBy({
        by: ["jenisKegiatan", "statusKehadiran"],
        where: {
          santriId: target.id,
          tanggal: { gte: bulanIni.startTanggal, lt: bulanIni.endTanggal },
        },
        _count: { _all: true },
      }),
      prisma.logAkademikDanNgaji.findMany({
        where: {
          santriId: target.id,
          tanggal: { gte: bulanIni.startTanggal, lt: bulanIni.endTanggal },
          OR: [
            { nilaiHafalan: { not: null } },
            { catatanUstadz: { not: "" } },
          ],
        },
        orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          tanggal: true,
          jenisKegiatan: true,
          statusKehadiran: true,
          catatanUstadz: true,
          nilaiHafalan: true,
          createdAt: true,
        },
      }),
      prisma.logPelanggaran.findMany({
        where: {
          santriId: target.id,
          tanggal: { gte: bulanIni.startTanggal, lt: bulanIni.endTanggal },
        },
        orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          tanggal: true,
          kategori: true,
          deskripsiPelanggaran: true,
          poin: true,
          tindakanPembinaan: true,
          createdAt: true,
          dicatatOleh: { select: { name: true } },
        },
      }),
      prisma.logPelanggaran.aggregate({
        where: {
          santriId: target.id,
          tanggal: { gte: bulanIni.startTanggal, lt: bulanIni.endTanggal },
        },
        _sum: { poin: true },
      }),
      prisma.logPelanggaran.aggregate({
        where: { santriId: target.id },
        _sum: { poin: true },
      }),
      prisma.systemSetting.findUnique({
        where: { key: AUTO_REDIRECT_JAJAN_TO_INFAQ_KEY },
        select: { value: true },
      }),
    ]);

    const rekapKehadiran: Record<
      JenisKegiatan,
      Record<StatusKehadiran, number> & { total: number }
    > = {
      SHOLAT_JEMAAH: rekapKosong(),
      NGAJI_KITAB: rekapKosong(),
      TAHFIDZ: rekapKosong(),
      SEKOLAH_FORMAL: rekapKosong(),
    };

    for (const row of kehadiranGroups) {
      rekapKehadiran[row.jenisKegiatan][row.statusKehadiran] =
        row._count._all;
    }

    for (const rekap of Object.values(rekapKehadiran)) {
      rekap.total = rekap.HADIR + rekap.IZIN + rekap.SAKIT + rekap.ALPA;
    }

    const tagihanTerserialisasi = tagihanBulanIni.map(serializeTagihan);
    const tunggakanTerserialisasi = tunggakanInfaq.map(serializeTagihan);
    const totalTunggakan = tunggakanInfaq.reduce((total, tagihan) => {
      const sisa =
        tagihan.nominalTagihan > tagihan.nominalTerbayar
          ? tagihan.nominalTagihan - tagihan.nominalTerbayar
          : 0n;
      return total + sisa;
    }, 0n);

    return jsonData({
      wali,
      children: children.map(serializeSantri),
      selected: {
        santri: serializeSantri(target),
        policy: {
          autoRedirectAktif:
            setting?.value.trim().toLowerCase() === "true",
        },
        periode,
        tagihanBulanIni: tagihanTerserialisasi,
        tunggakanInfaq: {
          total: totalTunggakan.toString(),
          jumlahTagihan: tunggakanTerserialisasi.length,
          tagihan: tunggakanTerserialisasi,
        },
        transaksi: transaksi.map((tx) => ({
          id: tx.id,
          kodeTransaksi: tx.kodeTransaksi,
          jenisTransaksi: tx.jenisTransaksi,
          nominal: tx.nominal.toString(),
          metodePembayaran: tx.metodePembayaran,
          keterangan: tx.keterangan,
          merchant: tx.merchant?.namaKantin ?? null,
          createdAt: tx.createdAt.toISOString(),
          web3Status: tx.web3Status,
          txHashWeb3: tx.txHashWeb3,
          referensiSetoran: extractReferensiSetoran(tx.keterangan),
        })),
        kehadiran: rekapKehadiran,
        perkembangan: perkembangan.map((log) => ({
          id: log.id,
          tanggal: formatTanggal(log.tanggal),
          jenisKegiatan: log.jenisKegiatan,
          statusKehadiran: log.statusKehadiran,
          catatanUstadz: log.catatanUstadz,
          nilaiHafalan: log.nilaiHafalan,
          createdAt: log.createdAt.toISOString(),
        })),
        pelanggaran: pelanggaran.map((item) => ({
          id: item.id,
          tanggal: formatTanggal(item.tanggal),
          kategori: item.kategori,
          deskripsiPelanggaran: item.deskripsiPelanggaran,
          poin: item.poin,
          tindakanPembinaan: item.tindakanPembinaan,
          dicatatOleh: item.dicatatOleh.name,
          createdAt: item.createdAt.toISOString(),
        })),
        poinBulanIni: poinBulanIni._sum.poin ?? 0,
        poinTotal: poinTotal._sum.poin ?? 0,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
