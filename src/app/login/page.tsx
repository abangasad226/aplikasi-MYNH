"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  BookOpenCheck,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PesantrenLogo } from "@/components/pesantren-logo";
import { useState, type FormEvent } from "react";

import { apiFetch, toErrorMessage } from "@/lib/client-api";
import type { LoginResponse, RoleName } from "@/lib/api-types";
import { Alert, Button, Card } from "@/components/ui";

const DEMO_PASSWORD = "Pesantren#2026";

const DEMO_ACCOUNTS: Array<{
  label: string;
  email: string;
  icon: LucideIcon;
}> = [
  { label: "Wali Santri", email: "wali@pesantren.test", icon: Wallet },
  { label: "Bendahara", email: "bendahara@pesantren.test", icon: Landmark },
  { label: "Operator", email: "operator@pesantren.test", icon: Users },
  { label: "Kasir Kantin", email: "kasir@pesantren.test", icon: CreditCard },
  { label: "Ustadz Pengurus", email: "ustadz@pesantren.test", icon: BookOpenCheck },
];

const FEATURES: Array<{ icon: LucideIcon; text: string }> = [
  {
    icon: Wallet,
    text: "Saldo uang jajan terpisah dari SPP dan Infaq Makan.",
  },
  {
    icon: BookOpenCheck,
    text: "Akademik, ngaji, dan kedisiplinan santri dalam satu portal wali.",
  },
  {
    icon: ShieldCheck,
    text: "Jejak audit transaksi keuangan terhubung ke ledger Web3.",
  },
];

function destinationForRole(role: RoleName): string {
  switch (role) {
    case "BENDAHARA":
      return "/admin/keuangan";
    case "OPERATOR":
      return "/admin/data-induk";
    case "USTADZ_PENGURUS":
      return "/admin/akademik";
    case "KASIR_KANTIN":
      return "/kantin/pos";
    case "WALI_SANTRI":
      return "/wali/dashboard";
    default:
      return "/";
  }
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await apiFetch<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      router.replace(destinationForRole(result.user.role));
      router.refresh();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(accountEmail: string) {
    setEmail(accountEmail);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  return (
    <div className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-700 p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <PesantrenLogo />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-100">
              MyNurulHuda
            </p>
            <p className="text-xs font-semibold">Pondok Pesantren Nurul Huda Pangauban</p>
          </div>
        </div>

        <div className="relative">
          <h1 className="max-w-md text-4xl font-bold leading-tight tracking-tight">
            MyNurulHuda
            <span className="mt-2 block text-emerald-200">
              Sistem Digitalisasi Pondok Pesantren Nurul Huda Pangauban.
            </span>
          </h1>
          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-emerald-50">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon aria-hidden="true" size={16} />
                </span>
                <span className="leading-6">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-emerald-100/70">
          Next.js · Prisma · PostgreSQL · Ethers.js v6
        </p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-6 lg:py-16">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <Link
              href="/"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm"
            >
              <PesantrenLogo />
            </Link>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                MyNurulHuda
              </p>
              <p className="text-xs font-bold text-slate-900">
                Pondok Pesantren Nurul Huda Pangauban
              </p>
            </div>
          </div>

          <Card className="p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Masuk ke akun Anda
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Gunakan akun yang diberikan admin pesantren.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="email"
                  className="text-xs font-medium text-slate-600"
                >
                  Email
                </label>
                <div className="relative mt-1.5">
                  <Mail
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="nama@pesantren.test"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="text-xs font-medium text-slate-600"
                >
                  Password
                </label>
                <div className="relative mt-1.5">
                  <Lock
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={17}
                  />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Sembunyikan password" : "Tampilkan password"
                    }
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    {showPassword ? (
                      <EyeOff aria-hidden="true" size={17} />
                    ) : (
                      <Eye aria-hidden="true" size={17} />
                    )}
                  </button>
                </div>
              </div>

              {error ? (
                <Alert tone="rose" icon={AlertCircle}>
                  {error}
                </Alert>
              ) : null}

              <Button
                type="submit"
                size="md"
                loading={busy}
                className="h-11 w-full"
              >
                {!busy ? <LogIn aria-hidden="true" size={18} /> : null}
                Masuk
              </Button>
            </form>

            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Akun demo (seed)
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map(({ label, email: demoEmail, icon: Icon }) => (
                  <button
                    key={demoEmail}
                    type="button"
                    onClick={() => fillDemo(demoEmail)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                  >
                    <Icon aria-hidden="true" size={14} className="shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-5 text-slate-400">
                Password akun seed:{" "}
                <span className="font-mono text-slate-500">
                  {DEMO_PASSWORD}
                </span>
                . Khusus lingkungan pengembangan.
              </p>
            </div>
          </Card>

          <p className="mt-5 text-center text-xs text-slate-400">
            <Link href="/" className="font-medium text-slate-500 hover:text-emerald-700">
              ← Kembali ke beranda
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
