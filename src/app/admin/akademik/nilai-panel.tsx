"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ClipboardList, LockKeyhole, RefreshCw, Save } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, ErrorBanner } from "@/components/ui";
import { periodeSaatIni, type AkademikOptions, type MapelItem, type NilaiInput, type NilaiRow } from "@/lib/akademik-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { Field, LoadingState, PeriodFilters, confirmDiscard, inputClass, periodQuery, tableCellClass, tableHeadClass, useApiResource, usePanelActivity, validFilters, type KelasPeriode, type PanelActivity } from "./akademik-ui";

type NilaiDraft = { nilaiHarian: string; nilaiUTS: string; nilaiUAS: string; catatanGuru: string };
const SCORE_FIELDS = [{ key: "nilaiHarian", label: "Harian" }, { key: "nilaiUTS", label: "UTS" }, { key: "nilaiUAS", label: "UAS" }] as const;
function draftFromRow(row: NilaiRow): NilaiDraft {
  return { nilaiHarian: row.nilai ? String(row.nilai.nilaiHarian) : "", nilaiUTS: row.nilai ? String(row.nilai.nilaiUTS) : "", nilaiUAS: row.nilai ? String(row.nilai.nilaiUAS) : "", catatanGuru: row.nilai?.catatanGuru ?? "" };
}
function validScore(value: string) {
  return value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100;
}
function result(draft: NilaiDraft) {
  if (!SCORE_FIELDS.every(({ key }) => validScore(draft[key]))) return null;
  const average = Math.round(((Number(draft.nilaiHarian) + Number(draft.nilaiUTS) + Number(draft.nilaiUAS)) / 3) * 100) / 100;
  return { average, predicate: average >= 90 ? "A" : average >= 80 ? "B" : average >= 70 ? "C" : "D" };
}

