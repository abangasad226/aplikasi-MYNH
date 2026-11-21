"use client";

import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button, ErrorBanner, Skeleton } from "@/components/ui";
import { RaporDocument } from "@/components/rapor-document";
import type { RaporDetail } from "@/lib/akademik-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import "./rapor.css";

export default function RaporPage({ params }: { params: { id: string } }) {
  const [rapor, setRapor] = useState<RaporDetail | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setRapor(null);
    setError("");
    apiFetch<{ item: RaporDetail }>(`/api/rapor/${encodeURIComponent(params.id)}`, { signal: controller.signal })
      .then(({ item }) => { if (!controller.signal.aborted) { setRapor(item); document.title = `Rapor ${item.isi.santri.name} - ${item.semester} ${item.tahunAjaran}`; } })
      .catch((err) => { if (!controller.signal.aborted) setError(toErrorMessage(err)); });
    return () => controller.abort();
  }, [params.id, reload]);
  return <main className="rapor-page min-h-screen bg-slate-100 px-3 py-6 sm:px-6">
    <div className="rapor-toolbar mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
      <div><h1 className="font-bold">Rapor Semester Santri</h1><p className="text-xs text-slate-600">Pilih “Simpan sebagai PDF” pada dialog cetak untuk mengunduh rapor.</p></div>
      <Button onClick={() => window.print()} disabled={!rapor}><Printer size={16} />Cetak / Simpan PDF</Button>
    </div>
    {error ? <div className="mx-auto max-w-[210mm]"><ErrorBanner message={error} /><Button variant="secondary" onClick={() => setReload((v) => v + 1)} className="mt-3"><RefreshCw size={16} />Coba lagi</Button></div> : rapor ? <RaporDocument rapor={rapor} /> : <Skeleton className="mx-auto h-96 max-w-[210mm]" />}
  </main>;
}
