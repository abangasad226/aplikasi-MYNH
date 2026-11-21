"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Card, Spinner } from "@/components/ui";
import type { PeriodeAkademik, Semester } from "@/lib/akademik-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";

export const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";
export const tableHeadClass = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const tableCellClass = "px-4 py-3 align-top text-sm text-slate-700";

export interface PanelActivity {
  onBusyChange: (busy: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
}

export function usePanelActivity(busy: boolean, dirty: boolean, { onBusyChange, onDirtyChange }: PanelActivity) {
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
}

export function confirmDiscard(dirty: boolean) {
  return !dirty || window.confirm("Perubahan belum disimpan. Tinggalkan perubahan ini?");
}

// Hide stale responses even before the previous effect's cleanup runs.
export function useApiResource<T>(url: string | null, revision = 0) {
  const key = JSON.stringify([url, revision]);
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string | null;
    loading: boolean;
  } | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setState({ key, data: null, error: null, loading: true });
    apiFetch<T>(url, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({ key, data: null, error: toErrorMessage(error), loading: false });
        }
      });
    return () => controller.abort();
  }, [key, url]);

  const updateData = useCallback((update: (data: T) => T) => {
    setState((current) => current?.key === key && current.data !== null
      ? { ...current, data: update(current.data) }
      : current);
  }, [key]);

  return {
    data: url && state?.key === key ? state.data : null,
    error: url && state?.key === key ? state.error : null,
    loading: Boolean(url && (state?.key !== key || state.loading)),
    updateData,
  };
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0 space-y-1.5 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
      {hint ? <span className="block text-xs font-normal leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

export function LoadingState({ label = "Memuat data…" }: { label?: string }) {
  return <div role="status" className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-500"><Spinner />{label}</div>;
}

export interface KelasPeriode extends PeriodeAkademik { kelas: string }

export function validTahunAjaran(value: string) {
  if (!/^20\d{2}\/20\d{2}$/.test(value)) return false;
  const [start, end] = value.split("/").map(Number);
  return end === start + 1;
}

export function validFilters(filters: KelasPeriode) {
  return Boolean(filters.kelas.trim()) && validTahunAjaran(filters.tahunAjaran);
}

export function periodQuery(filters: KelasPeriode) {
  return new URLSearchParams({ kelas: filters.kelas, semester: filters.semester, tahunAjaran: filters.tahunAjaran });
}

export function PeriodFilters({ value, kelas, onChange, disabled, children }: {
  value: KelasPeriode;
  kelas: string[];
  onChange: (next: KelasPeriode) => void;
  disabled: boolean;
  children?: ReactNode;
}) {
  const validYear = validTahunAjaran(value.tahunAjaran);
  const years = value.tahunAjaran.split("/");
  return (
    <Card className="p-4 sm:p-5">
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <legend className="sr-only">Filter kelas dan periode akademik</legend>
        <Field label="Kelas">
          <select required className={inputClass} value={value.kelas} onChange={(event) => onChange({ ...value, kelas: event.target.value })}>
            <option value="">Pilih kelas</option>
            {kelas.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Semester">
          <select required className={inputClass} value={value.semester} onChange={(event) => onChange({ ...value, semester: event.target.value as Semester })}>
            <option value="GANJIL">Ganjil · Juli–Desember</option>
            <option value="GENAP">Genap · Januari–Juni</option>
          </select>
        </Field>
        <Field label="Tahun ajaran" hint="Dua tahun berurutan, misalnya 2026/2027.">
          <input required pattern="20[0-9]{2}/20[0-9]{2}" maxLength={9} placeholder="2026/2027" className={inputClass} value={value.tahunAjaran} aria-invalid={!validYear} onChange={(event) => onChange({ ...value, tahunAjaran: event.target.value })} />
        </Field>
        {children}
      </fieldset>
      {!validYear ? <p role="alert" className="mt-3 text-xs text-rose-700">Tahun ajaran wajib berformat 20xx/20xx dan berurutan (contoh: 2026/2027).</p> : null}
      <p className="mt-4 text-xs leading-5 text-slate-500">
        Semester ganjil: 1 Juli–31 Desember pada tahun pertama. Semester genap: 1 Januari–30 Juni pada tahun kedua.
        {validYear ? <span className="ml-1 font-semibold text-emerald-700">Periode dipilih: {value.semester === "GANJIL" ? `Juli–Desember ${years[0]}` : `Januari–Juni ${years[1]}`}.</span> : null}
      </p>
    </Card>
  );
}
