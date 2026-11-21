"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileSpreadsheet,
  GraduationCap,
  HandCoins,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Trash2,
  Users,
  WifiOff,
} from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Modal,
  Skeleton,
  StatCard,
} from "@/components/ui";
import type {
  AdminPencairanSaldoResponse,
  ImportReport,
  MutasiMassalResponse,
  OpsiResponse,
  SantriItem,
  SantriListResponse,
} from "@/lib/api-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { formatNumber, formatRupiah } from "@/lib/format";

import { buildQuery, downloadExcelFile, todayStamp } from "./excel-client";
import { MassalModal } from "./massal-modal";
import { PairingModal } from "./pairing-modal";
import { RefundModal } from "./refund-modal";
import { SantriFormModal } from "./santri-form-modal";

const PAGE_SIZE = 50;

type Feedback = {
  tone: "emerald" | "amber" | "rose";
  title: string;
  message: ReactNode;
};

function TunggakanInfo({ item }: { item: SantriItem }) {
  if (item.bebasTunggakan) {
    return (
      <Badge tone="emerald">
        <CheckCircle2 aria-hidden="true" size={13} />
        Lunas
      </Badge>
    );
  }

  return (
    <div>
      <Badge tone="amber">Belum lunas</Badge>
      <p className="mt-1 text-xs font-semibold tabular-nums text-amber-700">
        {formatRupiah(item.tunggakanTotal)}
      </p>
    </div>
  );
}

function KartuRfidInfo({ item }: { item: SantriItem }) {
  if (item.rfidUid) {
    return (
      <div>
        <Badge tone="emerald">
          <CheckCircle2 aria-hidden="true" size={13} />
          Sudah Terhubung
        </Badge>
        <p className="mt-1 font-mono text-[11px] tracking-wide text-slate-500">
          {item.rfidUid}
        </p>
      </div>
    );
  }

  return (
    <div>
      <Badge tone="amber">
        <WifiOff aria-hidden="true" size={13} />
        Belum Pairing
      </Badge>
      <p className="mt-1 text-[11px] text-slate-400">
        Klik tombol pairing
      </p>
    </div>
  );
}

