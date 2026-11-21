"use client";

import { useState, type FormEvent } from "react";
import { BookOpen, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, ErrorBanner, Modal } from "@/components/ui";
import { KATEGORI_MAPEL_LABEL, type AkademikOptions, type KategoriMapel, type MapelItem } from "@/lib/akademik-types";
import { ApiError, apiFetch, toErrorMessage } from "@/lib/client-api";
import { Field, LoadingState, confirmDiscard, inputClass, tableCellClass, tableHeadClass, useApiResource, usePanelActivity, type PanelActivity } from "./akademik-ui";

type MapelForm = { kodeMapel: string; namaMapel: string; kategori: KategoriMapel; kkm: string; pengampuId: string };
const EMPTY_FORM: MapelForm = { kodeMapel: "", namaMapel: "", kategori: "SEKOLAH_FORMAL", kkm: "75", pengampuId: "" };
function formFromItem(item: MapelItem): MapelForm {
  return { kodeMapel: item.kodeMapel, namaMapel: item.namaMapel, kategori: item.kategori, kkm: String(item.kkm), pengampuId: item.pengampuId };
}

export function MapelPanel({ options, ...activity }: { options: AkademikOptions } & PanelActivity) {
  const [revision, setRevision] = useState(0);
  const resource = useApiResource<{ items: MapelItem[] }>("/api/admin/akademik/mapel", revision);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editor, setEditor] = useState<{ item: MapelItem | null } | null>(null);
  const [form, setForm] = useState<MapelForm>(EMPTY_FORM);
  const [deleteItem, setDeleteItem] = useState<MapelItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const dirty = editor !== null && JSON.stringify(form) !== JSON.stringify(editor.item ? formFromItem(editor.item) : EMPTY_FORM);
  usePanelActivity(busy, dirty, activity);

  const items = resource.data?.items ?? [];
  const filtered = items.filter((item) => (!category || item.kategori === category) && `${item.kodeMapel} ${item.namaMapel} ${item.pengampu.namaLengkap}`.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id")));

  function openEditor(item: MapelItem | null) {
    setEditor({ item });
    setForm(item ? formFromItem(item) : { ...EMPTY_FORM });
    setFormError(null);
    setSuccess(null);
  }

  function closeEditor() {
    if (!busy && confirmDiscard(dirty)) setEditor(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy) return;
    setFormError(null);
    const kodeMapel = form.kodeMapel.trim().toUpperCase();
    const namaMapel = form.namaMapel.trim();
    if (!/^[A-Z0-9._-]{1,30}$/.test(kodeMapel)) {
      setFormError("Kode wajib diisi (maks. 30 karakter), hanya huruf, angka, titik, garis bawah, dan tanda hubung.");
      return;
    }
    if (namaMapel.length < 2 || namaMapel.length > 120 || !form.pengampuId) {
      setFormError("Isi nama mapel/kitab (2–120 karakter) dan pilih guru pengampu.");
      return;
    }
    if (!form.kkm.trim() || !Number.isInteger(Number(form.kkm)) || Number(form.kkm) < 0 || Number(form.kkm) > 100) {
      setFormError("KKM wajib berupa bilangan bulat antara 0 dan 100.");
      return;
    }
    setBusy(true);
    try {
      const { item } = await apiFetch<{ item: MapelItem }>(editor.item ? `/api/admin/akademik/mapel/${encodeURIComponent(editor.item.id)}` : "/api/admin/akademik/mapel", {
        method: editor.item ? "PATCH" : "POST",
        body: JSON.stringify({ kodeMapel, namaMapel, kategori: form.kategori, kkm: Number(form.kkm), pengampuId: form.pengampuId }),
      });
      setSuccess(`${item.namaMapel} berhasil ${editor.item ? "diperbarui" : "ditambahkan"}.`);
      setEditor(null);
      setRevision((value) => value + 1);
    } catch (error) {
      setFormError(toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteItem || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      await apiFetch<{ deleted: true }>(`/api/admin/akademik/mapel/${encodeURIComponent(deleteItem.id)}`, { method: "DELETE" });
      setSuccess(`${deleteItem.namaMapel} berhasil dihapus.`);
      setDeleteItem(null);
      setRevision((value) => value + 1);
    } catch (error) {
      setDeleteError(error instanceof ApiError && error.status === 409
        ? `${toErrorMessage(error)} Mapel/kitab yang sudah digunakan tidak dapat dihapus. Data nilai tetap dipertahankan.`
        : toErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="Daftar mata pelajaran dan kitab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-lg font-semibold">Mapel & Kitab</h3><p className="mt-1 text-sm text-slate-500">Atur kurikulum, guru pengampu, dan Kriteria Ketuntasan Minimal (KKM).</p></div>
        <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={busy || resource.loading} onClick={() => { setSuccess(null); setRevision((value) => value + 1); }}><RefreshCw aria-hidden="true" size={15} />Muat ulang</Button><Button size="sm" disabled={busy || !resource.data || options.guru.length === 0} onClick={() => openEditor(null)}><Plus aria-hidden="true" size={16} />Tambah mapel / kitab</Button></div>
      </div>
      {success ? <Alert tone="emerald" title="Berhasil">{success}</Alert> : null}
      {options.guru.length === 0 ? <Alert tone="amber" title="Belum ada guru pengampu">Penambahan mapel memerlukan data guru. Minta Bendahara melengkapi direktori guru di Data Induk, lalu muat ulang halaman ini.</Alert> : null}
      <Card className="overflow-hidden">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_260px]">
          <label className="relative block"><span className="sr-only">Cari kode, nama mapel, atau pengampu</span><Search aria-hidden="true" size={17} className="absolute left-3 top-3 text-slate-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode, nama mapel, atau pengampu…" className={`${inputClass} pl-10`} /></label>
          <label><span className="sr-only">Filter kategori mapel</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}><option value="">Semua kategori</option>{Object.entries(KATEGORI_MAPEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>
        {resource.loading ? <LoadingState label="Memuat mapel dan kitab…" /> : resource.error ? <div className="p-4"><ErrorBanner message={resource.error} onRetry={() => setRevision((value) => value + 1)} /></div> : !items.length ? <div className="p-4"><EmptyState icon={BookOpen} title="Belum ada mapel atau kitab" description="Tambahkan mata pelajaran pertama untuk mulai menginput nilai santri." /></div> : !filtered.length ? <div className="p-4"><EmptyState title="Tidak ada hasil pencarian" description="Coba kata kunci lain atau tampilkan semua kategori." action={<Button variant="secondary" size="sm" onClick={() => { setSearch(""); setCategory(""); }}>Reset pencarian</Button>} /></div> : <>
          <div className="overflow-x-auto"><table className="w-full min-w-[760px]"><caption className="sr-only">Daftar mapel dan kitab beserta kategori, KKM, dan guru pengampu</caption><thead className="bg-slate-50"><tr>{["Kode", "Mapel / Kitab", "Kategori", "KKM", "Pengampu", "Tindakan"].map((label) => <th scope="col" key={label} className={tableHeadClass}>{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((item) => <tr key={item.id} className="hover:bg-slate-50/70">
            <td className={`${tableCellClass} font-mono text-xs`}>{item.kodeMapel}</td><td className={`${tableCellClass} font-semibold text-slate-900`}>{item.namaMapel}</td><td className={tableCellClass}><Badge tone={item.kategori === "SEKOLAH_FORMAL" ? "blue" : item.kategori === "TAHFIDZ" ? "emerald" : "amber"}>{KATEGORI_MAPEL_LABEL[item.kategori]}</Badge></td><td className={`${tableCellClass} font-semibold tabular-nums`}>{item.kkm}</td><td className={tableCellClass}>{item.pengampu.namaLengkap}</td><td className={tableCellClass}><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={busy} aria-label={`Edit ${item.namaMapel}`} onClick={() => openEditor(item)}><Pencil aria-hidden="true" size={14} />Edit</Button><Button variant="ghost" size="sm" className="text-rose-600 hover:bg-rose-50" disabled={busy} aria-label={`Hapus ${item.namaMapel}`} onClick={() => { setDeleteItem(item); setDeleteError(null); setSuccess(null); }}><Trash2 aria-hidden="true" size={14} />Hapus</Button></div></td>
          </tr>)}</tbody></table></div><p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Menampilkan {filtered.length} dari {items.length} mapel / kitab.</p>
        </>}
      </Card>
      <Modal open={editor !== null} onClose={closeEditor} title={editor?.item ? "Edit mapel / kitab" : "Tambah mapel / kitab"} description="Semua kolom wajib diisi. KKM digunakan untuk menentukan ketuntasan, terpisah dari predikat.">
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          {formError ? <ErrorBanner title="Mapel belum tersimpan" message={formError} /> : null}
          <fieldset disabled={busy} className="space-y-4">
            <Field label="Kode mapel / kitab" hint="Maks. 30 karakter: huruf, angka, titik, garis bawah, atau tanda hubung."><input autoFocus required maxLength={30} pattern="[a-zA-Z0-9._\-]+" value={form.kodeMapel} onChange={(event) => setForm({ ...form, kodeMapel: event.target.value })} className={`${inputClass} uppercase`} placeholder="Contoh: FIQIH-01" /></Field>
            <Field label="Nama mapel / kitab"><input required minLength={2} maxLength={120} value={form.namaMapel} onChange={(event) => setForm({ ...form, namaMapel: event.target.value })} className={inputClass} placeholder="Contoh: Fiqih / Fathul Qarib" /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Kategori"><select required value={form.kategori} onChange={(event) => setForm({ ...form, kategori: event.target.value as KategoriMapel })} className={inputClass}>{Object.entries(KATEGORI_MAPEL_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field><Field label="KKM (0–100)"><input required type="number" min={0} max={100} step={1} value={form.kkm} onChange={(event) => setForm({ ...form, kkm: event.target.value })} className={inputClass} /></Field></div>
            <Field label="Guru pengampu"><select required value={form.pengampuId} onChange={(event) => setForm({ ...form, pengampuId: event.target.value })} className={inputClass}><option value="">Pilih guru / ustadz</option>{editor?.item && !options.guru.some((guru) => guru.id === editor.item?.pengampuId) ? <option value={editor.item.pengampuId}>{editor.item.pengampu.namaLengkap} (pengampu saat ini)</option> : null}{options.guru.map((guru) => <option key={guru.id} value={guru.id}>{guru.namaLengkap}</option>)}</select></Field>
          </fieldset>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button variant="secondary" disabled={busy} onClick={closeEditor}>Batal</Button><Button type="submit" loading={busy}>Simpan mapel</Button></div>
        </form>
      </Modal>
      <Modal open={deleteItem !== null} onClose={() => { if (!busy) setDeleteItem(null); }} title="Hapus mapel / kitab?" description={deleteItem ? `${deleteItem.kodeMapel} · ${deleteItem.namaMapel}` : undefined} footer={<div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setDeleteItem(null)}>Batal</Button><Button variant="danger" loading={busy} onClick={() => void remove()}>Ya, hapus</Button></div>}>
        <p className="text-sm leading-6 text-slate-600">Tindakan ini tidak dapat dibatalkan. Mapel yang sudah digunakan dalam penilaian tidak dapat dihapus.</p>
        {deleteError ? <ErrorBanner className="mt-4" title="Mapel tidak dapat dihapus" message={deleteError} /> : null}
      </Modal>
    </section>
  );
}
