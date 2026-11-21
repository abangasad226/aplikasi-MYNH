"use client";

import { useEffect, useState } from "react";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { formatRupiah } from "@/lib/format";

type TargetKind = "TAGIHAN" | "REVERSAL_JAJAN";
type AuditItem = { id: string; jenisTarget: TargetKind; nominalLama: string; nominalBaru: string; selisih: string; alasanWajib: string; createdAt: string; diubahOleh: { name: string }; santri: { name: string; nis: string } };
type TargetInfo = { id: string; nominalTagihan?: string; nominalTerbayar?: string; nominal?: string; santri: { name: string; nis: string } };

export function PenyesuaianPanel() {
  const [jenisTarget, setJenisTarget] = useState<TargetKind>("TAGIHAN");
  const [targetId, setTargetId] = useState("");
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [nominalBaru, setNominalBaru] = useState("");
  const [alasan, setAlasan] = useState("");
  const [items, setItems] = useState<AuditItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadItems() {
    try {
      const result = await apiFetch<{ items: AuditItem[] }>("/api/bendahara/penyesuaian");
      setItems(result.items);
    } catch (caught) { setError(toErrorMessage(caught)); }
  }
  useEffect(() => { void loadItems(); }, []);

  async function loadTarget() {
    setError(null); setTarget(null);
    try {
      const query = new URLSearchParams({ targetId: targetId.trim(), jenisTarget });
      const result = await apiFetch<{ target: TargetInfo }>(`/api/bendahara/penyesuaian?${query}`);
      setTarget(result.target);
      setNominalBaru(result.target.nominalTagihan ?? result.target.nominal ?? "");
    } catch (caught) { setError(toErrorMessage(caught)); }
  }

  async function save() {
    if (!target || !alasan.trim()) { setError("Muat target dan isi alasan penyesuaian."); return; }
    setBusy(true); setError(null);
    try {
      await apiFetch("/api/bendahara/penyesuaian", { method: "POST", body: JSON.stringify({ targetId: target.id, jenisTarget, nominalBaru, alasan }) });
      setTarget(null); setTargetId(""); setAlasan("");
      await loadItems();
    } catch (caught) { setError(toErrorMessage(caught)); }
    finally { setBusy(false); }
  }

  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div><h2 className="text-lg font-semibold text-slate-900">Penyesuaian nominal keuangan</h2><p className="text-sm text-slate-500">Penyesuaian tagihan dan reversal memerlukan alasan dan dicatat dalam audit.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-slate-600">Jenis target<select className="mt-1 block w-full rounded-lg border border-slate-300 p-2" value={jenisTarget} onChange={(event) => { setJenisTarget(event.target.value as TargetKind); setTarget(null); }}><option value="TAGIHAN">Tagihan SPP / Infaq</option><option value="REVERSAL_JAJAN">Reversal ke saldo jajan</option></select></label>
      <label className="text-xs font-semibold text-slate-600">ID target<input className="mt-1 block w-full rounded-lg border border-slate-300 p-2 font-mono" value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="ID tagihan atau transaksi" /></label>
    </div>
    <button type="button" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white" onClick={() => void loadTarget()} disabled={!targetId.trim()}>Muat target</button>
    {target ? <div className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-3"><div className="text-sm">{target.santri.name}<span className="block text-xs text-slate-500">NIS {target.santri.nis}</span></div><label className="text-xs font-semibold">Nominal awal (read-only)<input readOnly className="mt-1 block w-full rounded-lg border bg-slate-100 p-2" value={formatRupiah(target.nominalTagihan ?? target.nominal ?? "0")} /></label><label className="text-xs font-semibold">Nominal baru (Rp)<input inputMode="numeric" className="mt-1 block w-full rounded-lg border p-2" value={nominalBaru} onChange={(event) => setNominalBaru(event.target.value.replace(/\D/g, ""))} /></label><label className="text-xs font-semibold sm:col-span-3">Alasan wajib<textarea required minLength={5} className="mt-1 block w-full rounded-lg border p-2" value={alasan} onChange={(event) => setAlasan(event.target.value)} placeholder="Contoh: beasiswa pengurus" /></label><button type="button" disabled={busy || !alasan.trim()} onClick={() => void save()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Menyimpan…" : "Simpan penyesuaian"}</button></div> : null}
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="p-2">Waktu</th><th className="p-2">Santri</th><th className="p-2">Target</th><th className="p-2">Lama → baru</th><th className="p-2">Alasan</th><th className="p-2">Bendahara</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-b"><td className="p-2">{new Date(item.createdAt).toLocaleString("id-ID")}</td><td className="p-2">{item.santri.name} ({item.santri.nis})</td><td className="p-2">{item.jenisTarget}</td><td className="p-2">{formatRupiah(item.nominalLama)} → {formatRupiah(item.nominalBaru)}</td><td className="p-2">{item.alasanWajib}</td><td className="p-2">{item.diubahOleh.name}</td></tr>)}</tbody></table></div>
  </section>;
}
