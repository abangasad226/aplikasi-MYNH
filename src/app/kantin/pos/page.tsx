"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  KeyRound,
  Landmark,
  LogOut,
  ScanLine,
  ShieldCheck,
  ShoppingBag,
  Store,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { PesantrenLogo } from "@/components/pesantren-logo";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { ApiError, apiFetch, toErrorMessage } from "@/lib/client-api";
import {
  formatNumber,
  formatRupiah,
  formatTanggal,
  formatTime,
} from "@/lib/format";
import type {
  KantinKartuResponse,
  KantinKonteksResponse,
  TransaksiKantinResponse,
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
  cn,
  type BadgeTone,
} from "@/components/ui";

const PRESET_NOMINAL = ["2000", "5000", "10000"] as const;

const WEB3_RESULT: Record<
  Web3SyncStatus,
  { label: string; tone: BadgeTone; icon: LucideIcon }
> = {
  SYNCED: { label: "Tercatat di Web3", tone: "emerald", icon: ShieldCheck },
  PENDING: { label: "Bukti on-chain diproses", tone: "amber", icon: Clock },
  FAILED: { label: "Bukti on-chain gagal", tone: "rose", icon: AlertCircle },
  NOT_REQUIRED: { label: "Tanpa on-chain", tone: "slate", icon: BadgeCheck },
};

