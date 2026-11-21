"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Briefcase,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileSpreadsheet,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from "lucide-react";

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
} from "@/components/ui";
import type {
  GuruItem,
  GuruListResponse,
  ImportReport,
} from "@/lib/api-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { formatNumber } from "@/lib/format";

import { buildQuery, downloadExcelFile, todayStamp } from "./excel-client";
import { GuruFormModal } from "./guru-form-modal";
import {
  JABATAN_BADGE_TONE,
  JABATAN_LABEL,
  JABATAN_OPTIONS,
  STATUS_KEPEGAWAIAN_OPTIONS,
} from "./guru-options";

const PAGE_SIZE = 24;

type Feedback = {
  tone: "emerald" | "amber" | "rose";
  title: string;
  message: ReactNode;
};

type GuruStep = "IDENTITAS" | "KEPEGAWAIAN" | "AKUN";

function namaTampilGuru(item: GuruItem): string {
  const depan = item.gelarDepan ? `${item.gelarDepan} ` : "";
  const belakang = item.gelarBelakang ? `, ${item.gelarBelakang}` : "";
  return `${depan}${item.namaLengkap}${belakang}`;
}

function statusShort(value: string): string {
  return value === "PNS_DPK" ? "PNS/DPK" : value;
}

export function GuruDirectory({ canEdit = false }: { canEdit?: boolean }) {
  const [data, setData] = useState<GuruListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusKepegawaian, setStatusKepegawaian] = useState("");
  const [jabatan, setJabatan] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [formState, setFormState] = useState<{
    guru: GuruItem | null;
    step?: GuruStep;
  } | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [downloading, setDownloading] = useState<"template" | "export" | null>(
    null,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    const query = buildQuery({
      q: debouncedQ || undefined,
      statusKepegawaian: statusKepegawaian || undefined,
      jabatan: jabatan || undefined,
      page,
      limit: PAGE_SIZE,
    });

    apiFetch<GuruListResponse>(`/api/operator/guru${query}`)
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
  }, [debouncedQ, statusKepegawaian, jabatan, page, reloadKey]);

  const totalPages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.limit ?? PAGE_SIZE)),
  );
  const startRow = data && data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
  const endRow = data ? Math.min(data.page * data.limit, data.total) : 0;

  const hasFilters = Boolean(q || statusKepegawaian || jabatan);

  const resetFilters = () => {
    setQ("");
    setStatusKepegawaian("");
    setJabatan("");
    setPage(1);
  };

  const handleDelete = async (item: GuruItem) => {
    if (!canEdit || !window.confirm(`Hapus data ${namaTampilGuru(item)}?`)) return;
    try {
      await apiFetch(`/api/operator/guru/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      refresh();
    } catch (caught) { setError(toErrorMessage(caught)); }
  };

  const handleSaved = (
    item: GuruItem,
    mode: "create" | "edit",
    akunDibuat: boolean,
  ) => {
    setFormState(null);
    setFeedback({
      tone: "emerald",
      title: mode === "create" ? "Guru/ustadz berhasil ditambahkan" : "Data guru diperbarui",
      message: akunDibuat
        ? `${namaTampilGuru(item)} tersimpan dan akun login ${
            item.akun?.email ?? ""
          } dibuat dengan role USTADZ_PENGURUS.`
        : `${namaTampilGuru(item)} tersimpan.`,
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
        "/api/admin/data/import-excel?jenis=guru",
        { method: "POST", body: form },
      );

      setReport(imported);
      setFeedback({
        tone: imported.gagal > 0 ? "amber" : "emerald",
        title: "Import Excel selesai",
        message: `${imported.berhasil} dari ${imported.totalBaris} baris guru berhasil diimpor. ${imported.gagal} baris ditolak.`,
      });
      refresh();
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
            jenis: "guru",
            template: 1,
          })}`,
          "template-data-guru.xlsx",
        );
      } else {
        const query = buildQuery({
          jenis: "guru",
          q: debouncedQ || undefined,
          statusKepegawaian: statusKepegawaian || undefined,
          jabatan: jabatan || undefined,
        });
        await downloadExcelFile(
          `/api/admin/data/export-excel${query}`,
          `data-guru-${todayStamp()}.xlsx`,
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

  const summary = data?.summary;
  const guruCards = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-5">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Guru & Ustadz"
          value={formatNumber(summary?.total ?? 0)}
          hint="Guru, ustadz pengajar kitab, dan tendik."
          tone="emerald"
        />
        <StatCard
          icon={UserCheck}
          label="Guru & Ustadz Aktif"
          value={formatNumber(summary?.aktif ?? 0)}
          hint="Masih aktif bertugas di pesantren."
          tone="teal"
        />
        <StatCard
          icon={Briefcase}
          label="GTY / GTT"
          value={`${formatNumber(summary?.gty ?? 0)} / ${formatNumber(
            summary?.gtt ?? 0,
          )}`}
          hint={`Pengabdian: ${formatNumber(summary?.pengabdian ?? 0)} orang.`}
          tone="blue"
        />
        <StatCard
          icon={ClipboardList}
          label="Hasil Filter"
          value={formatNumber(data?.total ?? 0)}
          hint={hasFilters ? "Sesuai pencarian aktif." : "Seluruh direktori guru & ustadz."}
          tone="slate"
        />
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
                placeholder="Cari nama, NIK, NIP, NUPTK, atau mapel..."
                aria-label="Pencarian guru"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:flex">
              <select
                value={statusKepegawaian}
                onChange={(event) => {
                  setStatusKepegawaian(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter status kepegawaian"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 lg:w-44"
              >
                <option value="">Semua status</option>
                {STATUS_KEPEGAWAIAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={jabatan}
                onChange={(event) => {
                  setJabatan(event.target.value);
                  setPage(1);
                }}
                aria-label="Filter jabatan"
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 lg:w-44"
              >
                <option value="">Semua jabatan</option>
                {JABATAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                variant="secondary"
                className="h-11"
                onClick={refresh}
                aria-label="Muat ulang data guru"
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
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(event) => void handleImportFile(event)}
            />
            {canEdit ? <Button
              size="sm"
              className="ml-auto"
              onClick={() => setFormState({ guru: null })}
            >
              <Plus aria-hidden="true" size={15} />
              Tambah Guru / Ustadz
            </Button> : null}
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
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-52 w-full" />
            ))}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Briefcase}
              title={
                hasFilters
                  ? "Tidak ada guru yang cocok"
                  : "Direktori guru & ustadz masih kosong"
              }
              description={
                hasFilters
                  ? "Ubah kata kunci atau filter status/jabatan untuk melihat data lain."
                  : "Tambahkan guru/ustadz baru atau impor data dari template Excel."
              }
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={resetFilters}>
                    Reset filter
                  </Button>
                ) : canEdit ? (
                  <Button size="sm" onClick={() => setFormState({ guru: null })}>
                    <Plus aria-hidden="true" size={15} />
                    Tambah Guru / Ustadz
                  </Button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {guruCards.map((item) => {
                const jabatanTone = JABATAN_BADGE_TONE[item.jabatan] ?? "slate";
                const nama = namaTampilGuru(item);

                return (
                  <article
                    key={item.id}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar
                        name={item.namaLengkap}
                        size="md"
                        tone={
                          item.jabatan === "PENGASUH"
                            ? "emerald"
                            : item.jabatan === "BENDAHARA"
                              ? "amber"
                              : "slate"
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-slate-900">
                          {nama}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {item.jabatan === "USTADZ_NGAJI"
                            ? "Pengajar kitab"
                            : JABATAN_LABEL[item.jabatan] ?? item.jabatan}
                        </p>
                      </div>
                      <Badge tone={item.statusAktif ? "emerald" : "slate"}>
                        {item.statusAktif ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Badge tone={jabatanTone}>
                        {JABATAN_LABEL[item.jabatan] ?? item.jabatan}
                      </Badge>
                      <Badge tone="blue">
                        {statusShort(item.statusKepegawaian)}
                      </Badge>
                      <Badge tone="slate">
                        {item.pendidikanTerakhir.replace("_", " ")}
                      </Badge>
                    </div>

                    <dl className="mt-3 space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <ShieldCheck
                          aria-hidden="true"
                          size={14}
                          className="shrink-0 text-slate-400"
                        />
                        <span className="truncate">
                          NIK •••{item.nik.slice(-4)}
                          {item.nuptk ? ` · NUPTK ${item.nuptk}` : ""}
                          {!item.nuptk && item.npk ? ` · NPK ${item.npk}` : ""}
                        </span>
                      </div>
                      {item.mataPelajaranAtauKitab ? (
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <BookOpen
                            aria-hidden="true"
                            size={14}
                            className="shrink-0 text-slate-400"
                          />
                          <span className="truncate">
                            {item.mataPelajaranAtauKitab}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Phone
                          aria-hidden="true"
                          size={14}
                          className="shrink-0 text-slate-400"
                        />
                        <span className="truncate">{item.noHp}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <KeyRound
                          aria-hidden="true"
                          size={14}
                          className="shrink-0 text-slate-400"
                        />
                        {item.akun ? (
                          <span className="truncate">{item.akun.email}</span>
                        ) : (
                          <span className="text-amber-700">
                            Belum memiliki akun login
                          </span>
                        )}
                      </div>
                    </dl>

                    <div className="mt-auto flex gap-2 pt-4">
                      {canEdit ? <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => setFormState({ guru: item })}
                      >
                        <Pencil aria-hidden="true" size={14} />
                        Edit
                      </Button> : null}
                      {canEdit ? <Button variant="ghost" size="sm" aria-label={`Hapus ${item.namaLengkap}`} onClick={() => void handleDelete(item)}><Trash2 aria-hidden="true" size={14} />Hapus</Button> : null}
                      {item.akun ? (
                        <Badge tone="emerald" className="self-center">
                          <CheckCircle2 aria-hidden="true" size={13} />
                          Akun aktif
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            setFormState({ guru: item, step: "AKUN" })
                          }
                        >
                          <KeyRound aria-hidden="true" size={14} />
                          Buat Akun
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
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
                guru &amp; ustadz
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
        <GuruFormModal
          guru={formState.guru}
          initialStep={formState.step}
          onClose={() => setFormState(null)}
          onSaved={handleSaved}
        />
      ) : null}

      {report ? (
        <Modal
          open
          onClose={() => setReport(null)}
          title="Laporan Import Excel Guru"
          description={`${report.totalBaris} baris dibaca`}
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
                  <p
                    key={`${item.baris}-${index}`}
                    className="text-xs text-amber-900"
                  >
                    <span className="font-semibold">Baris {item.baris}:</span>{" "}
                    {item.pesan}
                  </p>
                ))}
              </div>
            ) : (
              <Alert tone="emerald" icon={CheckCircle2} title="Semua baris valid">
                Data guru berhasil diimpor tanpa kesalahan.
              </Alert>
            )}

            <p className="flex items-center gap-1.5 text-xs leading-5 text-slate-500">
              <Mail aria-hidden="true" size={14} />
              Akun login tidak dibuat otomatis lewat import. Gunakan tombol
              &ldquo;Buat Akun&rdquo; pada kartu guru.
            </p>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
