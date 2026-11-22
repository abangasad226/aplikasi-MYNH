"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRightLeft,
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Info,
  Landmark,
  LogOut,
  MoonStar,
  PlusCircle,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PesantrenLogo } from "@/components/pesantren-logo";
import { useCallback, useEffect, useState } from "react";

import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { RaporCard } from "./rapor-card";
import { PenyesuaianList } from "./penyesuaian-list";
import {
  cleanKeterangan,
  formatDateTime,
  formatPeriode,
  formatRupiah,
  formatTanggal,
} from "@/lib/format";
import type {
  JenisKegiatan,
  JenisTransaksi,
  KategoriPelanggaran,
  RekapKehadiran,
  SetoranResult,
  StatusTagihan,
  TagihanRingkas,
  WaliDashboardResponse,
  WaliPelanggaran,
  WaliTransaksi,
  Web3SyncStatus,
} from "@/lib/api-types";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Modal,
  Skeleton,
  Spinner,
  cn,
  type BadgeTone,
} from "@/components/ui";

const JENIS_TRANSAKSI: Record<
  JenisTransaksi,
  { label: string; tone: BadgeTone; icon: LucideIcon; direction: "IN" | "OUT" | "MOVE" }
> = {
  BAYAR_SPP: {
    label: "Pembayaran SPP",
    tone: "emerald",
    icon: Receipt,
    direction: "IN",
  },
  BAYAR_INFAQ_MAKAN: {
    label: "Pembayaran Infaq Makan",
    tone: "teal",
    icon: UtensilsCrossed,
    direction: "IN",
  },
  TOPUP_JAJAN: {
    label: "Uang Jajan",
    tone: "blue",
    icon: PlusCircle,
    direction: "IN",
  },
  REDIRECT_JAJAN_KE_INFAQ: {
    label: "Auto-Redirect ke Infaq Makan",
    tone: "amber",
    icon: ArrowRightLeft,
    direction: "MOVE",
  },
  JAJAN_KANTIN: {
    label: "Belanja Kantin",
    tone: "violet",
    icon: ShoppingBag,
    direction: "OUT",
  },
  PENARIKAN_TUNAI: {
    label: "Penarikan Tunai",
    tone: "slate",
    icon: Banknote,
    direction: "OUT",
  },
  REVERSAL_INFAQ_KE_JAJAN: {
    label: "Pengembalian ke Uang Jajan",
    tone: "indigo",
    icon: RotateCcw,
    direction: "MOVE",
  },
};

const WEB3_BADGE: Record<
  Web3SyncStatus,
  { label: string; tone: BadgeTone; icon: LucideIcon } | null
> = {
  SYNCED: { label: "On-chain", tone: "emerald", icon: ShieldCheck },
  PENDING: { label: "On-chain diproses", tone: "amber", icon: Clock },
  FAILED: { label: "On-chain gagal", tone: "rose", icon: AlertCircle },
  NOT_REQUIRED: null,
};

const KEGIATAN_LABEL: Record<JenisKegiatan, string> = {
  SHOLAT_JEMAAH: "Sholat Jemaah",
  NGAJI_KITAB: "Ngaji Kitab",
  TAHFIDZ: "Tahfidz",
  SEKOLAH_FORMAL: "Sekolah Formal",
};

const KATEGORI_PELANGGARAN: Record<
  KategoriPelanggaran,
  { label: string; tone: BadgeTone }
> = {
  RINGAN: { label: "Ringan", tone: "amber" },
  SEDANG: { label: "Sedang", tone: "rose" },
  BERAT: { label: "Berat", tone: "rose" },
};

type Tab = "keuangan" | "akademik";
type RiwayatFilter = "INFAQ" | "JAJAN" | "SPP";

const DEPOSIT_PRESETS = ["50000", "100000", "250000", "500000"] as const;

function autoRedirectNotice(total: string): string {
  return `Info Yayasan: Ananda memiliki tunggakan Infaq Makan ${formatRupiah(
    total,
  )}. Sesuai kebijakan pesantren, dana yang Anda kirim akan otomatis melunasi Infaq Makan terlebih dahulu.`;
}

