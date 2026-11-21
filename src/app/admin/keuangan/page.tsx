"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowRightLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  History,
  Info,
  Landmark,
  LogOut,
  MinusCircle,
  Power,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UtensilsCrossed,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { PesantrenLogo } from "@/components/pesantren-logo";
import { PenyesuaianPanel } from "./penyesuaian-panel";
import { TagihanPanel } from "./tagihan-panel";
import { useCallback, useEffect, useMemo, useState } from "react";

import { apiFetch, toErrorMessage } from "@/lib/client-api";
import {
  cleanKeterangan,
  formatDateTime,
  formatRupiah,
  formatTime,
} from "@/lib/format";
import type {
  AdminReversalInfaqResponse,
  AdminRingkasanResponse,
  JenisTransaksi,
  MutasiItem,
  MutasiResponse,
  PolicySetting,
  RoleName,
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
  StatCard,
  Switch,
  cn,
  type BadgeTone,
} from "@/components/ui";

const ROLE_LABEL: Record<RoleName, string> = {
  BENDAHARA: "Bendahara",
  OPERATOR: "Operator",
  KASIR_KANTIN: "Kasir Kantin",
  USTADZ_PENGURUS: "Ustadz Pengurus",
  WALI_SANTRI: "Wali Santri",
};

type NominalDirection = "MASUK" | "KELUAR" | "NETRAL";

const JENIS_KATEGORI: Record<
  JenisTransaksi,
  { label: string; tone: BadgeTone; direction: NominalDirection }
> = {
  BAYAR_SPP: { label: "SPP", tone: "emerald", direction: "MASUK" },
  BAYAR_INFAQ_MAKAN: {
    label: "Infaq Makan",
    tone: "teal",
    direction: "MASUK",
  },
  TOPUP_JAJAN: { label: "Titip Jajan", tone: "blue", direction: "MASUK" },
  REDIRECT_JAJAN_KE_INFAQ: {
    label: "Auto-Redirect Infaq",
    tone: "amber",
    direction: "NETRAL",
  },
  JAJAN_KANTIN: { label: "Jajan Kantin", tone: "violet", direction: "KELUAR" },
  PENARIKAN_TUNAI: {
    label: "Penarikan Tunai",
    tone: "slate",
    direction: "KELUAR",
  },
  REVERSAL_INFAQ_KE_JAJAN: {
    label: "Kembali ke Jajan",
    tone: "indigo",
    direction: "NETRAL",
  },
};

const WEB3_STATUS: Record<
  Web3SyncStatus,
  { label: string; tone: BadgeTone; icon: LucideIcon }
> = {
  SYNCED: { label: "Tersinkron", tone: "emerald", icon: ShieldCheck },
  PENDING: { label: "Menunggu", tone: "amber", icon: Clock },
  FAILED: { label: "Gagal sync", tone: "rose", icon: AlertCircle },
  NOT_REQUIRED: { label: "Tanpa on-chain", tone: "slate", icon: MinusCircle },
};

const FILTERS = [
  { key: "SEMUA", label: "Semua" },
  { key: "MASUK", label: "Dana Masuk" },
  { key: "KELUAR", label: "Dana Keluar" },
  { key: "REDIRECT", label: "Auto-Redirect" },
] as const;

type MutasiFilter = (typeof FILTERS)[number]["key"];

function JenisBadge({ jenis }: { jenis: JenisTransaksi }) {
  const meta = JENIS_KATEGORI[jenis];

  return (
    <Badge tone={meta.tone}>
      {jenis === "REDIRECT_JAJAN_KE_INFAQ" ? (
        <ArrowRightLeft aria-hidden="true" size={12} />
      ) : null}
      {jenis === "REVERSAL_INFAQ_KE_JAJAN" ? (
        <RotateCcw aria-hidden="true" size={12} />
      ) : null}
      {meta.label}
    </Badge>
  );
}

