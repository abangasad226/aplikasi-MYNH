"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { formatRupiah } from "@/lib/format";

type Bill = { id: string; santri: { id: string; name: string; nis: string; kelas: string }; jenisTagihan: string; bulan: number; tahun: number; nominalAwal: string; nominalAkhir: string; nominalTerbayar: string; status: string; jatuhTempo: string };
type Audit = { id: string; targetId: string; nominalLama: string; nominalBaru: string; alasanWajib: string; createdAt: string; diubahOleh: { name: string } };
type Recipient = { id: string; name: string; nis: string; kelas: string; phone: string | null; sentToday: boolean; bills: Array<{ name: string; bulan: number; tahun: number; sisa: string }> };
type NewBillOptions = { students: Array<{ id: string; name: string; nis: string; kelas: string }>; classes: string[] };
const idr = (amount: string | number) => formatRupiah(String(amount));
function phone62(raw: string) { let digits = raw.replace(/\D/g, ""); if (digits.startsWith("0")) digits = `62${digits.slice(1)}`; else if (digits.startsWith("8")) digits = `62${digits}`; return digits; }

export function TagihanPanel() {
  const [items, setItems] = useState<Bill[]>([]);
  const [editing, setEditing] = useState<Bill | null>(null);
  const [creating, setCreating] = useState(false);
  const [nominalBaru, setNominalBaru] = useState("");
  const [alasan, setAlasan] = useState("");
  const [audit, setAudit] = useState<Audit[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [options, setOptions] = useState<NewBillOptions>({ students: [], classes: [] });
  const [name, setName] = useState(""); const [amount, setAmount] = useState(""); const [due, setDue] = useState(""); const [description, setDescription] = useState(""); const [target, setTarget] = useState("SEMUA"); const [className, setClassName] = useState(""); const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [billData, reminderData] = await Promise.all([apiFetch<{ items: Bill[] }>("/api/bendahara/tagihan?limit=100"), apiFetch<{ items: Recipient[] }>("/api/bendahara/pengingat-wa")]);
      setItems(billData.items); setRecipients(reminderData.items);
    } catch (caught) { setError(toErrorMessage(caught)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const openCreate = async () => { setError(null); setCreating(true); try { setOptions(await apiFetch<NewBillOptions>("/api/bendahara/jenis-pembayaran")); } catch (caught) { setError(toErrorMessage(caught)); } };
  const openEdit = async (bill: Bill) => {
    setEditing(bill); setNominalBaru(bill.nominalAkhir); setAlasan(""); setError(null); setAudit([]);
    try { const result = await apiFetch<{ items: Audit[] }>(`/api/bendahara/penyesuaian?santriId=${encodeURIComponent(bill.santri.id)}`); setAudit(result.items.filter((row) => row.targetId === bill.id)); } catch { setAudit([]); }
  };
  const save = async () => {
    if (!editing || !alasan.trim()) { setError("Alasan penyesuaian wajib diisi."); return; }
    setBusy(true); setError(null);
    try { await apiFetch("/api/bendahara/penyesuaian", { method: "POST", body: JSON.stringify({ targetId: editing.id, jenisTarget: "TAGIHAN", nominalBaru, alasan }) }); await load(); setEditing(null); }
    catch (caught) { setError(toErrorMessage(caught)); } finally { setBusy(false); }
  };
  const issueBill = async () => {
    setError(null); setBusy(true);
    try {
      await apiFetch("/api/bendahara/jenis-pembayaran", { method: "POST", body: JSON.stringify({ nama: name, nominal: amount, jatuhTempo: due, target, kelas: target === "KELAS" ? className : undefined, santriIds: target === "PILIH" ? selected : undefined, keterangan: description || undefined }) });
      setCreating(false); setName(""); setAmount(""); setDue(""); setDescription(""); setSelected([]); await load();
    } catch (caught) { setError(toErrorMessage(caught)); } finally { setBusy(false); }
  };
  const reminderText = (student: Recipient) => {
    const details = student.bills.map((bill) => `• ${bill.name} (${bill.bulan}/${bill.tahun}): ${idr(bill.sisa)}`).join("\n");
    const total = student.bills.reduce((sum, bill) => sum + Number(bill.sisa), 0);
    return `Assalamu'alaikum warahmatullahi wabarakatuh.\n\nYth. Bapak/Ibu wali santri ${student.name} (NIS ${student.nis}), kami sampaikan bahwa masih terdapat tagihan yang belum lunas:\n${details}\n\nTotal tunggakan: ${idr(total)}. Mohon berkenan melakukan konfirmasi/pembayaran kepada Bendahara. Jika pembayaran telah dilakukan, pesan ini dapat diabaikan.\n\nTerima kasih atas perhatian dan kerja samanya.\nBendahara Pondok Pesantren Nurul Huda Pangauban.\nWassalamu'alaikum warahmatullahi wabarakatuh.`;
  };
  const sendReminder = async (student: Recipient) => {
    const phone = student.phone ? phone62(student.phone) : "";
    if (!phone) { setError(`Nomor HP wali ${student.name} tidak tersedia.`); return; }
    const popup = window.open(`https://wa.me/${phone}?text=${encodeURIComponent(reminderText(student))}`, "_blank", "noopener,noreferrer");
    if (!popup) { setError("Browser memblokir jendela WhatsApp. Izinkan pop-up lalu coba lagi."); return; }
    try { await apiFetch("/api/bendahara/pengingat-wa", { method: "POST", body: JSON.stringify({ santriId: student.id }) }); await load(); }
    catch (caught) { setError(toErrorMessage(caught)); }
  };
  const copyReminder = async (student: Recipient) => { try { await navigator.clipboard.writeText(reminderText(student)); setError(`Teks tagihan ${student.name} berhasil disalin.`); } catch { setError("Tidak dapat menyalin teks tagihan pada browser ini."); } };

  return <section className="space-y-6">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="text-lg font-semibold">Daftar Tagihan Santri</h2><p className="text-sm text-slate-500">Nominal akhir memperhitungkan penyesuaian Bendahara.</p></div><button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => void openCreate()}>+ Buat Jenis Pembayaran / Tagihan Baru</button></div>
      {error && !editing && !creating ? <p className="p-4 text-sm text-rose-700">{error}</p> : null}
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Santri", "Kelas", "Jenis tagihan", "Nominal awal", "Nominal akhir", "Terbayar", "Status", "Aksi"].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody>{items.map((bill) => <tr key={bill.id} className="border-t"><td className="px-4 py-3"><Link className="font-semibold text-emerald-800 hover:underline" href={`/santri/${encodeURIComponent(bill.santri.id)}`}>{bill.santri.name}</Link><span className="block text-xs text-slate-500">{bill.santri.nis}</span></td><td className="px-4 py-3">{bill.santri.kelas}</td><td className="px-4 py-3">{bill.jenisTagihan} · {bill.bulan}/{bill.tahun}</td><td className="px-4 py-3">{idr(bill.nominalAwal)}</td><td className="px-4 py-3 font-semibold">{idr(bill.nominalAkhir)}</td><td className="px-4 py-3">{idr(bill.nominalTerbayar)}</td><td className="px-4 py-3">{bill.status}</td><td className="px-4 py-3"><button className="whitespace-nowrap rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => void openEdit(bill)}>Edit Nominal / Dispensasi</button></td></tr>)}</tbody></table></div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b p-5"><h2 className="text-lg font-semibold">Rekap Tunggakan & Pengingat WhatsApp</h2><p className="text-sm text-slate-500">WhatsApp dibuka dengan teks siap kirim; pengiriman tetap dikonfirmasi oleh petugas.</p></div>{recipients.length === 0 ? <p className="p-5 text-sm text-slate-500">Tidak ada tunggakan aktif.</p> : <div className="divide-y">{recipients.map((student) => { const total = student.bills.reduce((sum, bill) => sum + Number(bill.sisa), 0); return <article key={student.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div className="min-w-0"><p className="font-semibold">{student.name} <span className="font-normal text-slate-500">· {student.kelas} · NIS {student.nis}</span></p><p className="mt-1 text-sm text-slate-600">{student.bills.map((bill) => `${bill.name}: ${idr(bill.sisa)}`).join(" · ")}</p><p className="mt-1 text-sm font-semibold">Total: {idr(total)} · {student.sentToday ? <span className="text-emerald-700">Pengingat diklik hari ini</span> : <span className="text-amber-700">Belum diklik hari ini</span>}</p></div><div className="flex gap-2"><button className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={() => void sendReminder(student)}>Kirim Tagihan WA</button><button className="rounded-lg border px-3 py-2 text-xs font-semibold" onClick={() => void copyReminder(student)}>Salin Teks Tagihan</button></div></article>; })}</div>}</section>
    <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit Nominal / Dispensasi" description={editing ? `${editing.santri.name} · ${editing.jenisTagihan} ${editing.bulan}/${editing.tahun}` : undefined} footer={<div className="flex justify-end gap-2"><button className="rounded-lg border px-4 py-2" onClick={() => setEditing(null)}>Batal</button><button disabled={busy || !alasan.trim()} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={() => void save()}>{busy ? "Menyimpan…" : "Simpan penyesuaian"}</button></div>}>{editing ? <div className="space-y-4"><label className="block text-sm">Nominal awal (read-only)<input readOnly value={idr(editing.nominalAkhir)} className="mt-1 block w-full rounded-lg border bg-slate-100 p-2" /></label><label className="block text-sm">Nominal baru (Rp)<input inputMode="numeric" value={nominalBaru} onChange={(event) => setNominalBaru(event.target.value.replace(/\D/g, ""))} className="mt-1 block w-full rounded-lg border p-2" /></label><label className="block text-sm">Alasan wajib<textarea required minLength={5} value={alasan} onChange={(event) => setAlasan(event.target.value)} className="mt-1 block w-full rounded-lg border p-2" /></label>{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}<div><h3 className="text-sm font-semibold">Riwayat penyesuaian santri</h3>{audit.map((row) => <p key={row.id} className="mt-2 text-xs text-slate-600">{new Date(row.createdAt).toLocaleString("id-ID")} · {idr(row.nominalLama)} → {idr(row.nominalBaru)} · {row.alasanWajib} ({row.diubahOleh.name})</p>)}</div></div> : null}</Modal>
    <Modal open={creating} onClose={() => setCreating(false)} title="Terbitkan Tagihan Insidental" description="Jenis pembayaran baru akan dibuatkan tagihan untuk santri aktif sesuai target." footer={<div className="flex justify-end gap-2"><button className="rounded-lg border px-4 py-2" onClick={() => setCreating(false)}>Batal</button><button disabled={busy} className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={() => void issueBill()}>{busy ? "Menerbitkan…" : "Terbitkan Tagihan"}</button></div>}><div className="max-h-[70vh] space-y-4 overflow-y-auto p-1"><label className="block text-sm">Nama jenis pembayaran<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Biaya ujian semester ganjil 2026/2027" className="mt-1 w-full rounded-lg border p-2" /></label><label className="block text-sm">Nominal tagihan (Rp)<input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label><label className="block text-sm">Batas waktu / jatuh tempo<input type="date" value={due} onChange={(event) => setDue(event.target.value)} className="mt-1 w-full rounded-lg border p-2" /></label><label className="block text-sm">Target penerima<select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="SEMUA">Semua santri aktif</option><option value="KELAS">Per kelas / tingkatan</option><option value="PILIH">Pilih santri tertentu</option></select></label>{target === "KELAS" ? <label className="block text-sm">Kelas<select value={className} onChange={(event) => setClassName(event.target.value)} className="mt-1 w-full rounded-lg border p-2"><option value="">Pilih kelas</option>{options.classes.map((value) => <option key={value}>{value}</option>)}</select></label> : null}{target === "PILIH" ? <fieldset className="max-h-48 space-y-2 overflow-auto rounded-lg border p-3"><legend className="px-1 text-sm">Pilih santri aktif</legend>{options.students.map((student) => <label key={student.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(student.id)} onChange={(event) => setSelected((prev) => event.target.checked ? [...prev, student.id] : prev.filter((id) => id !== student.id))} />{student.name} · {student.nis} · {student.kelas}</label>)}</fieldset> : null}<label className="block text-sm">Keterangan tambahan (opsional)<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border p-2" /></label>{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}</div></Modal>
  </section>;
}