function tagihanStatus(status: StatusTagihan): {
  label: string;
  tone: BadgeTone;
} {
  if (status === "LUNAS") {
    return { label: "Lunas", tone: "emerald" };
  }
  if (status === "CICILAN") {
    return { label: "Cicilan", tone: "amber" };
  }
  return { label: "Tunggakan", tone: "rose" };
}

function safeBigInt(value: string | null | undefined): bigint {
  if (!value || !/^\d+$/.test(value)) {
    return 0n;
  }
  return BigInt(value);
}

function persenHadir(rekap: RekapKehadiran): number | null {
  if (rekap.total === 0) {
    return null;
  }
  return Math.round((rekap.HADIR / rekap.total) * 100);
}

function gabungRekap(...items: RekapKehadiran[]): RekapKehadiran {
  return items.reduce<RekapKehadiran>(
    (total, item) => ({
      HADIR: total.HADIR + item.HADIR,
      IZIN: total.IZIN + item.IZIN,
      SAKIT: total.SAKIT + item.SAKIT,
      ALPA: total.ALPA + item.ALPA,
      total: total.total + item.total,
    }),
    { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0, total: 0 },
  );
}

function TagihanBlock({
  title,
  icon: Icon,
  tagihan,
}: {
  title: string;
  icon: LucideIcon;
  tagihan: TagihanRingkas | undefined;
}) {
  if (!tagihan) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Icon aria-hidden="true" size={16} className="text-slate-400" />
          {title}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Tidak ada tagihan pada periode ini.
        </p>
      </div>
    );
  }

  const status = tagihanStatus(tagihan.status);
  const nominal = safeBigInt(tagihan.nominalTagihan);
  const terbayar = safeBigInt(tagihan.nominalTerbayar);
  const progress =
    nominal > 0n
      ? Math.min(100, Number((terbayar * 100n) / nominal))
      : 100;

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Icon aria-hidden="true" size={16} className="text-slate-400" />
          {title}
        </span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="mt-3 break-words text-xl font-bold tracking-tight text-slate-900 tabular-nums">
        {formatRupiah(tagihan.sisa)}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        Sisa dari {formatRupiah(tagihan.nominalTagihan)}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full",
            tagihan.status === "LUNAS" ? "bg-emerald-500" : "bg-amber-500",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Jatuh tempo {formatTanggal(tagihan.jatuhTempo)}
      </p>
    </div>
  );
}