function Web3Badge({ status }: { status: Web3SyncStatus }) {
  const meta = WEB3_STATUS[status];
  const Icon = meta.icon;

  return (
    <Badge tone={meta.tone}>
      <Icon aria-hidden="true" size={12} />
      {meta.label}
    </Badge>
  );
}

function NominalValue({
  jenis,
  nominal,
}: {
  jenis: JenisTransaksi;
  nominal: string;
}) {
  const direction = JENIS_KATEGORI[jenis].direction;

  return (
    <span
      className={cn(
        "whitespace-nowrap font-semibold tabular-nums",
        direction === "MASUK" && "text-emerald-700",
        direction === "KELUAR" && "text-rose-600",
        direction === "NETRAL" && "text-amber-700",
      )}
    >
      {direction === "MASUK" ? (
        <span className="mr-0.5 text-xs">+</span>
      ) : direction === "KELUAR" ? (
        <span className="mr-0.5 text-xs">−</span>
      ) : (
        <span className="mr-0.5 text-xs">→</span>
      )}
      {formatRupiah(nominal)}
    </span>
  );
}

function ProofButton({
  item,
  onShow,
}: {
  item: MutasiItem;
  onShow: (item: MutasiItem) => void;
}) {
  if (item.web3Status === "NOT_REQUIRED") {
    return (
      <span className="text-[11px] leading-4 text-slate-400">
        Tidak perlu on-chain
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={!item.txHashWeb3}
      onClick={() => onShow(item)}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-semibold transition",
        item.txHashWeb3
          ? "text-emerald-700 hover:text-emerald-800"
          : "cursor-not-allowed text-slate-300",
      )}
    >
      <ShieldCheck aria-hidden="true" size={14} />
      Cek Bukti Blockchain
    </button>
  );
}

function ReversalButton({
  item,
  onOpen,
}: {
  item: MutasiItem;
  onOpen: (item: MutasiItem) => void;
}) {
  if (item.jenisTransaksi !== "REDIRECT_JAJAN_KE_INFAQ") {
    return null;
  }

  if (item.sudahDireversal) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
        <RotateCcw aria-hidden="true" size={12} />
        Sudah dikembalikan
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 transition hover:text-indigo-800"
    >
      <RotateCcw aria-hidden="true" size={14} />
      Kembalikan ke Uang Jajan
    </button>
  );
}

