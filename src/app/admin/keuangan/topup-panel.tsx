"use client";

import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { formatRupiah } from "@/lib/format";

type Student = { id: string; name: string; nis: string; kelas: string; saldoJajan: string };
type TopupResponse = { santri: Student; saldoJajanAkhir: string; transaksi: { kodeTransaksi: string } };

export function TopupPanel() {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      apiFetch<{ items: Student[] }>(`/api/bendahara/topup${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`)
        .then((result) => { if (active) setStudents(result.items); })
        .catch((caught) => { if (active) setError(toErrorMessage(caught)); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  async function submit() {
    if (!studentId || !amount || BigInt(amount) <= 0n) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await apiFetch<TopupResponse>("/api/bendahara/topup", { method: "POST", body: JSON.stringify({ santriId: studentId, nominal: amount }) });
      setMessage(`Top-up Rp${Number(amount).toLocaleString("id-ID")} berhasil. Saldo baru ${formatRupiah(result.saldoJajanAkhir)} · Ref ${result.transaksi.kodeTransaksi}.`);
      setAmount("");
      setStudents((current) => current.map((student) => student.id === studentId ? { ...student, saldoJajan: result.saldoJajanAkhir } : student));
    } catch (caught) { setError(toErrorMessage(caught)); }
    finally { setBusy(false); }
  }

  const selected = students.find((student) => student.id === studentId);
  return <Card className="border-emerald-200 p-5 sm:p-6">
    <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Banknote aria-hidden="true" size={20} /></span><div><h2 className="font-semibold text-slate-900">Top-up Tunai Saldo Jajan</h2><p className="mt-1 text-sm text-slate-500">Bendahara menerima uang cash dan menambahkan nominal langsung ke saldo kartu santri. Top-up ini tidak mengubah limit belanja harian dan tercatat sebagai transaksi keuangan.</p></div></div>
    <div className="mt-5 grid gap-4 md:grid-cols-3"><label className="block text-sm font-medium text-slate-700">Cari santri<input value={query} onChange={(event) => { setQuery(event.target.value); setStudentId(""); }} placeholder="Nama atau NIS" className="mt-1.5 w-full rounded-xl border border-slate-300 p-3" /><span className="mt-1 block text-xs font-normal text-slate-500">{loading ? "Mencari…" : `${students.length} santri ditampilkan`}</span></label><label className="block text-sm font-medium text-slate-700">Pilih santri<select value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 p-3"><option value="">Pilih santri aktif</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.nis} · {student.kelas}</option>)}</select>{selected ? <span className="mt-1 block text-xs font-normal text-slate-500">Saldo sekarang {formatRupiah(selected.saldoJajan)}</span> : null}</label><label className="block text-sm font-medium text-slate-700">Nominal cash (Rp)<input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, ""))} placeholder="Contoh: 20000" className="mt-1.5 w-full rounded-xl border border-slate-300 p-3" /></label></div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><Button loading={busy} disabled={!studentId || !amount || BigInt(amount || "0") <= 0n} onClick={() => void submit()}><Banknote aria-hidden="true" size={16} />Simpan Top-up</Button>{message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}{error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}</div>
  </Card>;
}