export function SantriDirectory({
  mode,
  canRefund = false,
  canEdit = false,
}: {
  mode: "AKTIF" | "ALUMNI";
  canRefund?: boolean;
  canEdit?: boolean;
}) {
  const [data, setData] = useState<SantriListResponse | null>(null);
  const [opsi, setOpsi] = useState<OpsiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [kelas, setKelas] = useState("");
  const [kamar, setKamar] = useState("");
  const [statusMukim, setStatusMukim] = useState("");
  const [tahunLulus, setTahunLulus] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [formState, setFormState] = useState<{
    santri: SantriItem | null;
  } | null>(null);
  const [pairing, setPairing] = useState<SantriItem | null>(null);
  const [refund, setRefund] = useState<SantriItem | null>(null);
  const [massalOpen, setMassalOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [downloading, setDownloading] = useState<"template" | "export" | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => setReloadKey((current) => current + 1);

  const loadOpsi = useCallback(async () => {
    try {
      const response = await apiFetch<OpsiResponse>("/api/operator/opsi");
      setOpsi(response);
    } catch {
      // Opsi hanya pelengkap filter; error utama ditampilkan dari daftar.
    }
  }, []);

  useEffect(() => {
    void loadOpsi();
  }, [loadOpsi]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setSelected(new Set());
  }, [mode, page, debouncedQ, kelas, kamar, statusMukim, tahunLulus]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    const query = buildQuery({
      statusSantri: mode,
      q: debouncedQ || undefined,
      kelas: kelas || undefined,
      kamar: kamar || undefined,
      statusMukim: statusMukim || undefined,
      tahunLulus: mode === "ALUMNI" ? tahunLulus || undefined : undefined,
      page,
      limit: PAGE_SIZE,
    });

    apiFetch<SantriListResponse>(`/api/operator/santri${query}`)
      .then((response) => {
        if (active) {
          setData(response);
        }
      })
      .catch((caught) => {
        if (active) {
          setError(toErrorMessage(caught));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, debouncedQ, kelas, kamar, statusMukim, tahunLulus, page, reloadKey]);

  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.limit ?? PAGE_SIZE)),
  );
  const startRow = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const endRow = data ? Math.min(data.page * data.limit, data.total) : 0;

  const selectedItems = useMemo(
    () => (data?.items ?? []).filter((item) => selected.has(item.id)),
    [data, selected],
  );
  const allSelected =
    (data?.items.length ?? 0) > 0 &&
    (data?.items ?? []).every((item) => selected.has(item.id));

  const alumniGroups = useMemo(() => {
    if (mode !== "ALUMNI" || !data) {
      return [];
    }

    const groups = new Map<string, SantriItem[]>();

    for (const item of data.items) {
      const key = item.tahunLulus ? String(item.tahunLulus) : "TIDAK_DIKETAHUI";
      const bucket = groups.get(key);

      if (bucket) {
        bucket.push(item);
      } else {
        groups.set(key, [item]);
      }
    }

    return Array.from(groups.entries());
  }, [mode, data]);

  const hasFilters = Boolean(
    q ||
      kelas ||
      kamar ||
      statusMukim ||
      (mode === "ALUMNI" && tahunLulus),
  );

  const resetFilters = () => {
    setQ("");
    setKelas("");
    setKamar("");
    setStatusMukim("");
    setTahunLulus("");
    setPage(1);
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const toggleAll = () => {
    const ids = (data?.items ?? []).map((item) => item.id);

    setSelected((current) => {
      const next = new Set(current);

      for (const id of ids) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }

      return next;
    });
  };

  const handleLulusSantri = async (item: SantriItem) => {
    if (!canEdit || !window.confirm(`Luluskan ${item.name} dan terbitkan nomor syahadah otomatis?`)) return;
    try {
      const result = await apiFetch<{ item: { nomorSyahadah: string } }>(`/api/operator/santri/${encodeURIComponent(item.id)}/lulus`, { method: "POST", body: JSON.stringify({}) });
      setFeedback({ tone: "emerald", title: "Santri diluluskan", message: `Nomor syahadah: ${result.item.nomorSyahadah}` });
      refresh();
    } catch (caught) { setError(toErrorMessage(caught)); }
  };

  const handleDeleteSantri = async (item: SantriItem) => {
    if (!canEdit || !window.confirm(`Hapus data ${item.name} (NIS ${item.nis})? Tindakan gagal bila masih ada riwayat transaksi/tagihan.`)) return;
    try { await apiFetch(`/api/operator/santri/${encodeURIComponent(item.id)}`, { method: "DELETE" }); refresh(); }
    catch (caught) { setError(toErrorMessage(caught)); }
  };

  const handleSavedSantri = (
    item: SantriItem,
    savedMode: "create" | "edit",
  ) => {
    setFormState(null);
    setFeedback({
      tone: "emerald",
      title:
        savedMode === "create" ? "Santri berhasil ditambahkan" : "Data santri diperbarui",
      message: `${item.name} (NIS ${item.nis}) tersimpan. ${
        item.rfidUid
          ? `Kartu RFID ${item.rfidUid} terhubung.`
          : "Kartu RFID belum terhubung."
      }`,
    });
    refresh();
    void loadOpsi();
  };

  const handleSavedPairing = (item: SantriItem) => {
    setPairing(null);
    setFeedback({
      tone: "emerald",
      title: "Kartu RFID terhubung",
      message: `${item.name} kini dapat melakukan scan di kantin dan absensi.`,
    });
    refresh();
  };

  const handleRefundDone = (hasil: AdminPencairanSaldoResponse) => {
    setRefund(null);
    setFeedback({
      tone: "emerald",
      title: "Saldo jajan dicairkan",
      message: `${hasil.santri.name} menerima ${formatRupiah(
        hasil.transaksi.nominal,
      )}. Sisa saldo jajan ${formatRupiah(hasil.saldoJajanAkhir)}.`,
    });
    refresh();
  };

  const handleMassalDone = (result: MutasiMassalResponse) => {
    const tunggakan = result.peringatanTunggakan;
    setMassalOpen(false);
    setSelected(new Set());
    setFeedback({
      tone: tunggakan.length > 0 ? "amber" : "emerald",
      title:
        result.mode === "LULUSKAN"
          ? `${result.diproses} santri diluluskan`
          : `${result.diproses} santri naik kelas`,
      message: (
        <div className="space-y-2">
          <p>
            {result.mode === "LULUSKAN"
              ? "Data dipindahkan ke direktori alumni dengan nomor syahadah tercatat."
              : "Kelas santri diperbarui dan riwayat mutasi tersimpan."}
          </p>
          {tunggakan.length > 0 ? (
            <div>
              <p className="font-semibold">
                Tunggakan yang perlu ditindaklanjuti:
              </p>
              <ul className="mt-1 space-y-0.5">
                {tunggakan.slice(0, 5).map((item) => (
                  <li key={item.santriId}>
                    {item.name} — {formatRupiah(item.tunggakanTotal)}
                  </li>
                ))}
              </ul>
              {tunggakan.length > 5 ? (
                <p className="mt-1 text-xs">
                  +{tunggakan.length - 5} santri lainnya.
                </p>
              ) : null}
            </div>
          ) : (
            <p>Seluruh santri terpilih bebas tunggakan.</p>
          )}
        </div>
      ),
    });
    refresh();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImporting(true);
    setFeedback(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const imported = await apiFetch<ImportReport>(
        "/api/admin/data/import-excel?jenis=santri",
        { method: "POST", body: form },
      );

      setReport(imported);
      setFeedback({
        tone: imported.gagal > 0 ? "amber" : "emerald",
        title: "Import Excel selesai",
        message: `${imported.berhasil} dari ${imported.totalBaris} baris berhasil diimpor. ${imported.gagal} baris ditolak.`,
      });
      refresh();
      void loadOpsi();
    } catch (caught) {
      setFeedback({
        tone: "rose",
        title: "Import Excel gagal",
        message: toErrorMessage(caught),
      });
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  const handleDownload = async (kind: "template" | "export") => {
    setDownloading(kind);

    try {
      if (kind === "template") {
        await downloadExcelFile(
          `/api/admin/data/export-excel${buildQuery({
            jenis: "santri",
            template: 1,
          })}`,
          "template-data-santri.xlsx",
        );
      } else {
        const query = buildQuery({
          jenis: "santri",
          statusSantri: mode,
          q: debouncedQ || undefined,
          kelas: kelas || undefined,
          kamar: kamar || undefined,
          statusMukim: statusMukim || undefined,
          tahunLulus: mode === "ALUMNI" ? tahunLulus || undefined : undefined,
        });
        await downloadExcelFile(
          `/api/admin/data/export-excel${query}`,
          `data-santri-${todayStamp()}.xlsx`,
        );
      }
    } catch (caught) {
      setFeedback({
        tone: "rose",
        title: "Unduhan gagal",
        message: toErrorMessage(caught),
      });
    } finally {
      setDownloading(null);
    }
  };

  const renderMobileCard = (item: SantriItem) => (
    <div key={item.id} className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        {mode === "AKTIF" ? (
          <input
            type="checkbox"
            aria-label={`Pilih ${item.name}`}
            checked={selected.has(item.id)}
            onChange={() => toggleSelected(item.id)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">
            {item.name}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            NIS {item.nis} · {item.kelas}
          </p>
        </div>
        <Badge tone={item.statusMukim === "MUKIM" ? "emerald" : "slate"}>
          {item.statusMukim === "MUKIM" ? "Mukim" : "Non-mukim"}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Kamar
          </p>
          <p className="mt-0.5 text-slate-700">{item.kamar}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {mode === "ALUMNI" ? "Syahadah" : "Kartu RFID"}
          </p>
          <div className="mt-0.5">
            {mode === "ALUMNI" ? (
              <p className="font-mono text-[11px] text-slate-700">
                {item.nomorSyahadah ?? "—"}
              </p>
            ) : (
              <KartuRfidInfo item={item} />
            )}
          </div>
        </div>
        <div className={mode === "ALUMNI" ? "col-span-2" : undefined}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {mode === "ALUMNI" ? "Tunggakan akhir" : "Tunggakan"}
          </p>
          <div className="mt-0.5">
            <TunggakanInfo item={item} />
          </div>
        </div>
        <div className={mode === "ALUMNI" ? "col-span-2" : undefined}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Saldo jajan
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-emerald-700">
            {formatRupiah(item.saldoJajan)}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        {canEdit ? <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => setFormState({ santri: item })}
        >
          <Pencil aria-hidden="true" size={14} />
          Edit
        </Button> : null}
        {canEdit ? <Button variant="ghost" size="sm" aria-label={`Hapus ${item.name}`} onClick={() => void handleDeleteSantri(item)}><Trash2 aria-hidden="true" size={14} /></Button> : null}
        {canEdit && mode === "AKTIF" ? <Button variant="amber" size="sm" className="flex-1" onClick={() => void handleLulusSantri(item)}><GraduationCap aria-hidden="true" size={14} />Luluskan</Button> : null}
        {mode === "AKTIF" ? (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => setPairing(item)}
          >
            <Link2 aria-hidden="true" size={14} />
            Pairing RFID
          </Button>
        ) : null}
        {canRefund && BigInt(item.saldoJajan) > 0n ? (
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => setRefund(item)}
          >
            <HandCoins aria-hidden="true" size={14} />
            Cairkan
          </Button>
        ) : null}
      </div>
    </div>
  );

  const renderRow = (item: SantriItem) => (
    <tr key={item.id} className="transition hover:bg-slate-50/70">
      {mode === "AKTIF" ? (
        <td className="w-10 px-4 py-3">
          <input
            type="checkbox"
            aria-label={`Pilih ${item.name}`}
            checked={selected.has(item.id)}
            onChange={() => toggleSelected(item.id)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
        </td>
      ) : null}
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">{item.name}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          NIS {item.nis} · NIK •••{item.nik.slice(-4)}
        </p>
        <p className="mt-1 text-[11px] font-semibold tabular-nums text-emerald-700">
          Saldo jajan {formatRupiah(item.saldoJajan)}
        </p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-slate-700">{item.kelas}</p>
        <p className="mt-0.5 text-xs text-slate-500">{item.kamar}</p>
      </td>
      {mode === "AKTIF" ? (
        <td className="px-4 py-3">
          <Badge tone={item.statusMukim === "MUKIM" ? "emerald" : "slate"}>
            {item.statusMukim === "MUKIM" ? "Mukim" : "Non-mukim"}
          </Badge>
        </td>
      ) : null}
      {mode === "ALUMNI" ? (
        <td className="px-4 py-3">
          <p className="font-mono text-xs text-slate-700">
            {item.nomorSyahadah ?? "—"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Lulus {item.tahunLulus ?? "—"}
          </p>
        </td>
      ) : (
        <td className="px-4 py-3">
          <KartuRfidInfo item={item} />
        </td>
      )}
      <td className="px-4 py-3">
        <TunggakanInfo item={item} />
      </td>
      <td className="px-4 py-3">
        <div className="flex justify-end gap-1.5">
          {canEdit ? <Button
            variant="ghost"
            size="sm"
            onClick={() => setFormState({ santri: item })}
          >
            <Pencil aria-hidden="true" size={14} />
            Edit
          </Button> : null}
          {canEdit ? <Button variant="ghost" size="sm" aria-label={`Hapus ${item.name}`} onClick={() => void handleDeleteSantri(item)}><Trash2 aria-hidden="true" size={14} />Hapus</Button> : null}
          {canEdit && mode === "AKTIF" ? <Button variant="amber" size="sm" onClick={() => void handleLulusSantri(item)}><GraduationCap aria-hidden="true" size={14} />Luluskan</Button> : null}
          {mode === "AKTIF" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPairing(item)}
            >
              <Link2 aria-hidden="true" size={14} />
              {item.rfidUid ? "Ganti Kartu" : "Pairing"}
            </Button>
          ) : null}
          {canRefund && BigInt(item.saldoJajan) > 0n ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setRefund(item)}
            >
              <HandCoins aria-hidden="true" size={14} />
              Cairkan
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );

  const activeCount = data?.summary.aktif ?? 0;
  const alumniCount = data?.summary.alumni ?? 0;
  const belumPairing = data?.summary.belumPairing ?? 0;

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {mode === "AKTIF" ? (
          <>
            <StatCard
              icon={Users}
              label="Santri Aktif"
              value={formatNumber(activeCount)}
              hint="Terdaftar sebagai santri aktif."
              tone="emerald"
            />
            <StatCard
              icon={GraduationCap}
              label="Alumni"
              value={formatNumber(alumniCount)}
              hint="Sudah diluluskan dengan syahadah."
              tone="violet"
            />
            <StatCard
              icon={WifiOff}
              label="Belum Pairing RFID"
              value={formatNumber(belumPairing)}
              hint="Perlu ditautkan ke kartu agar bisa scan."
              tone="amber"
            />
            <StatCard
              icon={ClipboardList}
              label="Hasil Filter"
              value={formatNumber(data?.total ?? 0)}
              hint={hasFilters ? "Sesuai pencarian aktif." : "Seluruh data aktif."}
              tone="slate"
            />
          </>
        ) : (
          <>
            <StatCard
              icon={GraduationCap}
              label="Total Alumni"
              value={formatNumber(alumniCount)}
              hint="Tersimpan lengkap dengan nomor syahadah."
              tone="violet"
            />
            <StatCard
              icon={ClipboardList}
              label="Angkatan Tercatat"
              value={formatNumber(opsi?.tahunLulus.length ?? 0)}
              hint="Tahun kelulusan tersedia di filter."
              tone="blue"
            />
            <StatCard
              icon={Users}
              label="Hasil Filter"
              value={formatNumber(data?.total ?? 0)}
              hint={hasFilters ? "Sesuai pencarian aktif." : "Seluruh direktori alumni."}
              tone="slate"
            />
          </>
        )}
      </section>

      <Card className="overflow-hidden">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                aria-hidden="true"
                size={17}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Cari nama, NIS, NIK, atau RFID..."
                aria-label="Pencarian santri"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex">
              <select
                value={kelas}
                onChange={(event) => {
                  setKelas(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter kelas"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 lg:w-40"
              >
                <option value="">Semua kelas</option>
                {(opsi?.kelas ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select
                value={kamar}
                onChange={(event) => {
                  setKamar(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter kamar"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 lg:w-40"
              >
                <option value="">Semua kamar</option>
                {(opsi?.kamar ?? []).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              {mode === "ALUMNI" ? (
                <select
                  value={tahunLulus}
                  onChange={(event) => {
                    setTahunLulus(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter angkatan"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 lg:w-40"
                >
                  <option value="">Semua angkatan</option>
                  {(opsi?.tahunLulus ?? []).map((tahun) => (
                    <option key={tahun} value={tahun}>
                      Angkatan {tahun}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={statusMukim}
                  onChange={(event) => {
                    setStatusMukim(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter status mukim"
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 lg:w-40"
                >
                  <option value="">Semua status</option>
                  <option value="MUKIM">Mukim</option>
                  <option value="NON_MUKIM">Non-mukim</option>
                </select>
              )}
              <Button
                variant="secondary"
                className="h-11"
                onClick={refresh}
                aria-label="Muat ulang data"
                title="Muat ulang"
              >
                <RefreshCw aria-hidden="true" size={16} />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleDownload("template")}
              loading={downloading === "template"}
            >
              <Download aria-hidden="true" size={15} />
              Template Excel
            </Button>
            {canEdit ? <Button
              variant="secondary"
              size="sm"
              onClick={() => fileRef.current?.click()}
              loading={importing}
            >
              <Upload aria-hidden="true" size={15} />
              Import Excel
            </Button> : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleDownload("export")}
              loading={downloading === "export"}
            >
              <FileSpreadsheet aria-hidden="true" size={15} />
              Unduh Excel
            </Button>
            {hasFilters ? (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                Reset filter
              </Button>
            ) : null}
            {canEdit ? <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => void handleImportFile(event)}
            /> : null}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {canEdit && mode === "AKTIF" ? (
                <Button
                  variant="amber"
                  size="sm"
                  disabled={selectedItems.length === 0}
                  onClick={() => setMassalOpen(true)}
                >
                  <GraduationCap aria-hidden="true" size={15} />
                  Proses Massal ({selectedItems.length})
                </Button>
              ) : null}
              {canEdit ? <Button size="sm" onClick={() => setFormState({ santri: null })}>
                <Plus aria-hidden="true" size={15} />
                Tambah Santri
              </Button> : null}
            </div>
          </div>
        </div>

        {feedback ? (
          <div className="border-b border-slate-100 p-4">
            <Alert
              tone={feedback.tone}
              title={feedback.title}
              icon={
                feedback.tone === "emerald"
                  ? CheckCircle2
                  : feedback.tone === "amber"
                    ? AlertTriangle
                    : AlertCircle
              }
            >
              {feedback.message}
            </Alert>
          </div>
        ) : null}

        {error ? (
          <div className="p-4">
            <ErrorBanner message={error} onRetry={refresh} />
          </div>
        ) : loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={mode === "ALUMNI" ? GraduationCap : Users}
              title={
                hasFilters
                  ? "Tidak ada data yang cocok"
                  : mode === "ALUMNI"
                    ? "Direktori alumni masih kosong"
                    : "Belum ada santri aktif"
              }
              description={
                hasFilters
                  ? "Ubah kata kunci atau filter kelas/kamar untuk melihat data lain."
                  : mode === "ALUMNI"
                    ? "Alumni akan muncul setelah proses kelulusan massal dijalankan."
                    : "Tambahkan santri baru atau impor data dari template Excel."
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Reset filter
                  </Button>
                ) : canEdit ? (
                  <Button size="sm" onClick={() => setFormState({ santri: null })}>
                    <Plus aria-hidden="true" size={15} />
                    Tambah Santri
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/80">
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {mode === "AKTIF" ? (
                      <th className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label="Pilih semua santri di halaman ini"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </th>
                    ) : null}
                    <th className="px-4 py-3">Santri</th>
                    <th className="px-4 py-3">
                      {mode === "ALUMNI" ? "Kelas Terakhir" : "Kelas / Kamar"}
                    </th>
                    {mode === "AKTIF" ? (
                      <th className="px-4 py-3">Status Mukim</th>
                    ) : (
                      <th className="px-4 py-3">Syahadah</th>
                    )}
                    <th className="px-4 py-3">
                      {mode === "ALUMNI" ? "Syahadah" : "Kartu RFID"}
                    </th>
                    <th className="px-4 py-3">
                      {mode === "ALUMNI" ? "Tunggakan Akhir" : "Tunggakan"}
                    </th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {mode === "ALUMNI"
                    ? alumniGroups.map(([tahun, items]) => (
                        <Fragment key={tahun}>
                          <tr className="bg-slate-50/70">
                            <td colSpan={5} className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                                <GraduationCap
                                  aria-hidden="true"
                                  size={14}
                                  className="text-violet-600"
                                />
                                {tahun === "TIDAK_DIKETAHUI"
                                  ? "Angkatan tidak tercatat"
                                  : `Angkatan ${tahun}`}
                              </span>
                              <span className="ml-2 text-[11px] font-medium text-slate-400">
                                {items.length} alumni
                              </span>
                            </td>
                          </tr>
                          {items.map(renderRow)}
                        </Fragment>
                      ))
                    : data.items.map(renderRow)}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {mode === "ALUMNI"
                ? alumniGroups.map(([tahun, items]) => (
                    <div key={tahun}>
                      <div className="flex items-center gap-1.5 bg-slate-50/80 px-4 py-2.5 text-xs font-bold text-slate-700">
                        <GraduationCap
                          aria-hidden="true"
                          size={14}
                          className="text-violet-600"
                        />
                        {tahun === "TIDAK_DIKETAHUI"
                          ? "Angkatan tidak tercatat"
                          : `Angkatan ${tahun}`}
                        <span className="ml-auto text-[11px] font-medium text-slate-400">
                          {items.length} alumni
                        </span>
                      </div>
                      {items.map(renderMobileCard)}
                    </div>
                  ))
                : data.items.map(renderMobileCard)}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Menampilkan{" "}
                <span className="font-semibold text-slate-700">
                  {startRow}–{endRow}
                </span>{" "}
                dari{" "}
                <span className="font-semibold text-slate-700">
                  {formatNumber(data.total)}
                </span>{" "}
                {mode === "ALUMNI" ? "alumni" : "santri"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft aria-hidden="true" size={15} />
                  Sebelumnya
                </Button>
                <span className="px-1 text-xs font-semibold text-slate-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Berikutnya
                  <ChevronRight aria-hidden="true" size={15} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {formState ? (
        <SantriFormModal
          open
          santri={formState.santri}
          opsi={opsi}
          defaultStatus={mode}
          canDispensasi={canRefund}
          onClose={() => setFormState(null)}
          onSaved={handleSavedSantri}
        />
      ) : null}

      {pairing ? (
        <PairingModal
          santri={pairing}
          onClose={() => setPairing(null)}
          onSaved={handleSavedPairing}
        />
      ) : null}

      {refund ? (
        <RefundModal
          santri={refund}
          onClose={() => setRefund(null)}
          onDone={handleRefundDone}
        />
      ) : null}

      {massalOpen ? (
        <MassalModal
          selected={selectedItems}
          opsi={opsi}
          onClose={() => setMassalOpen(false)}
          onDone={handleMassalDone}
        />
      ) : null}

      {report ? (
        <Modal
          open
          onClose={() => setReport(null)}
          title="Laporan Import Excel"
          description={`Jenis data: santri · ${report.totalBaris} baris dibaca`}
          size="lg"
          footer={
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setReport(null)}>
                Tutup
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Baris
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                  {report.totalBaris}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                  Berhasil
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-emerald-800">
                  {report.berhasil}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                  Gagal
                </p>
                <p className="mt-1 text-xl font-bold tabular-nums text-rose-800">
                  {report.gagal}
                </p>
              </div>
            </div>

            {report.errors.length > 0 ? (
              <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                {report.errors.map((item, index) => (
                  <p key={`${item.baris}-${index}`} className="text-xs text-amber-900">
                    <span className="font-semibold">Baris {item.baris}:</span>{" "}
                    {item.pesan}
                  </p>
                ))}
              </div>
            ) : (
              <Alert tone="emerald" icon={CheckCircle2} title="Semua baris valid">
                Data santri berhasil diimpor tanpa kesalahan.
              </Alert>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
