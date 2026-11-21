"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Badge, Button, Card, ErrorBanner, Skeleton } from "@/components/ui";
import type { RaporSummary } from "@/lib/akademik-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";

export function RaporCard({ santriId }: { santriId: string }) {
  const [items, setItems] = useState<RaporSummary[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setItems(null);
    setError("");
    apiFetch<{ items: RaporSummary[] }>(`/api/wali/rapor?santriId=${encodeURIComponent(santriId)}`, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setItems(data.items); })
      .catch((err) => { if (!controller.signal.aborted) setError(toErrorMessage(err)); });
    return () => controller.abort();
  }, [santriId, reload]);
  return <Card className="p-5">
    <h2 className="flex items-center gap-2 text-base font-bold"><FileText size={18} className="text-emerald-600" />Lihat &amp; Unduh Rapor Semester</h2>
    <p className="mt-1 text-xs text-slate-500">Rapor resmi yang sudah diterbitkan oleh pengurus atau wali kelas.</p>
    {error ? <div className="mt-4"><ErrorBanner message={error} /><Button variant="secondary" size="sm" onClick={() => setReload((v) => v + 1)} className="mt-2">Coba lagi</Button></div> : !items ? <Skeleton className="mt-4 h-16" /> : !items.length ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada rapor semester yang diterbitkan.</p> : <ul className="mt-4 space-y-3">{items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="text-sm font-semibold">Semester {item.semester === "GANJIL" ? "Ganjil" : "Genap"} · {item.tahunAjaran}</p><Badge tone="emerald">Diterbitkan</Badge></div><Link href={`/rapor/${item.id}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Lihat / Unduh PDF</Link></li>)}</ul>}
  </Card>;
}
