"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BookOpen, ClipboardList, GraduationCap, Landmark, LogOut, Users, WalletCards } from "lucide-react";
import { PesantrenLogo } from "@/components/pesantren-logo";
import { Alert, Avatar, Button, ErrorBanner, cn } from "@/components/ui";
import type { AkademikOptions } from "@/lib/akademik-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { LoadingState, confirmDiscard, useApiResource } from "./akademik-ui";
import { MapelPanel } from "./mapel-panel";
import { NilaiPanel } from "./nilai-panel";
import { RaporPanel } from "./rapor-panel";

const TABS = [
  { key: "MAPEL", label: "Mapel & Kitab", icon: BookOpen },
  { key: "NILAI", label: "Input Nilai Massal", icon: ClipboardList },
  { key: "RAPOR", label: "Rekap Absensi & Cetak Rapor", icon: GraduationCap },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function AdminAkademikPage() {
  const router = useRouter();
  const [revision, setRevision] = useState(0);
  const options = useApiResource<AkademikOptions>("/api/admin/akademik/opsi", revision);
  const [tab, setTab] = useState<Tab>("MAPEL");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const actor = options.data?.actor;
  const allowed = actor?.role === "USTADZ_PENGURUS";
  const activity = { onBusyChange: setBusy, onDirtyChange: setDirty };

  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);

  function selectTab(next: Tab) {
    if (busy || loggingOut || next === tab || !confirmDiscard(dirty)) return;
    setDirty(false);
    setTab(next);
  }

  async function logout() {
    if (busy || loggingOut || !confirmDiscard(dirty)) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
      setDirty(false);
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setLogoutError(toErrorMessage(error));
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <PesantrenLogo />
            <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">MyNurulHuda</p><h1 className="text-sm font-bold tracking-tight sm:text-base">Pondok Pesantren Nurul Huda Pangauban</h1></div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <nav aria-label="Navigasi administrasi" className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              <span aria-current="page" className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm">Dashboard Akademik</span>
            </nav>
            {actor ? <div className="flex min-w-0 items-center gap-3"><Avatar name={actor.name} /><div className="min-w-0"><p className="max-w-48 truncate text-sm font-semibold" title={actor.name}>{actor.name}</p><p className="text-xs text-slate-500">{actor.role === "BENDAHARA" ? "Bendahara" : actor.role === "USTADZ_PENGURUS" ? "Ustadz Pengurus" : "Akses tidak diizinkan"}</p></div></div> : null}
            <Button variant="ghost" size="sm" disabled={busy} loading={loggingOut} onClick={() => void logout()}><LogOut aria-hidden="true" size={16} />Keluar</Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {logoutError ? <ErrorBanner title="Gagal keluar" message={logoutError} /> : null}
        {options.loading ? <LoadingState label="Memeriksa akses dan memuat pilihan akademik…" /> : null}
        {options.error ? <ErrorBanner title="Halaman akademik tidak dapat dimuat" message={options.error} onRetry={() => setRevision((value) => value + 1)} /> : null}
        {options.data && !allowed ? <Alert tone="rose" title="Akses terbatas">Halaman ini hanya dapat diakses oleh Bendahara dan Ustadz Pengurus. Silakan keluar dan gunakan akun yang sesuai.</Alert> : null}
        {allowed && options.data ? <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><h2 className="text-xl font-bold tracking-tight">Pembelajaran, penilaian & rapor</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">Kelola mata pelajaran dan kitab, input nilai per kelas, lalu rangkum perkembangan santri dalam rapor semester.</p></div>
            <span className="text-xs font-medium text-slate-500">{busy ? "Menyimpan perubahan…" : dirty ? "Ada perubahan belum disimpan" : "Portal akademik staf"}</span>
          </div>
          <div role="tablist" aria-label="Pengelolaan akademik" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {TABS.map(({ key, label, icon: Icon }, index) => (
              <button key={key} id={`tab-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls={`panel-${key}`} tabIndex={tab === key ? 0 : -1} disabled={busy || loggingOut} onClick={() => selectTab(key)} onKeyDown={(event) => {
                let nextIndex: number;
                if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
                else if (event.key === "ArrowLeft") nextIndex = (index + TABS.length - 1) % TABS.length;
                else if (event.key === "Home") nextIndex = 0;
                else if (event.key === "End") nextIndex = TABS.length - 1;
                else return;
                event.preventDefault();
                document.getElementById(`tab-${TABS[nextIndex].key}`)?.focus();
                selectTab(TABS[nextIndex].key);
              }} className={cn("inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60", tab === key ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100")}><Icon aria-hidden="true" size={17} />{label}</button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            <fieldset disabled={loggingOut} className="min-w-0">
              <legend className="sr-only">{TABS.find((item) => item.key === tab)?.label}</legend>
              {tab === "MAPEL" ? <MapelPanel options={options.data} {...activity} /> : null}
              {tab === "NILAI" ? <NilaiPanel options={options.data} {...activity} /> : null}
              {tab === "RAPOR" ? <RaporPanel options={options.data} {...activity} /> : null}
            </fieldset>
          </div>
          <footer className="border-t border-slate-200 pt-4 text-xs leading-5 text-slate-400">Rapor DRAFT tidak ditampilkan kepada wali santri. Penerbitan mengunci nilai dan catatan sampai rapor ditarik kembali ke draft.</footer>
        </> : null}
      </main>
    </div>
  );
}
