"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import { formatRupiah } from "@/lib/format";

type Item = { id: string; jenisTarget: string; nominalLama: string; nominalBaru: string; selisih: string; alasanWajib: string; createdAt: string; diubahOleh: { name: string } };
export function PenyesuaianList({ santriId }: { santriId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let active = true;
    apiFetch<{ items: Item[] }>(`/api/wali/penyesuaian?santriId=${encodeURIComponent(santriId)}`)
      .then((result) => { if (active) setItems(result.items); })
      .catch(() => { if (active) setItems([]); });
    return () => { active = false; };
  }, [santriId]);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Riwayat penyesuaian keuangan</h2><p className="mt-1 text-sm text-slate-500">Catatan perubahan nominal tagihan dan pengembalian saldo oleh Bendahara.</p>{items.length ? <ul className="mt-3 divide-y divide-slate-100">{items.map((item) => <li key={item.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{item.jenisTarget === "TAGIHAN" ? "Penyesuaian tagihan" : "Penyesuaian pengembalian"}</strong><time className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString("id-ID")}</time></div><p className="mt-1">{formatRupiah(item.nominalLama)} → {formatRupiah(item.nominalBaru)} ({formatRupiah(item.selisih)})</p><p className="mt-1 text-slate-700">Alasan: {item.alasanWajib}</p><p className="text-xs text-slate-500">Diubah oleh {item.diubahOleh.name}</p></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">Belum ada penyesuaian.</p>}</section>;
}
