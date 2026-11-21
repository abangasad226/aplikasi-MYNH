"use client";

import { useState } from "react";
import { Eye, GraduationCap, RefreshCw, Search } from "lucide-react";
import { Badge, Button, Card, EmptyState, ErrorBanner, cn } from "@/components/ui";
import { periodeSaatIni, type AkademikOptions, type RaporDetail, type RaporRosterItem } from "@/lib/akademik-types";
import { LoadingState, PeriodFilters, confirmDiscard, inputClass, periodQuery, useApiResource, usePanelActivity, validFilters, type KelasPeriode, type PanelActivity } from "./akademik-ui";
import { RaporPreview } from "./rapor-preview";

export function RaporPanel({ options, ...activity }: { options: AkademikOptions } & PanelActivity) {
  const [filters, setFilters] = useState<KelasPeriode>(() => ({ kelas: options.kelas[0] ?? "", ...periodeSaatIni() }));
  const [revision, setRevision] = useState(0);
  const url = validFilters(filters) ? `/api/admin/akademik/rapor?${periodQuery(filters).toString()}` : null;
  const resource = useApiResource<{ items: RaporRosterItem[] }>(url, revision);
  const [selection, setSelection] = useState<{ key: string; santriId: string } | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  usePanelActivity(busy, dirty, activity);
  const items = resource.data?.items ?? [];
  const selectedId = selection?.key === url ? selection.santriId : null;
  const selected = items.find((item) => item.santri.id === selectedId);
  const shown = items.filter((item) => `${item.santri.name} ${item.santri.nis}`.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id")));
  const publishedCount = items.filter((item) => item.rapor?.statusRapor === "DITERBITKAN").length;

  function changeFilters(next: KelasPeriode) {
    if (busy || !confirmDiscard(dirty)) return;
    setDirty(false);
    setSelection(null);
    setSearch("");
    setFilters(next);
  }
  function select(santriId: string) {
    if (!url || busy || santriId === selectedId || !confirmDiscard(dirty)) return;
    setDirty(false);
    setSelection({ key: url, santriId });
  }
  function reload() {
    if (busy || !confirmDiscard(dirty)) return;
    setDirty(false);
    setRevision((value) => value + 1);
  }
  function saved(detail: RaporDetail) {
    if (!detail.id || detail.semester !== filters.semester || detail.tahunAjaran !== filters.tahunAjaran) return;
    const summary = { id: detail.id, semester: detail.semester, tahunAjaran: detail.tahunAjaran, statusRapor: detail.statusRapor, tanggalTerbit: detail.tanggalTerbit };
    resource.updateData((current) => ({ items: current.items.map((item) => item.santri.id === detail.isi.santri.id ? { ...item, rapor: summary } : item) }));
  }

  return (
    <section className="space-y-4" aria-label="Rekap absensi dan rapor semester">
      <div><h3 className="text-lg font-semibold">Rekap Absensi & Cetak Rapor</h3><p className="mt-1 text-sm leading-6 text-slate-500">Tinjau nilai, kehadiran, dan kedisiplinan semester. Lengkapi catatan wali kelas sebelum menerbitkan rapor kepada wali santri.</p></div>
      <PeriodFilters value={filters} kelas={options.kelas} onChange={changeFilters} disabled={busy} />
      {options.kelas.length === 0 ? <EmptyState title="Belum ada kelas" description="Minta Bendahara melengkapi kelas santri aktif di Data Induk, lalu muat ulang halaman." /> : !url ? <EmptyState title="Lengkapi filter kelas dan periode" description="Gunakan tahun ajaran yang valid dan berurutan untuk memuat daftar santri." /> : null}
      {resource.loading ? <LoadingState label="Memuat daftar rapor kelas…" /> : null}
      {resource.error ? <ErrorBanner title="Daftar rapor tidak dapat dimuat" message={resource.error} onRetry={reload} /> : null}
      {resource.data ? <div className="grid items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="min-w-0 overflow-hidden">
          <div className="space-y-3 border-b border-slate-100 p-4">
            <div className="flex items-center justify-between gap-2"><h4 className="font-semibold">Santri kelas {filters.kelas}</h4><Button variant="ghost" size="sm" aria-label="Muat ulang daftar dan pratinjau rapor" title="Muat ulang daftar dan pratinjau" disabled={busy} onClick={reload}><RefreshCw aria-hidden="true" size={16} /></Button></div>
            <p className="text-xs leading-5 text-slate-500">{filters.semester === "GANJIL" ? "Ganjil" : "Genap"} · {filters.tahunAjaran}<br />{items.length} santri · {publishedCount} diterbitkan</p>
            <label className="relative block"><span className="sr-only">Cari nama atau NIS santri</span><Search aria-hidden="true" size={16} className="absolute left-3 top-3 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIS…" className={`${inputClass} pl-9`} /></label>
          </div>
          {!items.length ? <div className="p-4"><EmptyState title="Tidak ada santri" description="Belum ada santri aktif di kelas ini. Pilih kelas lain atau periksa Data Induk." /></div> : !shown.length ? <div className="p-4"><EmptyState title="Santri tidak ditemukan" description="Coba nama atau NIS lain." action={<Button size="sm" variant="secondary" onClick={() => setSearch("")}>Reset pencarian</Button>} /></div> : <ul className="max-h-[680px] divide-y divide-slate-100 overflow-y-auto" aria-label="Pilih santri untuk pratinjau rapor">{shown.map((item) => <li key={item.santri.id}>
            <button type="button" disabled={busy} aria-pressed={selectedId === item.santri.id} onClick={() => select(item.santri.id)} className={cn("flex w-full items-start gap-3 px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60", selectedId === item.santri.id ? "bg-emerald-50" : "hover:bg-slate-50")}>
              <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", selectedId === item.santri.id ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400")}><Eye aria-hidden="true" size={16} /></span>
              <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-slate-900">{item.santri.name}</span><span className="mt-0.5 block text-xs text-slate-500">NIS {item.santri.nis}</span><span className="mt-2 block"><Badge tone={item.rapor?.statusRapor === "DITERBITKAN" ? "emerald" : "amber"}>{item.rapor?.statusRapor === "DITERBITKAN" ? "DITERBITKAN" : item.rapor ? "DRAFT" : "Belum dibuat"}</Badge></span></span>
            </button>
          </li>)}</ul>}
        </Card>
        <div className="min-w-0">{selected ? <RaporPreview key={`${url}:${revision}:${selected.santri.id}`} santriId={selected.santri.id} semester={filters.semester} tahunAjaran={filters.tahunAjaran} onSaved={saved} onBusyChange={setBusy} onDirtyChange={setDirty} /> : <EmptyState icon={GraduationCap} title="Pilih santri untuk melihat rapor" description="Pratinjau menggabungkan nilai mapel dan kitab, rekap kehadiran, serta catatan pelanggaran pada semester yang dipilih." />}</div>
      </div> : null}
    </section>
  );
}
