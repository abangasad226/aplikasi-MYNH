"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ScanLine } from "lucide-react";

import { Alert, Badge, Button, Modal } from "@/components/ui";
import type { SantriItem, SantriMutationResponse } from "@/lib/api-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";

import { Field, TextInput } from "./form-fields";

export function PairingModal({
  santri,
  onClose,
  onSaved,
}: {
  santri: SantriItem;
  onClose: () => void;
  onSaved: (item: SantriItem) => void;
}) {
  const [value, setValue] = useState(santri.rfidUid ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const code = value.trim();

    if (code.length < 4) {
      setError("Tempelkan kartu RFID atau ketik UID minimal 4 karakter.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await apiFetch<SantriMutationResponse>(
        `/api/operator/santri/${santri.id}/rfid`,
        { method: "PATCH", body: JSON.stringify({ rfidUid: code }) },
      );
      onSaved(response.item);
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
      title="Pairing Kartu RFID"
      description={`${santri.name} · NIS ${santri.nis}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button
            type="submit"
            form="pairing-rfid-form"
            loading={saving}
            disabled={!value.trim()}
          >
            Simpan Kartu
          </Button>
        </div>
      }
    >
      <form id="pairing-rfid-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Status kartu saat ini
            </p>
            <div className="mt-1.5">
              {santri.rfidUid ? (
                <Badge tone="emerald">
                  <CheckCircle2 aria-hidden="true" size={13} />
                  Terhubung · {santri.rfidUid}
                </Badge>
              ) : (
                <Badge tone="amber">Belum pairing</Badge>
              )}
            </div>
          </div>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200">
            <ScanLine aria-hidden="true" size={22} />
          </span>
        </div>

        {error ? (
          <Alert tone="rose" icon={AlertCircle} title="Pairing gagal">
            {error}
          </Alert>
        ) : null}

        <Field
          label="RFID UID"
          htmlFor="rfidUidPairing"
          required
          hint="Kolom otomatis fokus. Tempel kartu pada reader (HID) atau scan barcode; data langsung tersimpan saat Enter."
        >
          <TextInput
            ref={inputRef}
            id="rfidUidPairing"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="A1B2C3D4"
            className="h-14 font-mono text-lg uppercase tracking-[0.2em]"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <p className="text-xs leading-6 text-slate-500">
          Satu kartu hanya boleh terhubung ke satu santri. Bila UID sudah dipakai,
          sistem menolak dan menampilkan pemilik kartu tersebut.
        </p>
      </form>
    </Modal>
  );
}