export default function AdminKeuanganPage() {
  const router = useRouter();

  const [data, setData] = useState<AdminRingkasanResponse | null>(null);
  const [policy, setPolicy] = useState<PolicySetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyFeedback, setPolicyFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  const [mutasi, setMutasi] = useState<MutasiItem[]>([]);
  const [mutasiLoading, setMutasiLoading] = useState(true);
  const [mutasiError, setMutasiError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [filter, setFilter] = useState<MutasiFilter>("SEMUA");

  const [proofTarget, setProofTarget] = useState<MutasiItem | null>(null);
  const [copied, setCopied] = useState(false);

  const [reversalTarget, setReversalTarget] = useState<MutasiItem | null>(null);
  const [reversalAlasan, setReversalAlasan] = useState("");
  const [reversalBusy, setReversalBusy] = useState(false);
  const [reversalError, setReversalError] = useState<string | null>(null);
  const [reversalFeedback, setReversalFeedback] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [ringkasan, setting] = await Promise.all([
        apiFetch<AdminRingkasanResponse>("/api/admin/keuangan"),
        apiFetch<PolicySetting>("/api/admin/settings"),
      ]);
      setData(ringkasan);
      setPolicy(setting);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMutasi = useCallback(async () => {
    setMutasiLoading(true);
    try {
      const result = await apiFetch<MutasiResponse>(
        "/api/admin/keuangan/mutasi?limit=40",
      );
      setMutasi(result.items);
      setLastUpdated(new Date());
      setMutasiError(null);
    } catch (err) {
      setMutasiError(toErrorMessage(err));
    } finally {
      setMutasiLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    void loadMutasi();
  }, [loadDashboard, loadMutasi]);

  // Mutasi dianggap realtime: daftar disegarkan tiap 30 detik tanpa reload halaman.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadMutasi();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [loadMutasi]);

  const filteredMutasi = useMemo(() => {
    return mutasi.filter((item) => {
      if (filter === "MASUK") {
        return JENIS_KATEGORI[item.jenisTransaksi].direction === "MASUK";
      }
      if (filter === "KELUAR") {
        return JENIS_KATEGORI[item.jenisTransaksi].direction === "KELUAR";
      }
      if (filter === "REDIRECT") {
        return item.jenisTransaksi === "REDIRECT_JAJAN_KE_INFAQ";
      }
      return true;
    });
  }, [mutasi, filter]);

  const web3 = data?.summary.web3;
  const web3Rate =
    web3 && web3.total > 0 ? Math.round((web3.synced / web3.total) * 100) : null;

  async function handlePolicyChange(next: boolean) {
    setPolicyBusy(true);
    setPolicyFeedback(null);
    try {
      const updated = await apiFetch<PolicySetting>("/api/admin/settings", {
        method: "PATCH",
        body: JSON.stringify({ value: next }),
      });
      setPolicy(updated);
      setPolicyFeedback({
        tone: "success",
        message: next
          ? "Kebijakan diaktifkan. Titipan jajan wali akan melunasi Infaq Makan terlebih dahulu."
          : "Kebijakan dinonaktifkan. Titipan jajan wali langsung masuk saldo jajan santri.",
      });
    } catch (err) {
      setPolicyFeedback({ tone: "error", message: toErrorMessage(err) });
    } finally {
      setPolicyBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Sesi tetap dihapus di server bila memungkinkan; arahkan tetap ke login.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  function showProof(item: MutasiItem) {
    setCopied(false);
    setProofTarget(item);
  }

  function openReversal(item: MutasiItem) {
    setReversalTarget(item);
    setReversalAlasan("");
    setReversalError(null);
  }

  async function submitReversal() {
    if (!reversalTarget) {
      return;
    }

    const alasan = reversalAlasan.trim();

    if (!alasan) {
      setReversalError("Alasan dispensasi wajib diisi.");
      return;
    }

    setReversalBusy(true);
    setReversalError(null);
    try {
      const hasil = await apiFetch<AdminReversalInfaqResponse>(
        "/api/admin/keuangan/reversal",
        {
          method: "POST",
          body: JSON.stringify({
            transaksiId: reversalTarget.id,
            alasanDispensasi: alasan,
          }),
        },
      );

      setReversalFeedback(
        `${formatRupiah(hasil.transaksi.nominal)} milik ${hasil.santri.name} ` +
          `dikembalikan dari Infaq Makan ${hasil.tagihan.bulan}/${hasil.tagihan.tahun} ` +
          `ke saldo jajan. Saldo jajan akhir ${formatRupiah(hasil.santri.saldoJajanAkhir)}.`,
      );
      setReversalTarget(null);
      await Promise.all([loadDashboard(), loadMutasi()]);
    } catch (err) {
      setReversalError(toErrorMessage(err));
    } finally {
      setReversalBusy(false);
    }
  }

  async function copyHash(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Kembali ke beranda"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
            >
              <PesantrenLogo />
            </Link>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                MyNurulHuda
              </p>
              <h1 className="text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                Pondok Pesantren Nurul Huda Pangauban
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
                Dashboard Keuangan
              </span>

            </nav>
            {data ? (
              <div className="min-w-0 text-right">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {data.actor.name}
                </p>
                <p className="text-xs text-slate-500">
                  {ROLE_LABEL[data.actor.role]}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 text-right">
                <Skeleton className="ml-auto h-3.5 w-24" />
                <Skeleton className="ml-auto h-3 w-16" />
              </div>
            )}
            <Avatar name={data?.actor.name ?? "Admin"} />
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

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <TagihanPanel />
        <PenyesuaianPanel />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Ringkasan Kas
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Konsolidasi SPP, Infaq Makan, dan dana titipan uang jajan santri.
            </p>
          </div>
          {data ? (
            <p className="text-xs text-slate-400">
              Diperbarui {formatDateTime(data.generatedAt)}
            </p>
          ) : null}
        </div>

        {error ? (
          <ErrorBanner
            title="Gagal memuat ringkasan kas"
            message={error}
            onRetry={() => void loadDashboard()}
          />
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading && !data ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="w-full space-y-3">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-7 w-36" />
                  </div>
                  <Skeleton className="h-11 w-11 rounded-xl" />
                </div>
                <Skeleton className="mt-4 h-3 w-44" />
              </div>
            ))
          ) : data ? (
            <>
              <StatCard
                icon={Receipt}
                label="Pemasukan SPP"
                tone="emerald"
                value={formatRupiah(data.summary.totalSpp)}
                hint="Akumulasi pembayaran SPP yang tercatat."
              />
              <StatCard
                icon={UtensilsCrossed}
                label="Pemasukan Infaq Makan"
                tone="teal"
                value={formatRupiah(data.summary.totalInfaq)}
                hint={
                  <span className="block space-y-1">
                    <span className="block">
                      Bayar langsung{" "}
                      <span className="font-semibold text-slate-700">
                        {formatRupiah(data.summary.totalInfaqDirect)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-amber-700">
                      <ArrowRightLeft aria-hidden="true" size={12} />
                      Auto-redirect jajan{" "}
                      <span className="font-semibold">
                        {formatRupiah(data.summary.totalInfaqRedirect)}
                      </span>
                    </span>
                    {BigInt(data.summary.totalInfaqReversal ?? "0") > 0n ? (
                      <span className="flex items-center gap-1 text-indigo-700">
                        <RotateCcw aria-hidden="true" size={12} />
                        Dikembalikan ke jajan −
                        <span className="font-semibold">
                          {formatRupiah(data.summary.totalInfaqReversal)}
                        </span>
                      </span>
                    ) : null}
                  </span>
                }
              />
              <StatCard
                icon={Wallet}
                label="Dana Titipan Uang Jajan"
                tone="blue"
                value={formatRupiah(data.summary.totalTitipanJajan)}
                hint={`Total saldo ${data.summary.santriDenganSaldo} santri, termasuk alumni yang belum dicairkan.`}
              />
              <StatCard
                icon={ShieldCheck}
                label="Sinkronisasi Web3 Ledger"
                tone={web3?.failed ? "rose" : "indigo"}
                value={
                  <span className="flex items-baseline gap-1.5">
                    {web3?.synced ?? 0}
                    <span className="text-base font-semibold text-slate-400">
                      / {web3?.total ?? 0}
                    </span>
                  </span>
                }
                footer={
                  <div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          web3?.failed ? "bg-rose-500" : "bg-emerald-500",
                        )}
                        style={{ width: `${web3Rate ?? 0}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {web3Rate === null
                        ? "Belum ada transaksi on-chain."
                        : `${web3Rate}% tersinkron · ${web3?.pending ?? 0} menunggu · ${
                            web3?.failed ?? 0
                          } gagal`}
                    </p>
                  </div>
                }
              />
            </>
          ) : null}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <Card
            className={cn(
              "overflow-hidden lg:col-span-2",
              policy?.enabled
                ? "border-emerald-200/80 ring-1 ring-emerald-100"
                : "border-slate-200/80",
            )}
          >
            <div
              className={cn(
                "h-1.5 w-full transition-colors",
                policy?.enabled ? "bg-emerald-500" : "bg-slate-300",
              )}
            />
            <div className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  <span
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                      policy?.enabled
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500",
                    )}
                  >
                    <Workflow aria-hidden="true" size={24} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                        Auto-Redirect Titipan Jajan
                      </h2>
                      <Badge tone="emerald">
                        <CheckCircle2 aria-hidden="true" size={12} />
                        OTOMATIS (PERMANEN)
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Pemotongan otomatis titipan jajan untuk tunggakan Infaq Makan aktif secara sistem.
                    </p>
                  </div>
                </div>
              </div>

              <Alert
                icon={Info}
                tone="emerald"
                className="mt-5"
                title="Kebijakan Sistem Otomatis"
              >
                Setiap penitipan uang jajan dari wali santri otomatis dialihkan untuk melunasi tunggakan Infaq Makan terlebih dahulu. Jika nominal tagihan perlu keringanan, lakukan penyesuaian nominal dengan alasan wajib melalui panel Penyesuaian Keuangan.
              </Alert>

              <div className="mt-5 flex flex-col gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <History aria-hidden="true" size={13} />
                  {policy?.updatedAt
                    ? `Terakhir diubah ${formatDateTime(policy.updatedAt)}`
                    : "Belum pernah diubah sejak nilai bawaan sistem"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 aria-hidden="true" size={13} />
                  Perubahan tercatat atas nama admin yang login
                </span>
              </div>

              {policyFeedback ? (
                <Alert
                  tone={policyFeedback.tone === "success" ? "emerald" : "rose"}
                  icon={
                    policyFeedback.tone === "success" ? CheckCircle2 : AlertCircle
                  }
                  className="mt-4"
                >
                  {policyFeedback.message}
                </Alert>
              ) : null}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <History aria-hidden="true" size={16} className="text-slate-400" />
                Log Kebijakan
              </h2>
              <Badge tone="slate">Jejak Audit</Badge>
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  Status saat ini
                </dt>
                <dd className="mt-1">
                  <Badge tone={policy?.enabled ? "emerald" : "slate"}>
                    {policy?.enabled
                      ? "Redirect permanen aktif"
                      : "Redirect permanen aktif"}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  Waktu perubahan terakhir
                </dt>
                <dd className="mt-1 font-medium text-slate-800">
                  {policy?.updatedAt
                    ? formatDateTime(policy.updatedAt)
                    : "Nilai bawaan seed"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  Diubah oleh
                </dt>
                <dd className="mt-1">
                  {policy?.updatedBy ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={policy.updatedBy.name} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800">
                          {policy.updatedBy.name}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {policy.updatedBy.email}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="font-medium text-slate-800">
                      Sistem / seed
                    </span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
              Auto-Redirect berjalan permanen. Perubahan nominal tagihan atau reversal harus disertai alasan dan tercatat pada audit penyesuaian keuangan.
            </div>
          </Card>
        </section>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <ArrowDownLeft
                  aria-hidden="true"
                  size={18}
                  className="text-emerald-600"
                />
                Mutasi Keuangan Realtime
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {lastUpdated
                  ? `Diperbarui pukul ${formatTime(lastUpdated.toISOString())} WIB · menyesuaikan otomatis tiap 30 detik`
                  : "Memuat mutasi terbaru…"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                      filter === option.key
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={mutasiLoading && mutasi.length > 0}
                onClick={() => void loadMutasi()}
              >
                {!mutasiLoading || mutasi.length === 0 ? (
                  <RefreshCw aria-hidden="true" size={15} />
                ) : null}
                Muat ulang
              </Button>
            </div>
          </div>

          {reversalFeedback ? (
            <div className="border-b border-slate-100 p-5 sm:px-6">
              <Alert
                tone="emerald"
                icon={CheckCircle2}
                title="Dana Infaq Makan dikembalikan ke uang jajan"
              >
                {reversalFeedback}
              </Alert>
            </div>
          ) : null}

          {mutasiError ? (
            <div className="p-5 sm:px-6">
              <ErrorBanner
                title="Gagal memuat mutasi"
                message={mutasiError}
                onRetry={() => void loadMutasi()}
              />
            </div>
          ) : null}

          {mutasiLoading && mutasi.length === 0 ? (
            <div className="space-y-3 p-5 sm:px-6">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-40" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          ) : filteredMutasi.length === 0 ? (
            <div className="p-5 sm:p-6">
              <EmptyState
                icon={Receipt}
                title={
                  mutasi.length === 0
                    ? "Belum ada mutasi keuangan"
                    : "Tidak ada mutasi pada filter ini"
                }
                description={
                  mutasi.length === 0
                    ? "Transaksi setoran, pembayaran, dan jajan santri akan tampil di sini secara realtime."
                    : "Coba pilih kategori lain atau muat ulang daftar mutasi."
                }
                action={
                  mutasi.length > 0 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setFilter("SEMUA")}
                    >
                      Tampilkan semua
                    </Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-6 py-3 font-semibold">
                        Waktu
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Santri
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Kategori
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Nominal
                      </th>
                      <th scope="col" className="px-4 py-3 font-semibold">
                        Keterangan
                      </th>
                      <th scope="col" className="px-6 py-3 font-semibold">
                        Bukti Web3
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMutasi.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-slate-100 align-top transition hover:bg-slate-50/60"
                      >
                        <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">
                          <span className="block font-medium text-slate-700">
                            {formatDateTime(item.createdAt)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="block font-medium text-slate-800">
                            {item.santri.name}
                          </span>
                          <span className="block text-xs text-slate-500">
                            NIS {item.santri.nis}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <JenisBadge jenis={item.jenisTransaksi} />
                        </td>
                        <td className="px-4 py-4">
                          <NominalValue
                            jenis={item.jenisTransaksi}
                            nominal={item.nominal}
                          />
                        </td>
                        <td className="max-w-[280px] px-4 py-4 text-xs text-slate-500">
                          <span
                            className="block truncate"
                            title={item.keterangan ?? undefined}
                          >
                            {cleanKeterangan(item.keterangan) || "—"}
                          </span>
                          {item.merchant ? (
                            <span className="mt-0.5 block truncate text-slate-400">
                              {item.merchant.namaKantin}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            <Web3Badge status={item.web3Status} />
                            <ProofButton item={item} onShow={showProof} />
                            <ReversalButton item={item} onOpen={openReversal} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lg:hidden">
                {filteredMutasi.map((item) => (
                  <article
                    key={item.id}
                    className="border-t border-slate-100 p-4 first:border-t-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.santri.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          NIS {item.santri.nis} ·{" "}
                          {formatDateTime(item.createdAt)}
                        </p>
                      </div>
                      <JenisBadge jenis={item.jenisTransaksi} />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-xs text-slate-500">
                        {cleanKeterangan(item.keterangan) || "—"}
                      </p>
                      <NominalValue
                        jenis={item.jenisTransaksi}
                        nominal={item.nominal}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Web3Badge status={item.web3Status} />
                      <ProofButton item={item} onShow={showProof} />
                    </div>
                    <div className="mt-2">
                      <ReversalButton item={item} onOpen={openReversal} />
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </Card>
      </main>

      <Modal
        open={proofTarget !== null}
        onClose={() => setProofTarget(null)}
        title="Bukti Transaksi Blockchain"
        description="Hash transaksi yang tercatat pada kontrak PesantrenTreasuryLedger."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => setProofTarget(null)}
            >
              Tutup
            </Button>
          </div>
        }
      >
        {proofTarget ? (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  {JENIS_KATEGORI[proofTarget.jenisTransaksi].label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {proofTarget.kodeTransaksi}
                </p>
              </div>
              <Web3Badge status={proofTarget.web3Status} />
            </div>

            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-slate-500">Santri</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {proofTarget.santri.name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Nominal</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">
                  {formatRupiah(proofTarget.nominal)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">Waktu</dt>
                <dd className="mt-0.5 text-slate-700">
                  {formatDateTime(proofTarget.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-slate-500">
                  Metode
                </dt>
                <dd className="mt-0.5 text-slate-700">
                  {proofTarget.metodePembayaran.split("_").join(" ")}
                </dd>
              </div>
            </dl>

            {proofTarget.txHashWeb3 ? (
              <div>
                <p className="text-xs font-medium text-slate-500">
                  Transaction Hash
                </p>
                <div className="mt-2 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs leading-6 text-slate-700">
                    {proofTarget.txHashWeb3}
                  </code>
                  <button
                    type="button"
                    aria-label="Salin hash transaksi"
                    onClick={() => void copyHash(proofTarget.txHashWeb3 as string)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    {copied ? (
                      <Check aria-hidden="true" size={15} />
                    ) : (
                      <Copy aria-hidden="true" size={15} />
                    )}
                  </button>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-xs leading-5 text-slate-500">
                  <ExternalLink aria-hidden="true" size={13} />
                  Tempel hash ini di block explorer jaringan tempat kontrak
                  dideploy untuk verifikasi publik.
                </p>
              </div>
            ) : (
              <Alert
                tone={
                  proofTarget.web3Status === "FAILED" ? "rose" : "amber"
                }
                icon={
                  proofTarget.web3Status === "FAILED" ? AlertCircle : Clock
                }
                title={
                  proofTarget.web3Status === "FAILED"
                    ? "Sinkronisasi blockchain gagal"
                    : "Bukti blockchain belum tersedia"
                }
              >
                {proofTarget.web3Status === "FAILED"
                  ? proofTarget.web3LastError ??
                    "Antrean Web3 gagal mencatat transaksi. Data keuangan tetap tersimpan aman di database."
                  : "Transaksi telah tersimpan di database dan sedang menunggu antrean pencatatan ke ledger Web3."}
              </Alert>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={reversalTarget !== null}
        onClose={() => {
          if (!reversalBusy) {
            setReversalTarget(null);
          }
        }}
        title="Kembalikan ke Uang Jajan"
        description="Dana auto-redirect Infaq Makan akan dikembalikan ke saldo jajan santri dan tunggakan Infaq Makan dipulihkan."
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={reversalBusy}
              onClick={() => setReversalTarget(null)}
            >
              Batal
            </Button>
            <Button
              loading={reversalBusy}
              onClick={() => void submitReversal()}
            >
              <RotateCcw aria-hidden="true" size={15} />
              Kembalikan Dana
            </Button>
          </div>
        }
      >
        {reversalTarget ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    {reversalTarget.santri.name}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    NIS {reversalTarget.santri.nis} ·{" "}
                    {reversalTarget.kodeTransaksi}
                  </p>
                </div>
                <NominalValue
                  jenis={reversalTarget.jenisTransaksi}
                  nominal={reversalTarget.nominal}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {cleanKeterangan(reversalTarget.keterangan) || "—"}
              </p>
            </div>

            <div>
              <label
                htmlFor="alasan-dispensasi"
                className="text-xs font-semibold text-slate-600"
              >
                Alasan dispensasi
                <span className="ml-0.5 text-rose-500">*</span>
              </label>
              <textarea
                id="alasan-dispensasi"
                rows={3}
                maxLength={500}
                value={reversalAlasan}
                onChange={(event) => setReversalAlasan(event.target.value)}
                placeholder="Wali santri menghadap, kondisi ekonomi sulit, dana dialihkan untuk pegangan jajan santri"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                {reversalAlasan.length}/500 karakter · tercatat pada audit
                Web3 sebagai “Dispensasi Bendahara: [alasan]”.
              </p>
            </div>

            {reversalError ? (
              <Alert tone="rose" icon={AlertCircle} title="Gagal memproses">
                {reversalError}
              </Alert>
            ) : null}

            <Alert tone="amber" icon={Info} title="Perhatian">
              Tagihan Infaq Makan terkait akan berkurang sebesar nominal ini dan
              statusnya kembali menjadi CICILAN atau BELUM LUNAS. Transaksi hanya
              dapat dikembalikan satu kali.
            </Alert>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