export function NilaiPanel({ options, ...activity }: { options: AkademikOptions } & PanelActivity) {
  const [filters, setFilters] = useState<KelasPeriode>(() => ({ kelas: options.kelas[0] ?? "", ...periodeSaatIni() }));
  const [mapelId, setMapelId] = useState("");
  const [mapelRevision, setMapelRevision] = useState(0);
  const mapelResource = useApiResource<{ items: MapelItem[] }>("/api/admin/akademik/mapel", mapelRevision);
  const [revision, setRevision] = useState(0);
  const query = periodQuery(filters);
  query.set("mapelId", mapelId);
  const url = validFilters(filters) && mapelId ? `/api/admin/akademik/nilai?${query.toString()}` : null;
  const resource = useApiResource<{ items: NilaiRow[]; mapel: MapelItem }>(url, revision);
  const [edits, setEdits] = useState<Record<string, NilaiDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dirty = Object.keys(edits).length > 0;
  usePanelActivity(busy, dirty, activity);
  const rows = resource.data?.items ?? [];
  const editable = rows.filter((row) => !row.diterbitkan);
  const lockedCount = rows.length - editable.length;

  function resetChanges() {
    setEdits({});
    setError(null);
    setSuccess(null);
  }
  function changeFilters(next: KelasPeriode) {
    if (busy || !confirmDiscard(dirty)) return;
    resetChanges();
    setFilters(next);
  }
  function changeMapel(next: string) {
    if (busy || !confirmDiscard(dirty)) return;
    resetChanges();
    setMapelId(next);
  }
  function reload() {
    if (busy || !confirmDiscard(dirty)) return;
    resetChanges();
    setRevision((value) => value + 1);
  }
  function edit(row: NilaiRow, key: keyof NilaiDraft, value: string) {
    if (busy || row.diterbitkan || !resource.data) return;
    setEdits((current) => {
      const base = draftFromRow(row);
      const next = { ...current };
      const draft = { ...(current[row.santri.id] ?? base), [key]: value };
      if (JSON.stringify(base) === JSON.stringify(draft)) delete next[row.santri.id];
      else next[row.santri.id] = draft;
      return next;
    });
    setError(null);
    setSuccess(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || resource.loading || !resource.data || !url || resource.data.mapel.id !== mapelId) return;
    setError(null);
    setSuccess(null);
    const items: NilaiInput[] = [];
    for (const row of rows) {
      if (row.diterbitkan) continue;
      const draft = edits[row.santri.id] ?? draftFromRow(row);
      const empty = SCORE_FIELDS.every(({ key }) => draft[key].trim() === "") && !draft.catatanGuru.trim();
      if (empty && !row.nilai && !edits[row.santri.id]) continue;
      if (!SCORE_FIELDS.every(({ key }) => validScore(draft[key]))) {
        setError(`${row.santri.name} (${row.santri.nis}): isi Harian, UTS, dan UAS secara lengkap dengan bilangan bulat 0–100. Baris terisi sebagian tidak dapat disimpan; nilai tersimpan tidak dapat dikosongkan.`);
        return;
      }
      if (draft.catatanGuru.trim().length > 2000) {
        setError(`Catatan untuk ${row.santri.name} melebihi 2.000 karakter.`);
        return;
      }
      items.push({ santriId: row.santri.id, nilaiHarian: Number(draft.nilaiHarian), nilaiUTS: Number(draft.nilaiUTS), nilaiUAS: Number(draft.nilaiUAS), catatanGuru: draft.catatanGuru.trim() || null });
    }
    if (!items.length) {
      setError("Belum ada nilai yang dapat disimpan. Isi ketiga komponen nilai pada setidaknya satu baris yang tidak terkunci.");
      return;
    }
    if (items.length > 500) {
      setError("Maksimal 500 santri dalam satu pengiriman. Hubungi pengelola untuk menyesuaikan pembagian kelas.");
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch<{ tersimpan: number }>("/api/admin/akademik/nilai", {
        method: "PUT",
        body: JSON.stringify({ ...filters, mapelId, items }),
      });
      setEdits({});
      setSuccess(`${response.tersimpan} nilai santri berhasil disimpan. Nilai rapor yang sudah diterbitkan tidak ikut dikirim.`);
      setRevision((value) => value + 1);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="Input nilai santri massal">
      <div><h3 className="text-lg font-semibold">Input Nilai Massal</h3><p className="mt-1 text-sm text-slate-500">Pilih kelas, periode, dan mapel. Nilai yang sudah ada dapat diperbarui selama rapor belum diterbitkan.</p></div>
      <PeriodFilters value={filters} kelas={options.kelas} onChange={changeFilters} disabled={busy}>
        <Field label="Mapel / Kitab"><select required disabled={mapelResource.loading || !mapelResource.data} className={inputClass} value={mapelId} onChange={(event) => changeMapel(event.target.value)}><option value="">{mapelResource.loading ? "Memuat mapel…" : "Pilih mapel / kitab"}</option>{mapelResource.data?.items.map((item) => <option key={item.id} value={item.id}>{item.kodeMapel} · {item.namaMapel}</option>)}</select></Field>
      </PeriodFilters>
      {mapelResource.error ? <ErrorBanner title="Pilihan mapel tidak tersedia" message={mapelResource.error} onRetry={() => setMapelRevision((value) => value + 1)} /> : null}
      {options.kelas.length === 0 ? <EmptyState title="Belum ada kelas" description="Minta Bendahara melengkapi kelas santri aktif di Data Induk, lalu muat ulang halaman." /> : mapelResource.data?.items.length === 0 ? <EmptyState title="Belum ada mapel / kitab" description="Tambahkan mapel di tab Mapel & Kitab terlebih dahulu." /> : null}
      <Alert tone="slate" title="Perhitungan nilai">
        Nilai akhir = (Harian + UTS + UAS) ÷ 3, dibulatkan 2 desimal. Predikat: ≥90 A, ≥80 B, ≥70 C, selain itu D. Ketuntasan ditentukan terpisah: nilai akhir ≥ KKM.
        <span className="mt-1 block">Isi bilangan bulat 0–100. Baris baru yang sepenuhnya kosong dan tidak diubah akan dilewati. Jika mulai mengisi nilai atau catatan, ketiga komponen nilai wajib lengkap.</span>
      </Alert>
      {success ? <Alert tone="emerald" title="Nilai tersimpan">{success}</Alert> : null}
      {error ? <ErrorBanner title="Nilai belum tersimpan" message={error} /> : null}
      {resource.error ? <ErrorBanner message={resource.error} onRetry={reload} /> : null}
      {resource.loading ? <LoadingState label="Memuat daftar santri dan nilai…" /> : null}
      {!url && options.kelas.length > 0 && mapelResource.data && mapelResource.data.items.length > 0 ? <EmptyState icon={ClipboardList} title="Pilih filter untuk mulai menilai" description="Lengkapi kelas, tahun ajaran yang valid, dan mapel / kitab. Data hanya dimuat untuk periode yang dipilih." /> : null}
      {resource.data && !resource.loading ? <>
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div><h4 className="font-semibold">{resource.data.mapel.namaMapel} <span className="ml-1 text-xs font-normal text-slate-500">{resource.data.mapel.kodeMapel}</span></h4><p className="mt-1 text-xs leading-5 text-slate-500">Kelas {filters.kelas} · {filters.semester === "GANJIL" ? "Ganjil" : "Genap"} {filters.tahunAjaran} · Pengampu: {resource.data.mapel.pengampu.namaLengkap}</p><div className="mt-2 flex flex-wrap gap-2"><Badge tone="emerald">KKM {resource.data.mapel.kkm}</Badge><Badge>{editable.length} dapat diedit</Badge><Badge tone="amber">{lockedCount} terkunci</Badge></div></div>
            <Button variant="secondary" size="sm" disabled={busy} onClick={reload}><RefreshCw aria-hidden="true" size={15} />Muat ulang nilai</Button>
          </div>
          {!rows.length ? <div className="p-4"><EmptyState title="Tidak ada santri di kelas ini" description="Pilih kelas lain atau periksa data santri aktif di Data Induk." /></div> : <form onSubmit={(event) => void save(event)}>
            <div className="overflow-x-auto"><table className="w-full min-w-[1080px]"><caption className="sr-only">Nilai santri; setiap baris berisi Harian, UTS, UAS, nilai akhir, predikat, ketuntasan, dan catatan guru</caption><thead className="bg-slate-50"><tr>{["Santri", "Harian", "UTS", "UAS", "Nilai akhir", "Predikat / KKM", "Catatan guru"].map((label) => <th key={label} scope="col" className={tableHeadClass}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => {
              const draft = edits[row.santri.id] ?? draftFromRow(row);
              const computed = result(draft);
              const needsValues = Boolean(row.nilai || edits[row.santri.id] || SCORE_FIELDS.some(({ key }) => draft[key].trim()) || draft.catatanGuru.trim());
              const tuntas = computed !== null && computed.average >= resource.data!.mapel.kkm;
              return <tr key={row.santri.id} className={row.diterbitkan ? "bg-slate-50" : edits[row.santri.id] ? "bg-emerald-50/30" : "hover:bg-slate-50/50"}>
                <th scope="row" className={`${tableCellClass} min-w-44 text-left font-normal`}><Link className="block font-semibold text-emerald-800 hover:underline" href={`/santri/${encodeURIComponent(row.santri.id)}`}>{row.santri.name}</Link><span className="mt-1 block text-xs text-slate-500">NIS {row.santri.nis}</span>{row.diterbitkan ? <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700"><LockKeyhole aria-hidden="true" size={12} />Rapor diterbitkan</span> : edits[row.santri.id] ? <span className="mt-2 block text-[11px] text-emerald-700">Belum disimpan</span> : null}</th>
                {SCORE_FIELDS.map(({ key, label }) => <td key={key} className={tableCellClass}><input type="number" required={needsValues && !row.diterbitkan} min={0} max={100} step={1} inputMode="numeric" aria-label={`${label} untuk ${row.santri.name}`} value={draft[key]} placeholder="—" disabled={busy || row.diterbitkan} onChange={(event) => edit(row, key, event.target.value)} className={`${inputClass} w-20 px-2 text-center tabular-nums`} /></td>)}
                <td className={`${tableCellClass} pt-6 font-semibold tabular-nums`}>{computed ? computed.average.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                <td className={tableCellClass}>{computed ? <div className="flex flex-col items-start gap-1"><Badge tone="slate">Predikat {computed.predicate}</Badge><Badge tone={tuntas ? "emerald" : "rose"}>{tuntas ? "Tuntas" : "Belum tuntas"}</Badge></div> : <span className="text-xs text-slate-400">Belum lengkap</span>}</td>
                <td className={tableCellClass}><textarea rows={2} maxLength={2000} aria-label={`Catatan guru untuk ${row.santri.name}`} disabled={busy || row.diterbitkan} value={draft.catatanGuru} onChange={(event) => edit(row, "catatanGuru", event.target.value)} className={`${inputClass} min-w-56 resize-y font-normal`} placeholder="Catatan pembelajaran (opsional)" /></td>
              </tr>;
            })}</tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-4"><p className="max-w-xl text-xs leading-5 text-slate-500">{lockedCount ? "Baris rapor diterbitkan tidak dapat diedit dan tidak dikirim. Tarik rapor ke draft melalui tab Rekap Absensi & Cetak Rapor untuk membukanya." : "Semua baris editable yang lengkap akan disimpan atau diperbarui. Tidak ada penyimpanan otomatis."}</p><Button type="submit" loading={busy} disabled={!editable.length || resource.loading || !resource.data || resource.data.mapel.id !== mapelId}><Save aria-hidden="true" size={16} />Simpan nilai</Button></div>
          </form>}
        </Card>
        {rows.length > 0 && editable.length === 0 ? <Alert tone="amber" title="Seluruh nilai terkunci">Semua santri pada daftar ini memiliki rapor yang sudah diterbitkan. Lakukan penarikan ke draft secara eksplisit sebelum mengubah nilai.</Alert> : null}
      </> : null}
    </section>
  );
}
