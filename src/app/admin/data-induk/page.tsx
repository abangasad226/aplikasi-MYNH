"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Briefcase,
  GraduationCap,
  Landmark,
  LogOut,
  Users,
  WalletCards,
} from "lucide-react";

import { Avatar, Skeleton, cn } from "@/components/ui";
import { PesantrenLogo } from "@/components/pesantren-logo";
import type { LoginResponse, RoleName } from "@/lib/api-types";
import { ApiError, apiFetch } from "@/lib/client-api";

import { GuruDirectory } from "./guru-directory";
import { SantriDirectory } from "./santri-directory";

type TabKey = "AKTIF" | "ALUMNI" | "GURU";

const ROLE_LABEL: Record<RoleName, string> = {
  BENDAHARA: "Bendahara",
  OPERATOR: "Operator",
  KASIR_KANTIN: "Kasir Kantin",
  USTADZ_PENGURUS: "Ustadz Pengurus",
  WALI_SANTRI: "Wali Santri",
};

const TABS = [
  { key: "AKTIF", label: "Data Santri Aktif", icon: Users },
  { key: "ALUMNI", label: "Data Alumni", icon: GraduationCap },
  { key: "GURU", label: "Data Guru & Ustadz", icon: Briefcase },
] as const;

export default function AdminDataIndukPage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("AKTIF");
  const [actor, setActor] = useState<LoginResponse["user"] | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let active = true;

    apiFetch<LoginResponse>("/api/auth/session")
      .then((response) => {
        if (active) {
          setActor(response.user);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login?next=/admin/data-induk");
        }
      })
      .finally(() => {
        if (active) {
          setSessionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Arahkan tetap ke login walau sesi server sudah tidak valid.
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const canOpenKeuangan = false;
  const canOpenAkademik = false;
  const canRefund = false;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              aria-label="Kembali ke beranda"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm transition hover:bg-emerald-700"
            >
              <PesantrenLogo />
            </Link>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                MyNurulHuda
              </p>
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                Pondok Pesantren Nurul Huda Pangauban
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {canOpenKeuangan ? (
                <Link
                  href="/admin/keuangan"
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <WalletCards aria-hidden="true" size={14} />
                    Keuangan
                  </span>
                </Link>
              ) : null}
              <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
                Dashboard Data
              </span>
              {canOpenAkademik ? (
                <Link
                  href="/admin/akademik"
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900"
                >
                  Akademik
                </Link>
              ) : null}
            </nav>

            <div className="flex items-center gap-3">
              {sessionLoading ? (
                <div className="space-y-1.5 text-right">
                  <Skeleton className="ml-auto h-3.5 w-24" />
                  <Skeleton className="ml-auto h-3 w-16" />
                </div>
              ) : actor ? (
                <div className="min-w-0 text-right">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {actor.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABEL[actor.role]}
                  </p>
                </div>
              ) : null}
              <Avatar name={actor?.name ?? "Admin"} />
              <button
                type="button"
                aria-label="Keluar"
                onClick={() => void handleLogout()}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                <LogOut aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Data Induk Pesantren
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Kelola biodata santri, direktori alumni, serta guru dan tenaga
              kependidikan. Data keuangan dan riwayat transaksi tetap utuh saat
              terjadi mutasi atau kelulusan.
            </p>
          </div>
          <p className="text-xs text-slate-400">
            Validasi data · Dompet santri terpisah · Ekspor Excel
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Kategori data induk"
          className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm"
        >
          {TABS.map(({ key, label, icon: Icon }) => {
            const selected = tab === key;

            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-2.5 text-xs font-semibold transition sm:text-sm",
                  selected
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon aria-hidden="true" size={16} />
                {label}
              </button>
            );
          })}
        </div>

        {actor?.role === "OPERATOR" && tab === "AKTIF" ? (
          <SantriDirectory mode="AKTIF" canRefund={canRefund} canEdit />
        ) : null}
        {actor?.role === "OPERATOR" && tab === "ALUMNI" ? (
          <SantriDirectory mode="ALUMNI" canRefund={canRefund} canEdit />
        ) : null}
        {actor?.role === "OPERATOR" && tab === "GURU" ? <GuruDirectory canEdit /> : null}

        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-400">
          Data induk pesantren · Dompet custodial santri
          terpisah dari dana SPP dan infaq.
        </footer>
      </main>
    </div>
  );
}
