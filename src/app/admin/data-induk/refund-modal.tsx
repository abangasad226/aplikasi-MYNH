"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, HandCoins } from "lucide-react";

import { Alert, Button, Modal } from "@/components/ui";
import type {
  AdminPencairanSaldoResponse,
  SantriItem,
} from "@/lib/api-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { formatRupiah } from "@/lib/format";

import { Field, SelectInput, TextAreaInput, TextInput } from "./form-fields";

type MetodePencairan = "TUNAI_BENDAHARA" | "TRANSFER_VA";

export function RefundModal({
  santri,
  onClose,
  onDone,
}: {
  santri: SantriItem;
  onClose: () => void;
  onDone: (hasil: AdminPencairanSaldoResponse) => void;
}) {
  const saldoAwal = BigInt(santri.saldoJajan);
  const [nominal, setNominal] = useState(santri.saldoJajan);
  const [metode, setMetode] = useState<MetodePencairan>("TUNAI_BENDAHARA");
  const [keterangan, setKeterangan] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!/^\d+$/.test(nominal.trim())) {
      setError("Nominal harus berupa angka bulat tanpa titik atau koma.");
      return;
    }

    const nominalBig = BigInt(nominal.trim());

    if (nominalBig <= 0n) {
      setError("Nominal pencairan harus lebih dari 0.");
      return;
    }

    if (nominalBig > saldoAwal) {
      setError(
        `Nominal melebihi saldo jajan tersedia (${formatRupiah(saldoAwal)}).`,
      );
      return;
    }

    setSaving(true);

    try {
      const hasil = await apiFetch<AdminPencairanSaldoResponse>(
        "/api/admin/keuangan/pencairan",
        {
          method: "POST",
          body: JSON.stringify({
            santriId: santri.id,
            nominalPencairan: nominal.trim(),
            metodePembayaran: metode,
            keterangan: keterangan.trim() || undefined,
          }),
        },
      );

      onDone(hasil);
      onClose();
    } catch (caught) {
      setError(toErrorMessage(caught));
      setSaving(false);
    }
  };

  const saldoKembali = /^\d+$/.test(nominal.trim())
    ? saldoAwal - BigInt(nominal.trim())
    : null;

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      title="Pencairan Saldo Jajan"
      description={`${santri.name} · NIS ${santri.nis}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button
            type="submit"
            form="refund-jajan-form"
            loading={saving}
            disabled={!nominal.trim()}
          >
            <HandCoins aria-hidden="true" size={16} />
            Cairkan Saldo
          </Button>
        </div>
      }
    >
      <form id="refund-jajan-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Saldo jajan tersedia
            </p>
            <p className="text-lg font-bold tabular-nums text-emerald-900">
              {formatRupiah(saldoAwal)}
            </p>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-emerald-800">
            Status santri: {santri.statusSantri}. Pencairan disarankan saat
            santri lulus, pindah, atau keluar pesantren. Transaksi dicatat
            sebagai PENARIKAN_TUNAI.
          </p>
        </div>

        <Field
          label="Nominal pencairan"
          htmlFor="nominalPencairan"
          required
          hint={
            saldoKembali !== null
              ? `Sisa saldo setelah pencairan: ${formatRupiah(saldoKembali)}`
              : "Masukkan angka bulat rupiah."
          }
        >
          <TextInput
            id="nominalPencairan"
            inputMode="numeric"
            value={nominal}
            onChange={(event) => setNominal(event.target.value)}
            required
          />
        </Field>

        <Field label="Metode pengembalian" htmlFor="metodePencairan" required>
          <SelectInput
            id="metodePencairan"
            value={metode}
            onChange={(event) =>
              setMetode(event.target.value as MetodePencairan)
            }
          >
            <option value="TUNAI_BENDAHARA">Tunai oleh Bendahara</option>
            <option value="TRANSFER_VA">Transfer / VA</option>
          </SelectInput>
        </Field>

        <Field
          label="Keterangan"
          htmlFor="keteranganPencairan"
          hint="Opsional, misalnya nomor bukti transfer atau berita acara."
        >
          <TextAreaInput
            id="keteranganPencairan"
            rows={2}
            value={keterangan}
            onChange={(event) => setKeterangan(event.target.value)}
            maxLength={500}
          />
        </Field>

        {error ? (
          <Alert tone="rose" icon={AlertCircle}>
            {error}
          </Alert>
        ) : null}
      </form>
    </Modal>
  );
}