export default function KantinPosPage() {
  const router = useRouter();

  const [konteks, setKonteks] = useState<KantinKonteksResponse | null>(null);
  const [konteksLoading, setKonteksLoading] = useState(true);
  const [konteksError, setKonteksError] = useState<string | null>(null);

  const [scanValue, setScanValue] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [kartu, setKartu] = useState<KantinKartuResponse | null>(null);
  const [activeIdentifier, setActiveIdentifier] = useState("");

  const [nominal, setNominal] = useState("");

  const [pin, setPin] = useState("");
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [result, setResult] = useState<TransaksiKantinResponse | null>(null);

  const [now, setNow] = useState(() => new Date());

  const inputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playTone = useCallback((kind: "success" | "error" | "info") => {
    try {
      const AudioCtor =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) {
        return;
      }

      const ctx = audioCtxRef.current ?? new AudioCtor();
      audioCtxRef.current = ctx;
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const notes: Array<{ freq: number; offset: number }> =
        kind === "success"
          ? [
              { freq: 880, offset: 0 },
              { freq: 1318.5, offset: 0.13 },
            ]
          : kind === "error"
            ? [
                { freq: 196, offset: 0 },
                { freq: 155.6, offset: 0.18 },
              ]
            : [{ freq: 660, offset: 0 }];

      const startAt = ctx.currentTime;
      const duration = kind === "error" ? 0.16 : 0.14;

      notes.forEach(({ freq, offset }) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = startAt + offset;

        oscillator.type = kind === "error" ? "square" : "sine";
        oscillator.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
      });
    } catch {
      // Suara hanya umpan balik tambahan; tidak boleh menggagalkan transaksi.
    }
  }, []);

  const loadKonteks = useCallback(async (silent = false) => {
    if (!silent) {
      setKonteksLoading(true);
    }
    try {
      const data = await apiFetch<KantinKonteksResponse>("/api/kantin/konteks");
      setKonteks(data);
      setKonteksError(null);
    } catch (err) {
      setKonteksError(toErrorMessage(err));
    } finally {
      if (!silent) {
        setKonteksLoading(false);
      }
    }
  }, []);

  const lookupCard = useCallback(
    async (rawIdentifier: string) => {
      const identifier = rawIdentifier.trim();
      if (!identifier || lookupBusy) {
        return;
      }

      setLookupBusy(true);
      setScanError(null);
      setPaymentError(null);
      setFailure(null);
      setResult(null);

      try {
        const data = await apiFetch<KantinKartuResponse>(
          `/api/kantin/santri?cardIdentifier=${encodeURIComponent(identifier)}`,
        );
        setKartu(data);
        setActiveIdentifier(identifier);
        setScanValue("");
        setNominal("");
        setPin("");
        playTone("info");
      } catch (err) {
        setKartu(null);
        setActiveIdentifier("");
        setScanError(toErrorMessage(err));
        playTone("error");
      } finally {
        setLookupBusy(false);
        window.setTimeout(() => inputRef.current?.focus(), 30);
      }
    },
    [lookupBusy, playTone],
  );

  useEffect(() => {
    void loadKonteks();
  }, [loadKonteks]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== "closed") {
        void ctx.close();
      }
    };
  }, []);

  // Menangkap input HID walaupun fokus sedang berada di tombol layar sentuh.
  useEffect(() => {
    let buffer = "";
    let timer: number | null = null;

    function handleKeyDown(event: KeyboardEvent) {
      if (result || pinModalOpen || failure) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === "Enter") {
        const value = buffer.trim();
        buffer = "";
        if (value) {
          event.preventDefault();
          void lookupCard(value);
        }
        return;
      }

      if (event.key.length === 1) {
        buffer += event.key;
        if (timer) {
          window.clearTimeout(timer);
        }
        timer = window.setTimeout(() => {
          buffer = "";
        }, 150);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [lookupCard, result, pinModalOpen, failure]);

  const saldoBig = kartu ? BigInt(kartu.saldoJajan) : 0n;
  const sisaLimitBig = kartu ? BigInt(kartu.sisaLimitHarian) : 0n;
  const limitHarianBig = kartu ? BigInt(kartu.limitJajanHarian) : 0n;
  const nominalBig = /^\d+$/.test(nominal) ? BigInt(nominal) : 0n;
  const maksimalBelanja = saldoBig < sisaLimitBig ? saldoBig : sisaLimitBig;

  let nominalError: string | null = null;
  if (kartu && nominalBig > 0n) {
    if (nominalBig > saldoBig) {
      nominalError = "Saldo jajan santri tidak mencukupi.";
    } else if (nominalBig > sisaLimitBig) {
      nominalError = "Melebihi batas jajan harian santri";
    }
  }

  const canPay = Boolean(
    kartu && activeIdentifier && nominalBig > 0n && !nominalError && !paying,
  );

  const saldoSetelah =
    kartu && nominalBig > 0n && nominalBig <= saldoBig
      ? (saldoBig - nominalBig).toString()
      : null;
  const limitSetelah =
    kartu && nominalBig > 0n && nominalBig <= sisaLimitBig
      ? (sisaLimitBig - nominalBig).toString()
      : null;
  const limitUsedPercent =
    kartu && limitHarianBig > 0n
      ? Math.min(
          100,
          Number((BigInt(kartu.totalJajanHariIni) * 100n) / limitHarianBig),
        )
      : 0;

  function changeNominal(next: string) {
    setNominal(next.replace(/\D/g, "").slice(0, 9));
    setPaymentError(null);
  }

  function resetTransaksi() {
    setKartu(null);
    setActiveIdentifier("");
    setScanValue("");
    setNominal("");
    setPin("");
    setPaymentError(null);
    setFailure(null);
    setResult(null);
    setPinModalOpen(false);
    window.setTimeout(() => inputRef.current?.focus(), 60);
  }


  async function submitPayment(pinValue?: string) {
    if (!kartu || !konteks || !activeIdentifier || nominalBig <= 0n || nominalError) {
      return;
    }

    setPaying(true);
    setPaymentError(null);

    try {
      const response = await apiFetch<TransaksiKantinResponse>(
        "/api/kantin/transaksi",
        {
          method: "POST",
          body: JSON.stringify({
            cardIdentifier: activeIdentifier,
            merchantId: konteks.merchant.id,
            nominalBelanja: nominal,
            ...(pinValue ? { pinSantri: pinValue } : {}),
          }),
        },
      );

      setResult(response);
      setKartu((previous) =>
        previous
          ? {
              ...previous,
              saldoJajan: response.saldoJajanAkhir,
              totalJajanHariIni: response.totalJajanHariIni,
              sisaLimitHarian: response.sisaLimitHarian,
            }
          : previous,
      );
      setPin("");
      setPinModalOpen(false);
      playTone("success");
      void loadKonteks(true);
    } catch (err) {
      setPaymentError(toErrorMessage(err));
      playTone("error");

      if (err instanceof ApiError && err.code === "PIN_SALAH") {
        setPin("");
        window.setTimeout(() => pinInputRef.current?.focus(), 40);
      } else if (err instanceof ApiError && err.code === "PIN_DIPERLUKAN") {
        setPinModalOpen(true);
      } else {
        setPinModalOpen(false);
        setFailure(toErrorMessage(err));
      }
    } finally {
      setPaying(false);
    }
  }

  function requestPayment() {
    if (!kartu || !canPay) {
      return;
    }

    setPaymentError(null);
    if (kartu.pinDiperlukan) {
      setPin("");
      setPinModalOpen(true);
      return;
    }

    void submitPayment();
  }

  function handlePinSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pin.length < 4 || paying) {
      return;
    }
    void submitPayment(pin);
  }

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Tetap arahkan ke login; cookie sesi dibersihkan server bila tersedia.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const web3Info = result ? WEB3_RESULT[result.transaksi.web3Status] : null;
  const Web3Icon = web3Info?.icon;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            aria-label="Kembali ke beranda"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
          >
            <PesantrenLogo />
          </Link>

          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
              MyNurulHuda
            </p>
            <h1 className="flex items-center gap-1.5 truncate text-xs font-bold text-slate-900 sm:text-sm">
              Pondok Pesantren Nurul Huda Pangauban
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-3 sm:gap-5">
            <div className="hidden text-right sm:block">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Penjualan hari ini
              </p>
              <p className="text-sm font-bold text-slate-900 tabular-nums">
                {konteks ? formatRupiah(konteks.hariIni.totalPenjualan) : "—"}
              </p>
              <p className="text-[11px] text-slate-500">
                {konteks
                  ? `${formatNumber(konteks.hariIni.jumlahTransaksi)} transaksi`
                  : "\u00a0"}
              </p>
            </div>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold tabular-nums text-slate-800">
                {formatTime(now.toISOString())}
              </p>
              <p className="text-[11px] text-slate-500">
                {formatTanggal(now.toISOString())} · WIB
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Avatar name={konteks?.kasir.name ?? "Kasir"} size="sm" />
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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:py-7">
        {konteksError && !konteks ? (
          <ErrorBanner
            className="mb-5"
            title="Gagal memuat data kasir"
            message={konteksError}
            onRetry={() => void loadKonteks()}
          />
        ) : konteksError ? (
          <Alert tone="amber" icon={AlertCircle} className="mb-5">
            Data merchant tidak dapat diperbarui: {konteksError}
          </Alert>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-5">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <ScanLine aria-hidden="true" size={18} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Scan Kartu Santri
                  </h2>
                  <p className="text-xs text-slate-500">
                    RFID Reader USB atau Barcode Scanner
                  </p>
                </div>
                {kartu ? (
                  <Badge tone="emerald" className="ml-auto">
                    <BadgeCheck aria-hidden="true" size={12} />
                    Kartu aktif
                  </Badge>
                ) : null}
              </div>

              <form
                className="mt-4 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = scanValue.trim();
                  if (value) {
                    void lookupCard(value);
                  }
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <CreditCard
                    aria-hidden="true"
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                    size={22}
                  />
                  <input
                    ref={inputRef}
                    // autoFocus + Enter: alur standar reader HID (ketik kode lalu Enter).
                    autoFocus
                    value={scanValue}
                    disabled={lookupBusy}
                    onChange={(event) => setScanValue(event.target.value)}
                    placeholder="Scan / tempel kode kartu di sini…"
                    aria-label="Kode kartu santri"
                    autoComplete="off"
                    spellCheck={false}
                    className="h-16 w-full rounded-2xl border-2 border-slate-200 bg-white pl-12 pr-4 text-base font-medium text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 sm:text-lg"
                  />
                </div>
                <Button
                  type="submit"
                  size="lg"
                  loading={lookupBusy}
                  disabled={!scanValue.trim()}
                  className="h-16 shrink-0 px-5 sm:px-7"
                >
                  Cari
                </Button>
              </form>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                Kartu otomatis terkirim saat reader menekan Enter. Input tetap
                aktif walau fokus berpindah ke tombol nominal.
              </p>

              {scanError ? (
                <Alert
                  tone="rose"
                  icon={AlertCircle}
                  className="mt-4"
                  title="Kartu tidak dapat diproses"
                >
                  {scanError}
                </Alert>
              ) : null}
            </Card>

            {kartu ? (
              <Card className="overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white sm:p-6">
                  <div className="flex items-center gap-4">
                    <Avatar
                      name={kartu.santri.name}
                      size="xl"
                      tone="white"
                      className="rounded-2xl"
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
                        Kartu Santri
                      </p>
                      <Link href={`/santri/${encodeURIComponent(kartu.santri.id)}`} className="block truncate text-2xl font-bold tracking-tight underline decoration-white/50 underline-offset-4">
                        {kartu.santri.name}
                      </Link>
                      <p className="mt-0.5 text-sm text-emerald-50">
                        NIS {kartu.santri.nis} · Kelas {kartu.santri.kelas} ·
                        Kamar {kartu.santri.kamar}
                      </p>
                    </div>
                    {kartu.pinDiperlukan ? (
                      <span className="ml-auto hidden items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white sm:inline-flex">
                        <KeyRound aria-hidden="true" size={12} />
                        Ber-PIN
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 divide-x divide-slate-100">
                  <div className="p-5 sm:p-6">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      <Wallet aria-hidden="true" size={14} />
                      Sisa Saldo Jajan
                    </p>
                    <p className="mt-1 break-words text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
                      {formatRupiah(kartu.saldoJajan)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Saldo uang jajan
                    </p>
                  </div>
                  <div className="p-5 sm:p-6">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      <ShoppingBag aria-hidden="true" size={14} />
                      Sisa Limit Hari Ini
                    </p>
                    <p className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                      {formatRupiah(kartu.sisaLimitHarian)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      dari {formatRupiah(kartu.limitJajanHarian)}
                    </p>
                  </div>
                </div>

                <div className="border-t border-slate-100 p-4 sm:px-6">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>
                      Terpakai hari ini{" "}
                      <span className="font-semibold text-slate-700">
                        {formatRupiah(kartu.totalJajanHariIni)}
                      </span>
                    </span>
                    <span>{limitUsedPercent}% limit</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        limitUsedPercent >= 100
                          ? "bg-rose-500"
                          : limitUsedPercent >= 75
                            ? "bg-amber-500"
                            : "bg-emerald-500",
                      )}
                      style={{ width: `${limitUsedPercent}%` }}
                    />
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <EmptyState
                  icon={ScanLine}
                  title="Menunggu kartu santri"
                  description="Tap kartu RFID atau scan barcode untuk menampilkan profil, saldo jajan, dan sisa limit jajan hari ini."
                  className="border-0 bg-transparent py-12"
                />
              </Card>
            )}
          </section>

          <section className="space-y-5 lg:sticky lg:top-24 lg:self-start">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    Nominal Belanja
                  </h2>
                  <p className="text-xs text-slate-500">
                    Pilih nominal cepat atau ketik manual
                  </p>
                </div>
                <Badge tone="slate">Rupiah</Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                {PRESET_NOMINAL.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={!kartu}
                    onClick={() => changeNominal(preset)}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center rounded-2xl border-2 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
                      nominal === preset && kartu
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50",
                    )}
                  >
                    {formatRupiah(preset)}
                  </button>
                ))}
              </div>

              <label
                htmlFor="nominal-manual"
                className="mt-4 block text-xs font-medium text-slate-500"
              >
                Nominal manual
              </label>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                  Rp
                </span>
                <input
                  id="nominal-manual"
                  inputMode="numeric"
                  value={nominal}
                  disabled={!kartu}
                  onChange={(event) => changeNominal(event.target.value)}
                  placeholder="0"
                  autoComplete="off"
                  className="h-14 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-lg font-bold tabular-nums text-slate-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>

              {kartu ? (
                <p className="mt-2 text-xs text-slate-500">
                  Maksimal transaksi:{" "}
                  <span className="font-semibold text-slate-700">
                    {formatRupiah(maksimalBelanja)}
                  </span>{" "}
                  (saldo / limit hari ini)
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-400">
                  Scan kartu terlebih dahulu untuk membuka nominal.
                </p>
              )}

              <dl className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Saldo setelah bayar</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {saldoSetelah ? formatRupiah(saldoSetelah) : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-500">Sisa limit setelah bayar</dt>
                  <dd className="font-semibold text-slate-900 tabular-nums">
                    {limitSetelah ? formatRupiah(limitSetelah) : "—"}
                  </dd>
                </div>
              </dl>

              {nominalError ? (
                <p
                  role="alert"
                  className="mt-4 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                  {nominalError}
                </p>
              ) : null}

              {paymentError && !failure && !pinModalOpen ? (
                <p
                  role="alert"
                  className="mt-4 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                  {paymentError}
                </p>
              ) : null}

              <Button
                size="lg"
                loading={paying}
                disabled={!canPay}
                onClick={requestPayment}
                className="mt-5 h-16 w-full text-base"
              >
                {!paying ? (
                  <CheckCircle2 aria-hidden="true" size={20} />
                ) : null}
                {nominalBig > 0n
                  ? `Konfirmasi Bayar ${formatRupiah(nominal)}`
                  : "Konfirmasi Pembayaran"}
              </Button>

              <p className="mt-2 text-center text-[11px] leading-5 text-slate-400">
                Saldo jajan tidak dapat menarik dana SPP atau Infaq Makan.
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <ShieldCheck aria-hidden="true" size={18} />
                </span>
                <div className="text-xs leading-5 text-slate-500">
                  <p className="font-semibold text-slate-700">
                    Anti double-tap aktif
                  </p>
                  Server menolak transaksi kartu yang sama dalam 5 detik dan
                  mengecek limit harian WIB secara atomik.
                </div>
              </div>
            </Card>

            {konteks ? (
              <p className="px-1 text-[11px] leading-5 text-slate-400">
                Kasir: {konteks.kasir.name} · Saldo pendapatan merchant{" "}
                {formatRupiah(konteks.merchant.saldoPendapatan)}
              </p>
            ) : konteksLoading ? (
              <Skeleton className="h-4 w-64" />
            ) : null}
          </section>
        </div>
      </main>

      <Modal
        open={pinModalOpen}
        onClose={() => {
          if (!paying) {
            setPinModalOpen(false);
            setPaymentError(null);
          }
        }}
        title="PIN Kartu Santri"
        description="Masukkan PIN untuk mengotorisasi pembayaran ini."
        size="md"
      >
        <form onSubmit={handlePinSubmit} className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <Avatar name={kartu?.santri.name ?? "Santri"} size="sm" />
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold text-slate-900">
                {kartu?.santri.name}
              </p>
              <p className="text-xs text-slate-500">
                {formatRupiah(nominal || "0")} akan dipotong dari saldo jajan.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="pin-santri"
              className="text-xs font-medium text-slate-500"
            >
              PIN Santri
            </label>
            <input
              id="pin-santri"
              ref={pinInputRef}
              autoFocus
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={8}
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
              placeholder="••••"
              className="mt-1.5 h-14 w-full rounded-xl border border-slate-200 bg-white px-4 text-center text-2xl font-bold tracking-[0.5em] text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
            />
            <p className="mt-1.5 text-[11px] text-slate-400">
              PIN 4–8 digit sesuai data santri.
            </p>
          </div>

          {paymentError ? (
            <p
              role="alert"
              className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium leading-5 text-rose-700"
            >
              {paymentError}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="secondary"
              className="sm:flex-1"
              disabled={paying}
              onClick={() => {
                setPinModalOpen(false);
                setPaymentError(null);
                inputRef.current?.focus();
              }}
            >
              Batal
            </Button>
            <Button
              type="submit"
              className="sm:flex-1"
              loading={paying}
              disabled={pin.length < 4}
            >
              Bayar {formatRupiah(nominal || "0")}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={failure !== null}
        onClose={() => {
          setFailure(null);
          inputRef.current?.focus();
        }}
        title="Pembayaran Gagal"
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setFailure(null);
                inputRef.current?.focus();
              }}
            >
              Tutup
            </Button>
            <Button
              onClick={() => {
                setFailure(null);
                inputRef.current?.focus();
              }}
            >
              Coba Lagi
            </Button>
          </div>
        }
      >
        <div className="text-center">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <XCircle aria-hidden="true" size={44} />
          </span>
          <h3 className="mt-4 text-lg font-bold text-slate-900">
            Transaksi tidak diproses
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            {failure}
          </p>
          {kartu ? (
            <p className="mt-3 text-xs text-slate-400">
              Kartu {kartu.santri.name} masih aktif. Periksa nominal lalu coba
              lagi.
            </p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={result !== null}
        onClose={resetTransaksi}
        title="Pembayaran Berhasil"
        footer={
          <Button size="lg" className="w-full" onClick={resetTransaksi}>
            <ScanLine aria-hidden="true" size={20} />
            Transaksi Baru
          </Button>
        }
      >
        {result ? (
          <div className="text-center">
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 aria-hidden="true" size={44} />
            </span>
            <p className="mt-4 text-sm text-slate-500">
              {result.santri.name} · NIS {result.santri.nis}
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
              {formatRupiah(result.transaksi.nominal)}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 text-left">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">Sisa saldo jajan</p>
                <p className="mt-0.5 text-sm font-bold text-emerald-700 tabular-nums">
                  {formatRupiah(result.saldoJajanAkhir)}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-[11px] text-slate-500">
                  Sisa limit hari ini
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900 tabular-nums">
                  {formatRupiah(result.sisaLimitHarian)}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-col items-center gap-2">
              {web3Info && Web3Icon ? (
                <Badge tone={web3Info.tone}>
                  <Web3Icon aria-hidden="true" size={12} />
                  {web3Info.label}
                </Badge>
              ) : null}
              <p className="font-mono text-[10px] text-slate-400">
                {result.transaksi.kodeTransaksi}
              </p>
            </div>

            <p className="mt-3 text-xs leading-5 text-slate-400">
              Struk tersimpan otomatis di sistem. Siapkan kartu berikutnya.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
