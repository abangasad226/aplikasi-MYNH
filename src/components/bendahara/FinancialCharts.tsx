"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { apiFetch, toErrorMessage } from "@/lib/client-api";

type Range = "BULAN_INI" | "ENAM_BULAN" | "TAHUN_AJARAN";
type GrafikData = {
  months: Array<{ label: string; income: string; expense: string }>;
  incomeComposition: Array<{ name: string; value: string; key: string }>;
  billingStatus: Array<{ name: string; value: string }>;
};

const RANGE_OPTIONS: Array<{ value: Range; label: string }> = [
  { value: "BULAN_INI", label: "Bulan Ini" },
  { value: "ENAM_BULAN", label: "6 Bulan Terakhir" },
  { value: "TAHUN_AJARAN", label: "Tahun Ajaran Berjalan" },
];
const COLORS = ["#059669", "#0f766e", "#f59e0b", "#3b82f6"];
const BILL_COLORS = ["#059669", "#f59e0b"];
const RUPIAH = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const formatRupiah = (value: number | string) => RUPIAH.format(Number(value) || 0);

export function FinancialCharts() {
  const [range, setRange] = useState<Range>("ENAM_BULAN");
  const [data, setData] = useState<GrafikData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<GrafikData>(`/api/bendahara/statistik-grafik?range=${range}`)
      .then((result) => {
        if (active) {
          setData(result);
          setError("");
        }
      })
      .catch((err: unknown) => {
        if (active) setError(toErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [range]);

  const chartData = (data?.months ?? []).map((item) => ({
    ...item,
    income: Number(item.income),
    expense: Number(item.expense),
  }));
  const incomeData = (data?.incomeComposition ?? []).map((item) => ({
    ...item,
    value: Number(item.value),
  }));
  const billingData = (data?.billingStatus ?? []).map((item) => ({
    ...item,
    value: Number(item.value),
  }));

  return (
    <section className="space-y-4" aria-labelledby="financial-charts-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="financial-charts-title" className="text-xl font-bold tracking-tight text-slate-900">Visualisasi Keuangan</h2>
          <p className="mt-1 text-sm text-slate-500">Arus kas, komposisi pemasukan, dan pelunasan tagihan.</p>
        </div>
        <label className="text-xs font-semibold text-slate-600">
          Rentang waktu
          <select value={range} onChange={(event) => setRange(event.target.value as Range)} className="ml-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
            {RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Grafik gagal dimuat: {error}</p> : null}
      {loading && !data ? <div className="grid gap-4 lg:grid-cols-2"><div className="h-80 animate-pulse rounded-2xl bg-slate-100" /><div className="h-80 animate-pulse rounded-2xl bg-slate-100" /></div> : null}

      {data ? <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-sm font-bold text-slate-900">Arus Kas Bulanan</h3>
          <p className="mt-1 text-xs text-slate-500">Pemasukan dibandingkan dengan pengeluaran tercatat.</p>
          <div className="mt-4 h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(value: number) => `${Math.round(value / 1000000)} jt`} width={48} />
                <Tooltip formatter={(value) => formatRupiah(value as number | string)} />
                <Legend />
                <Bar dataKey="income" name="Total Pemasukan" fill="#059669" radius={[5, 5, 0, 0]} />
                <Bar dataKey="expense" name="Total Pengeluaran" fill="#f59e0b" radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-bold text-slate-900">Komposisi Pemasukan</h3>
            <p className="mt-1 text-xs text-slate-500">Berdasarkan kategori transaksi pada rentang terpilih.</p>
            <div className="mt-3 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={incomeData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3}>
                    {incomeData.map((entry, index) => <Cell key={entry.key} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatRupiah(value as number | string)} />
                  <Legend verticalAlign="bottom" height={30} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="text-sm font-bold text-slate-900">Rasio Pelunasan Tagihan</h3>
            <p className="mt-1 text-xs text-slate-500">Tagihan bulan berjalan berdasarkan nominal yang sudah dan belum dibayar.</p>
            <div className="mt-3 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={billingData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={3}>
                    {billingData.map((entry, index) => <Cell key={entry.name} fill={BILL_COLORS[index % BILL_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatRupiah(value as number | string)} />
                  <Legend verticalAlign="bottom" height={30} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </article>
        </div>
      </div> : null}
      <p className="text-[11px] text-slate-400">Pengeluaran yang tampil bersumber dari transaksi penarikan tunai di ledger. Pengeluaran operasional pondok belum memiliki tabel pencatatan tersendiri.</p>
    </section>
  );
}
