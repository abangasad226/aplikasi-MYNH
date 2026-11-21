"use client";

import { useId, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  GraduationCap,
  Info,
  Users,
} from "lucide-react";

import { Alert, Button, Modal } from "@/components/ui";
import type {
  MutasiMassalResponse,
  OpsiResponse,
  SantriItem,
} from "@/lib/api-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";

import { Field, SelectInput, TextInput } from "./form-fields";

type Mode = "NAIK_KELAS" | "LULUSKAN";

export function MassalModal({
  selected,
  opsi,
  onClose,
  onDone,
}: {
  selected: SantriItem[];
  opsi: OpsiResponse | null;
  onClose: () => void;
  onDone: (result: MutasiMassalResponse) => void;
}) {
  const [mode, setMode] = useState<Mode>("NAIK_KELAS");
  const [kelasBaru, setKelasBaru] = useState("");
  const [tahunLulus, setTahunLulus] = useState(
    String(new Date().getFullYear()),
  );
  const [prefix, setPrefix] = useState(
    `SYH/${new Date().getFullYear()}/`,
  );
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const kelasListId = useId();

  const nisList = selected.slice(0, 6).map((item) => item.nis).join(", ");
  const more = selected.length > 6 ? `, +${selected.length - 6} lainnya` : "";

  const handleTahunChange = (value: string) => {
    setTahunLulus(value);

    if (!prefixTouched) {
      setPrefix(`SYH/${value}/`);
    }
  };

  const handleSubmit = async () => {
    if (mode === "NAIK_KELAS" && !kelasBaru.trim()) {
      setError("Isi kelas baru untuk kenaikan kelas massal.");
      return;
    }

    if (mode === "LULUSKAN" && !tahunLulus.trim()) {
      setError("Isi tahun lulus untuk kelulusan massal.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await apiFetch<MutasiMassalResponse>(
        "/api/admin/data/santri/kelulusan-massal",
        {
          method: "POST",
          body: JSON.stringify({
            mode,
            santriIds: selected.map((item) => item.id),
            kelasBaru: mode === "NAIK_KELAS" ? kelasBaru.trim() : undefined,
            tahunLulus:
              mode === "LULUSKAN" ? Number(tahunLulus) : undefined,
            nomorSyahadahPrefix:
              mode === "LULUSKAN" ? prefix.trim() || undefined : undefined,
          }),
        },
      );

      onDone(result);
      setSaving(false);
      onClose();
    } catch (caught) {
      setError(toErrorMessage(caught));
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title="Proses Massal Santri"
      description={`${selected.length} santri dipilih · ${nisList}${more}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSubmit} loading={saving}>
            Jalankan Proses
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {error ? (
          <Alert tone="rose" icon={AlertCircle} title="Proses belum dijalankan">
            {error}
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setMode("NAIK_KELAS")}
            aria-pressed={mode === "NAIK_KELAS"}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === "NAIK_KELAS"
                ? "border-emerald-500 bg-emerald-50/70 ring-4 ring-emerald-100"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200">
              <ArrowUpRight aria-hidden="true" size={18} />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              Kenaikan Kelas
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Pindahkan santri terpilih ke kelas baru, riwayat mutasi tercatat.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("LULUSKAN")}
            aria-pressed={mode === "LULUSKAN"}
            className={`rounded-2xl border p-4 text-left transition ${
              mode === "LULUSKAN"
                ? "border-emerald-500 bg-emerald-50/70 ring-4 ring-emerald-100"
                : "border-slate-200 bg-white hover:border-slate-300"
            }`}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200">
              <GraduationCap aria-hidden="true" size={18} />
            </span>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              Kelulusan / Alumni
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Ubah status menjadi ALUMNI, isi tahun lulus dan nomor syahadah.
            </p>
          </button>
        </div>

        {mode === "NAIK_KELAS" ? (
          <Field
            label="Kelas Baru"
            htmlFor="kelasBaruMassal"
            required
            hint="Semua santri terpilih akan dipindahkan ke kelas ini."
          >
            <TextInput
              id="kelasBaruMassal"
              list={`${kelasListId}-kelas`}
              value={kelasBaru}
              onChange={(event) => setKelasBaru(event.target.value)}
              placeholder="Kelas 11 - Aliyah"
            />
            <datalist id={`${kelasListId}-kelas`}>
              {(opsi?.kelas ?? []).map((kelas) => (
                <option key={kelas} value={kelas} />
              ))}
            </datalist>
          </Field>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tahun Lulus" htmlFor="tahunLulusMassal" required>
              <TextInput
                id="tahunLulusMassal"
                type="number"
                min={1900}
                max={2200}
                value={tahunLulus}
                onChange={(event) => handleTahunChange(event.target.value)}
              />
            </Field>
            <Field
              label="Prefix Nomor Syahadah"
              htmlFor="prefixSyahadah"
              hint="Nomor akhir = prefix + NIS santri."
            >
              <TextInput
                id="prefixSyahadah"
                value={prefix}
                onChange={(event) => {
                  setPrefixTouched(true);
                  setPrefix(event.target.value);
                }}
                placeholder="SYH/2026/"
              />
            </Field>
            {opsi?.tahunLulus.length ? (
              <div className="sm:col-span-2">
                <label
                  htmlFor="angkatanReferensi"
                  className="text-xs font-semibold text-slate-600"
                >
                  Referensi angkatan sebelumnya
                </label>
                <SelectInput
                  id="angkatanReferensi"
                  className="mt-1.5"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      handleTahunChange(event.target.value);
                    }
                  }}
                >
                  <option value="">— Pilih tahun —</option>
                  {opsi.tahunLulus.map((tahun) => (
                    <option key={tahun} value={tahun}>
                      {tahun}
                    </option>
                  ))}
                </SelectInput>
              </div>
            ) : null}
          </div>
        )}

        <Alert tone="amber" icon={Info} title="Riwayat keuangan tetap aman">
          Proses ini tidak menghapus tagihan SPP/infaq maupun transaksi kantin.
          Jika santri yang diluluskan masih memiliki tunggakan, sistem tetap
          memproses kelulusan dan menampilkan daftar tunggakan untuk ditindaklanjuti.
        </Alert>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            <Users aria-hidden="true" size={14} />
            Santri terpilih
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {selected.map((item) => item.name).join(" · ")}
          </p>
        </div>
      </div>
    </Modal>
  );
}