function RiwayatItem({ tx }: { tx: WaliTransaksi }) {
  const meta = JENIS_TRANSAKSI[tx.jenisTransaksi];
  const Icon = meta.icon;
  const web3 = WEB3_BADGE[tx.web3Status];
  const Web3Icon = web3?.icon;
  const keterangan = cleanKeterangan(tx.keterangan);

  return (
    <li className="flex items-start gap-3 py-3.5">
      <span
        className={cn(
          "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          meta.tone === "amber"
            ? "bg-amber-50 text-amber-700"
            : meta.tone === "violet"
              ? "bg-violet-50 text-violet-700"
              : meta.tone === "blue"
                ? "bg-blue-50 text-blue-700"
                : meta.tone === "slate"
                  ? "bg-slate-100 text-slate-500"
                  : "bg-emerald-50 text-emerald-700",
        )}
      >
        <Icon aria-hidden="true" size={18} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold text-slate-800">
            {meta.label}
          </p>
          <p
            className={cn(
              "shrink-0 whitespace-nowrap text-sm font-bold tabular-nums",
              meta.direction === "IN" && "text-emerald-700",
              meta.direction === "OUT" && "text-rose-600",
              meta.direction === "MOVE" && "text-amber-700",
            )}
          >
            {meta.direction === "IN" ? "+" : meta.direction === "OUT" ? "−" : "→"}{" "}
            {formatRupiah(tx.nominal)}
          </p>
        </div>

        <p className="mt-0.5 text-[11px] text-slate-500">
          {formatDateTime(tx.createdAt)} ·{" "}
          {tx.metodePembayaran.split("_").join(" ").toLowerCase()}
        </p>

        {keterangan && keterangan !== "—" ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
            {keterangan}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {web3 && Web3Icon ? (
            <Badge tone={web3.tone}>
              <Web3Icon aria-hidden="true" size={11} />
              {web3.label}
            </Badge>
          ) : null}
          {tx.merchant ? (
            <span className="text-[11px] text-slate-400">{tx.merchant}</span>
          ) : null}
          {tx.referensiSetoran ? (
            <span className="break-all font-mono text-[10px] text-slate-400">
              Ref. {tx.referensiSetoran}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function RekapCard({
  title,
  icon: Icon,
  rekap,
}: {
  title: string;
  icon: LucideIcon;
  rekap: RekapKehadiran;
}) {
  const persen = persenHadir(rekap);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Icon aria-hidden="true" size={16} />
          </span>
          <span className="min-w-0 leading-snug">{title}</span>
        </span>
        {persen !== null ? (
          <Badge tone={persen >= 80 ? "emerald" : persen >= 60 ? "amber" : "rose"}>
            {persen}%
          </Badge>
        ) : null}
      </div>

      {rekap.total === 0 ? (
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Belum ada data presensi bulan ini.
        </p>
      ) : (
        <>
          <p className="mt-4 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {rekap.HADIR}
            <span className="ml-1 text-xs font-medium text-slate-400">
              / {rekap.total} sesi
            </span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${persen ?? 0}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span>Izin {rekap.IZIN}</span>
            <span>Sakit {rekap.SAKIT}</span>
            <span>Alpa {rekap.ALPA}</span>
          </div>
        </>
      )}
    </div>
  );
}

function PelanggaranItem({ item }: { item: WaliPelanggaran }) {
  const kategori = KATEGORI_PELANGGARAN[item.kategori];

  return (
    <li className="rounded-xl border border-slate-200 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={kategori.tone}>{kategori.label}</Badge>
            <span className="text-[11px] text-slate-400">
              {formatTanggal(item.tanggal)}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-800">
            {item.deskripsiPelanggaran}
          </p>
        </div>
        <span className="shrink-0 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">
          +{item.poin} poin
        </span>
      </div>

      {item.tindakanPembinaan ? (
        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
          <span className="font-semibold text-slate-700">Pembinaan: </span>
          {item.tindakanPembinaan}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-slate-400">
        Dicatat oleh {item.dicatatOleh || "Ustadz Pengurus"} ·{" "}
        {formatDateTime(item.createdAt)}
      </p>
    </li>
  );
}

export default function WaliDashboardPage() {
  const router = useRouter();

  const [data, setData] = useState<WaliDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("keuangan");
  const [riwayatFilter, setRiwayatFilter] = useState<RiwayatFilter>("INFAQ");

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositNominal, setDepositNominal] = useState("");
  const [depositMetode, setDepositMetode] = useState<"TRANSFER_VA" | "QRIS">(
    "TRANSFER_VA",
  );
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositResult, setDepositResult] = useState<SetoranResult | null>(null);

  const loadDashboard = useCallback(
    async (santriId?: string, silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const query = santriId
          ? `?santriId=${encodeURIComponent(santriId)}`
          : "";
        const result = await apiFetch<WaliDashboardResponse>(
          `/api/wali/dashboard${query}`,
        );
        setData(result);
        setError(null);
      } catch (err) {
        setError(toErrorMessage(err));
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const selected = data?.selected ?? null;

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Navigasi tetap diarahkan ke halaman login.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  function switchChild(santriId: string) {
    if (!selected || santriId === selected.santri.id || loading) {
      return;
    }
    setTab("keuangan");
    setRiwayatFilter("INFAQ");
    void loadDashboard(santriId);
  }

  function openDeposit() {
    setDepositNominal("");
    setDepositMetode("TRANSFER_VA");
    setDepositError(null);
    setDepositResult(null);
    setDepositOpen(true);
  }

  function closeDeposit() {
    if (depositBusy) {
      return;
    }
    setDepositOpen(false);
    setDepositNominal("");
    setDepositError(null);
    setDepositResult(null);
  }

  async function submitDeposit() {
    if (!selected || depositBusy) {
      return;
    }

    const nominalBig = /^\d+$/.test(depositNominal)
      ? BigInt(depositNominal)
      : 0n;

    if (nominalBig <= 0n) {
      setDepositError("Masukkan nominal setoran terlebih dahulu.");
      return;
    }

    setDepositBusy(true);
    setDepositError(null);

    try {
      const result = await apiFetch<SetoranResult>(
        "/api/keuangan/setoran-jajan",
        {
          method: "POST",
          body: JSON.stringify({
            santriId: selected.santri.id,
            nominalSetor: depositNominal,
            metodePembayaran: depositMetode,
          }),
        },
      );
      setDepositResult(result);
      void loadDashboard(selected.santri.id, true);
    } catch (err) {
      setDepositError(toErrorMessage(err));
    } finally {
      setDepositBusy(false);
    }
  }

  const tagihanSpp = selected?.tagihanBulanIni.find(
    (item) => item.jenisTagihan === "SPP",
  );
  const tagihanInfaq = selected?.tagihanBulanIni.find(
    (item) => item.jenisTagihan === "INFAQ_MAKAN",
  );
  const adaTunggakanBulanIni =
    selected?.tagihanBulanIni.some((item) => item.status !== "LUNAS") ?? false;

  const transaksiInfaq =
    selected?.transaksi.filter(
      (tx) =>
        tx.jenisTransaksi === "BAYAR_INFAQ_MAKAN" ||
        tx.jenisTransaksi === "REDIRECT_JAJAN_KE_INFAQ",
    ) ?? [];
  const transaksiJajan =
    selected?.transaksi.filter(
      (tx) =>
        tx.jenisTransaksi === "TOPUP_JAJAN" ||
        tx.jenisTransaksi === "JAJAN_KANTIN" ||
        tx.jenisTransaksi === "PENARIKAN_TUNAI",
    ) ?? [];
  const transaksiSpp =
    selected?.transaksi.filter((tx) => tx.jenisTransaksi === "BAYAR_SPP") ?? [];

  const transaksiAktif =
    riwayatFilter === "INFAQ"
      ? transaksiInfaq
      : riwayatFilter === "JAJAN"
        ? transaksiJajan
        : transaksiSpp;

  const tunggakanInfaqBig = selected
    ? safeBigInt(selected.tunggakanInfaq.total)
    : 0n;
  const depositBig = /^\d+$/.test(depositNominal)
    ? BigInt(depositNominal)
    : 0n;
  const akanDialihkan =
    selected?.policy.autoRedirectAktif && tunggakanInfaqBig > 0n
      ? depositBig < tunggakanInfaqBig
        ? depositBig
        : tunggakanInfaqBig
      : 0n;
  const akanKeSaldo =
    depositBig > akanDialihkan ? depositBig - akanDialihkan : 0n;
  const tampilkanNotifikasiRedirect = Boolean(
    selected?.policy.autoRedirectAktif && tunggakanInfaqBig > 0n,
  );

  const rekapSholat = selected?.kehadiran.SHOLAT_JEMAAH;
  const rekapNgaji = selected
    ? gabungRekap(selected.kehadiran.NGAJI_KITAB, selected.kehadiran.TAHFIDZ)
    : null;
  const rekapSekolah = selected?.kehadiran.SEKOLAH_FORMAL;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            aria-label="Kembali ke beranda"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
          >
            <PesantrenLogo className="h-10 w-10" iconSize={18} />
          </Link>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              MyNurulHuda
            </p>
            <h1 className="truncate text-sm font-bold text-slate-900">
              Pondok Pesantren Nurul Huda Pangauban
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="hidden text-right sm:block">
              <p className="max-w-[160px] truncate text-sm font-semibold text-slate-800">
                {data?.wali.name ?? "Wali Santri"}
              </p>
              <p className="max-w-[160px] truncate text-[11px] text-slate-500">
                {data?.wali.email ?? ""}
              </p>
            </div>
            <Avatar name={data?.wali.name ?? "Wali Santri"} size="sm" />
            <button
              type="button"
              aria-label="Keluar"
              onClick={() => void handleLogout()}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <LogOut aria-hidden="true" size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6 lg:py-7">
        {error && data ? (
          <Alert tone="rose" icon={AlertCircle}>
            Data terbaru belum dapat dimuat: {error}.{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void loadDashboard(selected?.santri.id)}
            >
              Coba lagi
            </button>
          </Alert>
        ) : null}

        {loading && !data ? (
          <div className="space-y-5">
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
        ) : error && !data ? (
          <ErrorBanner
            title="Gagal memuat portal wali"
            message={error}
            onRetry={() => void loadDashboard()}
          />
        ) : !data ? null : !selected ? (
          <EmptyState
            icon={Info}
            title="Belum ada santri terhubung"
            description="Akun wali ini belum terhubung dengan data santri. Silakan hubungi admin pesantren untuk penautan akun."
          />
        ) : (
          <>
            <PenyesuaianList santriId={selected.santri.id} />
            {data.children && data.children.length > 1 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm border border-slate-200">
                <span className="text-xs font-semibold text-slate-500 mr-2">Pilih Profil Anak:</span>
                {data.children.map((child) => {
                  const isSelected = selected?.santri.id === child.id;
                  return (
                    <button
                      key={child.id}
                      type="button"
                      onClick={() => void loadDashboard(child.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition",
                        isSelected
                          ? "bg-emerald-600 text-white shadow-sm"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      )}
                    >
                      <span>{child.name}</span>
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[10px]", isSelected ? "bg-black/15 text-white" : "bg-slate-200 text-slate-600")}>
                        {child.kelas}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <Card className="overflow-hidden border-0 shadow-sm">
              <div className="bg-gradient-to-br from-emerald-700 via-emerald-600 to-teal-600 px-5 py-6 text-white sm:px-6">
                <div className="flex items-start gap-4">
                  <Avatar
                    name={selected.santri.name}
                    size="xl"
                    tone="white"
                    className="rounded-2xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                      Profil Santri
                    </p>
                    <h2 className="truncate text-2xl font-bold tracking-tight">
                      {selected.santri.name}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
                      <span className="rounded-full bg-white/15 px-2.5 py-1">
                        NIS {selected.santri.nis}
                      </span>
                      <span className="rounded-full bg-white/15 px-2.5 py-1">
                        Kelas {selected.santri.kelas}
                      </span>
                      <span className="rounded-full bg-white/15 px-2.5 py-1">
                        Kamar {selected.santri.kamar}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1",
                          selected.santri.statusAktif
                            ? "bg-emerald-950/30 text-emerald-50"
                            : "bg-rose-950/30 text-rose-50",
                        )}
                      >
                        {selected.santri.statusAktif ? "Santri Aktif" : "Nonaktif"}
                      </span>
                    </div>
                  </div>
                  {loading ? (
                    <Spinner className="text-white/80" size={18} />
                  ) : null}
                </div>

                {data.children.length > 1 ? (
                  <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {data.children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        disabled={loading}
                        onClick={() => switchChild(child.id)}
                        aria-pressed={child.id === selected.santri.id}
                        className={cn(
                          "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed",
                          child.id === selected.santri.id
                            ? "bg-white text-emerald-700 shadow-sm"
                            : "bg-white/15 text-white hover:bg-white/25",
                        )}
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>

            <div
              role="tablist"
              aria-label="Bagian portal wali"
              className="sticky top-0 z-20 grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "keuangan"}
                onClick={() => setTab("keuangan")}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-semibold transition sm:text-sm",
                  tab === "keuangan"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <Wallet aria-hidden="true" size={16} />
                Keuangan &amp; Jajan
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "akademik"}
                onClick={() => setTab("akademik")}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-xl text-xs font-semibold transition sm:text-sm",
                  tab === "akademik"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <GraduationCap aria-hidden="true" size={16} />
                Akademik &amp; Kedisiplinan
              </button>
            </div>

            {tab === "keuangan" ? (
              <div className="space-y-5">
                {tampilkanNotifikasiRedirect ? (
                  <Alert tone="amber" icon={Info}>
                    {autoRedirectNotice(selected.tunggakanInfaq.total)}
                  </Alert>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-5">
                  <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-white shadow-sm lg:col-span-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-emerald-100">
                        Saldo Uang Jajan
                      </p>
                      <Wallet aria-hidden="true" size={18} className="text-emerald-100" />
                    </div>
                    <p className="mt-2 break-words text-3xl font-bold tracking-tight tabular-nums">
                      {formatRupiah(selected.santri.saldoJajan)}
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-emerald-50">
                      Saldo uang jajan untuk kantin, terpisah dari SPP dan
                      Infaq Makan.
                    </p>
                    <Button
                      variant="secondary"
                      className="mt-5 w-full border-0 bg-white text-emerald-700 hover:bg-emerald-50"
                      onClick={openDeposit}
                    >
                      <PlusCircle aria-hidden="true" size={18} />
                      Top-up Uang Jajan
                    </Button>
                  </div>

                  <Card className="p-5 lg:col-span-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-semibold text-slate-900">
                          Tagihan Bulan Ini
                        </h2>
                        <p className="text-xs text-slate-500">
                          {formatPeriode(
                            selected.periode.bulan,
                            selected.periode.tahun,
                          )}
                        </p>
                      </div>
                      <Badge tone={adaTunggakanBulanIni ? "rose" : "emerald"}>
                        {adaTunggakanBulanIni ? (
                          <AlertCircle aria-hidden="true" size={12} />
                        ) : (
                          <CheckCircle2 aria-hidden="true" size={12} />
                        )}
                        {adaTunggakanBulanIni ? "Ada tunggakan" : "Semua lunas"}
                      </Badge>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <TagihanBlock
                        title="SPP"
                        icon={Receipt}
                        tagihan={tagihanSpp}
                      />
                      <TagihanBlock
                        title="Infaq Makan"
                        icon={UtensilsCrossed}
                        tagihan={tagihanInfaq}
                      />
                    </div>
                  </Card>
                </div>

                <Card className="overflow-hidden">
                  <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                        <ArrowRightLeft
                          aria-hidden="true"
                          size={18}
                          className="text-emerald-600"
                        />
                        Riwayat Transaksi
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        Pemisahan dana Infaq Makan, saldo jajan, dan SPP.
                      </p>
                    </div>

                    <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
                      {(
                        [
                          {
                            key: "INFAQ",
                            label: "Infaq Makan",
                            count: transaksiInfaq.length,
                          },
                          {
                            key: "JAJAN",
                            label: "Saldo Jajan",
                            count: transaksiJajan.length,
                          },
                          {
                            key: "SPP",
                            label: "SPP",
                            count: transaksiSpp.length,
                          },
                        ] as const
                      ).map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setRiwayatFilter(option.key)}
                          className={cn(
                            "shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition sm:text-xs",
                            riwayatFilter === option.key
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500 hover:text-slate-700",
                          )}
                        >
                          {option.label}
                          <span
                            className={cn(
                              "ml-1 rounded-full px-1.5 py-0.5 text-[10px]",
                              riwayatFilter === option.key
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-200/70 text-slate-500",
                            )}
                          >
                            {option.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {transaksiAktif.length === 0 ? (
                    <div className="p-5">
                      <EmptyState
                        icon={Receipt}
                        title="Belum ada transaksi"
                        description={
                          riwayatFilter === "INFAQ"
                            ? "Belum ada pembayaran atau pengalihan dana Infaq Makan pada periode ini."
                            : riwayatFilter === "JAJAN"
                              ? "Belum ada top-up atau belanja uang jajan pada periode ini."
                              : "Belum ada pembayaran SPP pada periode ini."
                        }
                      />
                    </div>
                  ) : (
                    <ul className="divide-y divide-slate-100 px-5">
                      {transaksiAktif.map((tx) => (
                        <RiwayatItem key={tx.id} tx={tx} />
                      ))}
                    </ul>
                  )}

                  <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[11px] leading-5 text-slate-400">
                    Transaksi berstatus on-chain memiliki bukti hash di sistem
                    pesantren. Hubungi bendahara bila terdapat selisih.
                  </div>
                </Card>
              </div>
            ) : (
              <div className="space-y-5">
                <RaporCard key={selected.santri.id} santriId={selected.santri.id} />
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-900">
                      Rekap Kehadiran
                    </h2>
                    <Badge tone="slate">
                      {formatPeriode(
                        selected.periode.bulan,
                        selected.periode.tahun,
                      )}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Presensi kegiatan dan ibadah selama bulan berjalan.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {rekapSholat ? (
                    <RekapCard
                      title="Sholat Jemaah"
                      icon={MoonStar}
                      rekap={rekapSholat}
                    />
                  ) : null}
                  {rekapNgaji ? (
                    <RekapCard
                      title="Ngaji Kitab / Tahfidz"
                      icon={BookOpen}
                      rekap={rekapNgaji}
                    />
                  ) : null}
                  {rekapSekolah ? (
                    <RekapCard
                      title="Sekolah Formal"
                      icon={GraduationCap}
                      rekap={rekapSekolah}
                    />
                  ) : null}
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <Card className="p-5">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <BookOpen
                          aria-hidden="true"
                          size={16}
                          className="text-emerald-600"
                        />
                        Perkembangan Hafalan
                      </h2>
                      <Badge tone="emerald">Catatan Ustadz</Badge>
                    </div>

                    {selected.perkembangan.length === 0 ? (
                      <EmptyState
                        icon={BookOpen}
                        title="Belum ada catatan hafalan"
                        description="Catatan perkembangan ngaji dan hafalan dari ustadz akan tampil di sini."
                        className="mt-4 py-8"
                      />
                    ) : (
                      <ol className="mt-5 space-y-4">
                        {selected.perkembangan.map((log) => (
                          <li
                            key={log.id}
                            className="relative border-l-2 border-emerald-100 pl-4"
                          >
                            <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-emerald-500" />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-700">
                                {KEGIATAN_LABEL[log.jenisKegiatan]} ·{" "}
                                {formatTanggal(log.tanggal)}
                              </p>
                              {log.nilaiHafalan !== null ? (
                                <Badge
                                  tone={
                                    log.nilaiHafalan >= 80
                                      ? "emerald"
                                      : log.nilaiHafalan >= 60
                                        ? "amber"
                                        : "rose"
                                  }
                                >
                                  Nilai {log.nilaiHafalan}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-1.5 text-sm leading-6 text-slate-600">
                              {log.catatanUstadz || "—"}
                            </p>
                            <p className="mt-1 text-[10px] text-slate-400">
                              {formatDateTime(log.createdAt)}
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Card>

                  <Card className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <ShieldCheck
                          aria-hidden="true"
                          size={16}
                          className="text-rose-500"
                        />
                        Kedisiplinan Santri
                      </h2>
                      <div className="flex items-center gap-1.5">
                        <Badge tone="amber">
                          Bulan ini {selected.poinBulanIni} poin
                        </Badge>
                        <Badge tone="slate">
                          Total {selected.poinTotal} poin
                        </Badge>
                      </div>
                    </div>

                    {selected.pelanggaran.length === 0 ? (
                      <EmptyState
                        icon={CheckCircle2}
                        title="Tidak ada pelanggaran"
                        description="Alhamdulillah, tidak ada catatan pelanggaran pada periode ini."
                        className="mt-4 py-8"
                      />
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {selected.pelanggaran.map((item) => (
                          <PelanggaranItem key={item.id} item={item} />
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                <p className="px-1 text-[11px] leading-5 text-slate-400">
                  Poin kedisiplinan dihitung dari catatan ustadz pengurus.
                  Perubahan data mengikuti kebijakan pembinaan pesantren.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {selected ? (
        <Modal
          open={depositOpen}
          onClose={closeDeposit}
          title={depositResult ? "Top-up Berhasil" : "Top-up Uang Jajan"}
          description={
            depositResult
              ? "Alokasi dana sesuai kebijakan pesantren yang berlaku."
              : `Untuk ${selected.santri.name} · NIS ${selected.santri.nis}`
          }
          footer={
            depositResult ? (
              <Button className="w-full" onClick={closeDeposit}>
                Selesai
              </Button>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="secondary"
                  className="sm:flex-1"
                  disabled={depositBusy}
                  onClick={closeDeposit}
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  form="form-setoran-jajan"
                  className="sm:flex-1"
                  loading={depositBusy}
                  disabled={depositBig <= 0n}
                >
                  Konfirmasi Setoran
                </Button>
              </div>
            )
          }
        >
          {depositResult ? (
            <div className="space-y-4">
              <div className="text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 aria-hidden="true" size={36} />
                </span>
                <p className="mt-3 text-sm text-slate-500">
                  Setoran untuk {selected.santri.name}
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                  {formatRupiah(depositResult.nominalSetor)}
                </p>
                <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                  {depositResult.referensiSetoran}
                </p>
              </div>

              <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Ke Infaq Makan</span>
                  <span className="font-semibold text-amber-700 tabular-nums">
                    {formatRupiah(depositResult.totalDialihkanKeInfaq)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Ke Saldo Jajan</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    {formatRupiah(depositResult.totalMasukSaldoJajan)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
                  <span className="font-medium text-slate-700">
                    Saldo jajan akhir
                  </span>
                  <span className="font-bold text-slate-900 tabular-nums">
                    {formatRupiah(depositResult.saldoJajanAkhir)}
                  </span>
                </div>
              </div>

              {depositResult.alokasiInfaq.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-600">
                    Tunggakan Infaq Makan yang dilunasi
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {depositResult.alokasiInfaq.map((alokasi) => (
                      <li
                        key={alokasi.tagihanId}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
                      >
                        <span className="text-slate-600">
                          {formatPeriode(alokasi.bulan, alokasi.tahun)}
                        </span>
                        <span className="font-semibold text-slate-800 tabular-nums">
                          {formatRupiah(alokasi.nominal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-[11px] leading-5 text-slate-400">
                Setoran sudah tercatat pada mutasi keuangan pesantren. Simpan
                referensi di atas bila diperlukan.
              </p>
            </div>
          ) : (
            <form
              id="form-setoran-jajan"
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void submitDeposit();
              }}
            >
              <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                <Avatar name={selected.santri.name} size="sm" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-semibold text-slate-900">
                    {selected.santri.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    Saldo saat ini {formatRupiah(selected.santri.saldoJajan)}
                  </p>
                </div>
              </div>

              {tampilkanNotifikasiRedirect ? (
                <Alert tone="amber" icon={Info}>
                  {autoRedirectNotice(selected.tunggakanInfaq.total)}
                </Alert>
              ) : null}

              <div>
                <p className="text-xs font-medium text-slate-500">
                  Nominal setoran
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {DEPOSIT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setDepositNominal(preset);
                        setDepositError(null);
                      }}
                      className={cn(
                        "h-11 rounded-xl border-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                        depositNominal === preset
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300",
                      )}
                    >
                      {formatRupiah(preset)}
                    </button>
                  ))}
                </div>

                <div className="relative mt-2">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    Rp
                  </span>
                  <input
                    autoFocus
                    inputMode="numeric"
                    value={depositNominal}
                    onChange={(event) => {
                      setDepositNominal(
                        event.target.value.replace(/\D/g, "").slice(0, 9),
                      );
                      setDepositError(null);
                    }}
                    placeholder="Nominal lain"
                    aria-label="Nominal setoran"
                    autoComplete="off"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-lg font-bold tabular-nums text-slate-900 outline-none transition placeholder:text-sm placeholder:font-normal placeholder:text-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500">
                  Metode setoran
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(
                    [
                      { key: "TRANSFER_VA", label: "Transfer Virtual Account" },
                      { key: "QRIS", label: "QRIS" },
                    ] as const
                  ).map((method) => (
                    <button
                      key={method.key}
                      type="button"
                      onClick={() => setDepositMetode(method.key)}
                      className={cn(
                        "h-11 rounded-xl border-2 px-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400",
                        depositMetode === method.key
                          ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300",
                      )}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5 text-xs">
                <p className="font-semibold text-slate-700">Estimasi alokasi</p>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Ke Infaq Makan</span>
                    <span className="font-semibold text-amber-700 tabular-nums">
                      {formatRupiah(akanDialihkan)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Ke Saldo Jajan</span>
                    <span className="font-semibold text-emerald-700 tabular-nums">
                      {formatRupiah(akanKeSaldo)}
                    </span>
                  </div>
                </div>
              </div>

              {depositError ? (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700"
                >
                  <AlertCircle aria-hidden="true" size={14} className="mt-0.5 shrink-0" />
                  {depositError}
                </p>
              ) : null}

              <p className="text-[11px] leading-5 text-slate-400">
                Setoran akan langsung tercatat pada mutasi keuangan dan
                dialokasikan sesuai kebijakan yayasan yang aktif.
              </p>
            </form>
          )}
        </Modal>
      ) : null}
    </div>
  );
}
