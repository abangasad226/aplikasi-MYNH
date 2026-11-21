"use client";

import { useId, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpenCheck,
  IdCard,
  MapPin,
  ScanLine,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

import { Alert, Button, Modal, Switch } from "@/components/ui";
import type {
  OpsiResponse,
  SantriItem,
  SantriMutationResponse,
  WaliOption,
} from "@/lib/api-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";

import {
  Field,
  FormSection,
  SelectInput,
  StepTabs,
  TextAreaInput,
  TextInput,
} from "./form-fields";

type StepKey = "IDENTITAS" | "ALAMAT" | "ORANG_TUA" | "AKADEMIK";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "IDENTITAS", label: "Identitas Pribadi" },
  { key: "ALAMAT", label: "Alamat" },
  { key: "ORANG_TUA", label: "Orang Tua & Wali" },
  { key: "AKADEMIK", label: "Akademik & RFID" },
];

type FormValues = Record<string, string>;

const CURRENT_YEAR = new Date().getFullYear();

function initialState(
  santri: SantriItem | null,
  defaultStatus: "AKTIF" | "ALUMNI",
): FormValues {
  return {
    nis: santri?.nis ?? "",
    nik: santri?.nik ?? "",
    nisn: santri?.nisn ?? "",
    nism: santri?.nism ?? "",
    name: santri?.name ?? "",
    tempatLahir: santri?.tempatLahir ?? "",
    tanggalLahir: santri?.tanggalLahir ?? "",
    jenisKelamin: santri?.jenisKelamin ?? "LAKI_LAKI",
    alamatLengkap: santri?.alamatLengkap ?? "",
    rtRw: santri?.rtRw ?? "",
    desaKelurahan: santri?.desaKelurahan ?? "",
    kecamatan: santri?.kecamatan ?? "",
    kabupatenKota: santri?.kabupatenKota ?? "",
    provinsi: santri?.provinsi ?? "",
    nomorKK: santri?.nomorKK ?? "",
    namaAyah: santri?.namaAyah ?? "",
    nikAyah: santri?.nikAyah ?? "",
    statusHidupAyah: santri?.statusHidupAyah ?? "MASIH_HIDUP",
    pekerjaanAyah: santri?.pekerjaanAyah ?? "",
    penghasilanAyah: santri?.penghasilanAyah ?? "",
    noHpAyah: santri?.noHpAyah ?? "",
    namaIbu: santri?.namaIbu ?? "",
    nikIbu: santri?.nikIbu ?? "",
    statusHidupIbu: santri?.statusHidupIbu ?? "MASIH_HIDUP",
    pekerjaanIbu: santri?.pekerjaanIbu ?? "",
    penghasilanIbu: santri?.penghasilanIbu ?? "",
    noHpIbu: santri?.noHpIbu ?? "",
    waliId: santri?.wali.id ?? "",
    fotoSantriUrl: santri?.fotoSantriUrl ?? "",
    fileKkUrl: santri?.fileKkUrl ?? "",
    fileAktaUrl: santri?.fileAktaUrl ?? "",
    fileIjazahUrl: santri?.fileIjazahUrl ?? "",
    statusMukim: santri?.statusMukim ?? "MUKIM",
    statusSantri: santri?.statusSantri ?? defaultStatus,
    tahunMasuk: String(santri?.tahunMasuk ?? CURRENT_YEAR),
    tahunLulus: santri?.tahunLulus ? String(santri.tahunLulus) : "",
    nomorSyahadah: santri?.nomorSyahadah ?? "",
    kelas: santri?.kelas ?? "",
    kamar: santri?.kamar ?? "",
    rfidUid: santri?.rfidUid ?? "",
    barcodeCode: santri?.barcodeCode ?? "",
    isDispensasiInfaq: santri?.isDispensasiInfaq ? "true" : "false",
    catatanDispensasi: santri?.catatanDispensasi ?? "",
  };
}

const REQUIRED_PER_STEP: Record<StepKey, Array<[string, string]>> = {
  IDENTITAS: [
    ["nis", "NIS"],
    ["nik", "NIK"],
    ["name", "Nama lengkap"],
    ["tempatLahir", "Tempat lahir"],
    ["tanggalLahir", "Tanggal lahir"],
    ["jenisKelamin", "Jenis kelamin"],
  ],
  ALAMAT: [
    ["alamatLengkap", "Alamat lengkap"],
    ["desaKelurahan", "Desa/kelurahan"],
    ["kecamatan", "Kecamatan"],
    ["kabupatenKota", "Kabupaten/kota"],
    ["provinsi", "Provinsi"],
    ["nomorKK", "Nomor KK"],
  ],
  ORANG_TUA: [
    ["namaAyah", "Nama ayah"],
    ["namaIbu", "Nama ibu"],

  ],
  AKADEMIK: [
    ["kelas", "Kelas"],
    ["kamar", "Kamar"],
    ["statusMukim", "Status mukim"],
    ["tahunMasuk", "Tahun masuk"],
  ],
};

function requirementLabel(values: FormValues): Array<[string, string]> {
  const list = [...REQUIRED_PER_STEP.AKADEMIK];

  if (values.statusSantri === "ALUMNI") {
    list.push(["tahunLulus", "Tahun lulus"], ["nomorSyahadah", "Nomor syahadah"]);
  }

  return list;
}

function buildPayload(values: FormValues, includeDispensasi: boolean) {
  const text = (key: string) => {
    const value = (values[key] ?? "").trim();
    return value === "" ? undefined : value;
  };

  return {
    nis: values.nis.trim(),
    nik: values.nik.trim(),
    nisn: text("nisn"),
    nism: text("nism"),
    name: values.name.trim(),
    kelas: values.kelas.trim(),
    kamar: values.kamar.trim(),
    rfidUid: text("rfidUid"),
    barcodeCode: text("barcodeCode"),
    tempatLahir: values.tempatLahir.trim(),
    tanggalLahir: values.tanggalLahir,
    jenisKelamin: values.jenisKelamin,
    alamatLengkap: values.alamatLengkap.trim(),
    rtRw: text("rtRw"),
    desaKelurahan: values.desaKelurahan.trim(),
    kecamatan: values.kecamatan.trim(),
    kabupatenKota: values.kabupatenKota.trim(),
    provinsi: values.provinsi.trim(),
    nomorKK: values.nomorKK.trim(),
    namaAyah: values.namaAyah.trim(),
    nikAyah: text("nikAyah"),
    statusHidupAyah: values.statusHidupAyah,
    pekerjaanAyah: text("pekerjaanAyah"),
    penghasilanAyah: text("penghasilanAyah"),
    noHpAyah: text("noHpAyah"),
    namaIbu: values.namaIbu.trim(),
    nikIbu: text("nikIbu"),
    statusHidupIbu: values.statusHidupIbu,
    pekerjaanIbu: text("pekerjaanIbu"),
    penghasilanIbu: text("penghasilanIbu"),
    noHpIbu: text("noHpIbu"),
    statusMukim: values.statusMukim,
    statusSantri: values.statusSantri,
    tahunMasuk: Number(values.tahunMasuk),
    tahunLulus: values.tahunLulus ? Number(values.tahunLulus) : undefined,
    nomorSyahadah: text("nomorSyahadah"),
    waliId: text("waliId"),
    fotoSantriUrl: text("fotoSantriUrl"),
    fileKkUrl: text("fileKkUrl"),
    fileAktaUrl: text("fileAktaUrl"),
    fileIjazahUrl: text("fileIjazahUrl"),
    ...(includeDispensasi
      ? {
          isDispensasiInfaq: values.isDispensasiInfaq === "true",
          catatanDispensasi: text("catatanDispensasi") ?? null,
        }
      : {}),
  };
}

export function SantriFormModal({
  open,
  santri,
  opsi,
  defaultStatus,
  canDispensasi = false,
  onClose,
  onSaved,
}: {
  open: boolean;
  santri: SantriItem | null;
  opsi: OpsiResponse | null;
  defaultStatus: "AKTIF" | "ALUMNI";
  canDispensasi?: boolean;
  onClose: () => void;
  onSaved: (item: SantriItem, mode: "create" | "edit") => void;
}) {
  const mode = santri ? "edit" : "create";
  const [step, setStep] = useState<StepKey>("IDENTITAS");
  const [values, setValues] = useState<FormValues>(() =>
    initialState(santri, defaultStatus),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [documentForExtract, setDocumentForExtract] = useState<File | null>(null);
  const [documentKind, setDocumentKind] = useState<"KK" | "AKTA" | "IJAZAH">("KK");
  const datalistId = useId();

  const waliOptions = useMemo<WaliOption[]>(
    () => opsi?.wali ?? [],
    [opsi],
  );

  const update = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const uploadDocument = async (key: string, file?: File) => {
    if (!file) return;
    setUploading(key);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await apiFetch<{ url: string }>("/api/upload", { method: "POST", body: form });
      update(key, result.url);
      setDocumentForExtract(key === "fotoSantriUrl" ? null : file);
      setDocumentKind(key === "fileAktaUrl" ? "AKTA" : key === "fileIjazahUrl" ? "IJAZAH" : "KK");
    } catch (caught) { setError(toErrorMessage(caught)); }
    finally { setUploading(null); }
  };

  const extractDocument = async () => {
    if (!documentForExtract) return;
    setUploading("extract");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", documentForExtract);
      form.append("jenis", documentKind);
      const result = await apiFetch<{ extracted: Record<string, unknown> }>("/api/operator/extract-document", { method: "POST", body: form });
      const extracted = result.extracted;
      const fieldMap: Record<string, string> = { nomorKK: "nomorKK", name: "name", nama: "name", nik: "nik", tempatLahir: "tempatLahir", tanggalLahir: "tanggalLahir", alamatLengkap: "alamatLengkap", namaAyah: "namaAyah", nikAyah: "nikAyah", namaIbu: "namaIbu", nikIbu: "nikIbu" };
      for (const [source, target] of Object.entries(fieldMap)) if (typeof extracted[source] === "string" && extracted[source]) update(target, extracted[source] as string);
    } catch (caught) { setError(toErrorMessage(caught)); }
    finally { setUploading(null); }
  };

  const stepIndex = STEPS.findIndex((item) => item.key === step);

  const findMissing = (): { step: StepKey; label: string } | null => {
    for (const item of STEPS) {
      const required =
        item.key === "AKADEMIK"
          ? requirementLabel(values)
          : REQUIRED_PER_STEP[item.key];
      const missing = required.find(
        ([key]) => (values[key] ?? "").trim() === "",
      );

      if (missing) {
        return { step: item.key, label: missing[1] };
      }
    }

    return null;
  };

  const guardStep = (nextStep: StepKey): boolean => {
    const required = REQUIRED_PER_STEP[step];
    const missing = required.find(([key]) => (values[key] ?? "").trim() === "");

    if (missing) {
      setError(`Lengkapi ${missing[1]} sebelum melanjutkan.`);
      return false;
    }

    setError(null);
    setStep(nextStep);
    return true;
  };

  const handleSubmit = async () => {
    const missing = findMissing();

    if (missing) {
      setError(`Lengkapi ${missing.label} terlebih dahulu.`);
      setStep(missing.step);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = buildPayload(values, mode === "edit" && canDispensasi);
      const response =
        mode === "create"
          ? await apiFetch<SantriMutationResponse>("/api/operator/santri", {
              method: "POST",
              body: JSON.stringify(payload),
            })
          : await apiFetch<SantriMutationResponse>(
              `/api/operator/santri/${santri?.id}`,
              { method: "PUT", body: JSON.stringify(payload) },
            );

      onSaved(response.item, mode);
      setSaving(false);
      onClose();
    } catch (caught) {
      setError(toErrorMessage(caught));
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" onClick={onClose} disabled={saving}>
        Batal
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        {stepIndex > 0 ? (
          <Button
            variant="secondary"
            onClick={() => setStep(STEPS[stepIndex - 1].key)}
            disabled={saving}
          >
            Kembali
          </Button>
        ) : null}
        {stepIndex < STEPS.length - 1 ? (
          <Button
            onClick={() => guardStep(STEPS[stepIndex + 1].key)}
            disabled={saving}
          >
            Lanjut
          </Button>
        ) : (
          <Button onClick={handleSubmit} loading={saving}>
            {mode === "create" ? "Simpan Santri" : "Simpan Perubahan"}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      size="xl"
      title={mode === "create" ? "Tambah Data Santri" : "Edit Data Santri"}
      description={
        mode === "create"
          ? "Data induk santri. Dompet custodial santri dibuat otomatis saat disimpan."
          : `Perbarui biodata ${santri?.name ?? "santri"} tanpa mengubah riwayat keuangan.`
      }
      footer={footer}
    >
      <div className="space-y-5">
        <StepTabs steps={STEPS} active={step} onChange={setStep} />

        {error ? (
          <Alert tone="rose" icon={AlertCircle} title="Periksa kembali data">
            {error}
          </Alert>
        ) : null}

        {step === "IDENTITAS" ? (
          <FormSection
            title="Identitas Pribadi"
            description="Sesuai dokumen kependudukan (KK/KIA) untuk pelaporan administrasi."
            icon={<IdCard aria-hidden="true" size={18} />}
          >
            <Field label="NIS" htmlFor="nis" required hint="Huruf, angka, dan tanda hubung.">
              <TextInput
                id="nis"
                value={values.nis}
                onChange={(event) => update("nis", event.target.value)}
                placeholder="20240012"
                autoComplete="off"
              />
            </Field>
            <Field label="Nama Lengkap" htmlFor="name" required>
              <TextInput
                id="name"
                value={values.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Ahmad Fauzan"
              />
            </Field>
            <Field label="NIK" htmlFor="nik" required hint="16 digit angka.">
              <TextInput
                id="nik"
                value={values.nik}
                onChange={(event) => update("nik", event.target.value)}
                inputMode="numeric"
                maxLength={16}
                placeholder="3507xxxxxxxxxxxx"
              />
            </Field>
            <Field label="NISN" htmlFor="nisn" hint="Opsional, 10 digit angka.">
              <TextInput
                id="nisn"
                value={values.nisn}
                onChange={(event) => update("nisn", event.target.value)}
                inputMode="numeric"
                maxLength={10}
                placeholder="00xxxxxxxx"
              />
            </Field>
            <Field label="NISM" htmlFor="nism" hint="Nomor induk santri madrasah (opsional).">
              <TextInput
                id="nism"
                value={values.nism}
                onChange={(event) => update("nism", event.target.value)}
              />
            </Field>
            <Field label="Jenis Kelamin" htmlFor="jenisKelamin" required>
              <SelectInput
                id="jenisKelamin"
                value={values.jenisKelamin}
                onChange={(event) => update("jenisKelamin", event.target.value)}
              >
                <option value="LAKI_LAKI">Laki-laki</option>
                <option value="PEREMPUAN">Perempuan</option>
              </SelectInput>
            </Field>
            <Field label="Tempat Lahir" htmlFor="tempatLahir" required>
              <TextInput
                id="tempatLahir"
                value={values.tempatLahir}
                onChange={(event) => update("tempatLahir", event.target.value)}
                placeholder="Jombang"
              />
            </Field>
            <Field label="Tanggal Lahir" htmlFor="tanggalLahir" required>
              <TextInput
                id="tanggalLahir"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={values.tanggalLahir}
                onChange={(event) => update("tanggalLahir", event.target.value)}
              />
            </Field>
          </FormSection>
        ) : null}

        {step === "ALAMAT" ? (
          <FormSection
            title="Alamat Domisili Keluarga"
            description="Alamat lengkap orang tua/wali sesuai KK."
            icon={<MapPin aria-hidden="true" size={18} />}
          >
            <Field
              label="Alamat Lengkap"
              htmlFor="alamatLengkap"
              required
              className="sm:col-span-2"
            >
              <TextAreaInput
                id="alamatLengkap"
                value={values.alamatLengkap}
                onChange={(event) =>
                  update("alamatLengkap", event.target.value)
                }
                placeholder="Jl. KH. Wahab Chasbullah No. 12"
              />
            </Field>
            <Field label="RT / RW" htmlFor="rtRw">
              <TextInput
                id="rtRw"
                value={values.rtRw}
                onChange={(event) => update("rtRw", event.target.value)}
                placeholder="003 / 004"
              />
            </Field>
            <Field label="Desa / Kelurahan" htmlFor="desaKelurahan" required>
              <TextInput
                id="desaKelurahan"
                value={values.desaKelurahan}
                onChange={(event) =>
                  update("desaKelurahan", event.target.value)
                }
                placeholder="Tambakberas"
              />
            </Field>
            <Field label="Kecamatan" htmlFor="kecamatan" required>
              <TextInput
                id="kecamatan"
                value={values.kecamatan}
                onChange={(event) => update("kecamatan", event.target.value)}
                placeholder="Jombang"
              />
            </Field>
            <Field label="Kabupaten / Kota" htmlFor="kabupatenKota" required>
              <TextInput
                id="kabupatenKota"
                value={values.kabupatenKota}
                onChange={(event) =>
                  update("kabupatenKota", event.target.value)
                }
                placeholder="Kabupaten Jombang"
              />
            </Field>
            <Field label="Provinsi" htmlFor="provinsi" required>
              <TextInput
                id="provinsi"
                value={values.provinsi}
                onChange={(event) => update("provinsi", event.target.value)}
                placeholder="Jawa Timur"
              />
            </Field>
            <Field label="Nomor KK" htmlFor="nomorKK" required hint="16 digit angka.">
              <TextInput
                id="nomorKK"
                value={values.nomorKK}
                onChange={(event) => update("nomorKK", event.target.value)}
                inputMode="numeric"
                maxLength={16}
                placeholder="3507xxxxxxxxxxxx"
              />
            </Field>
          </FormSection>
        ) : null}

        {step === "ORANG_TUA" ? (
          <FormSection
            title="Data Orang Tua / Wali"
            description="Wali aktif dipakai untuk login portal wali santri."
            icon={<Users aria-hidden="true" size={18} />}
          >
            <Field label="Nama Ayah" htmlFor="namaAyah" required>
              <TextInput
                id="namaAyah"
                value={values.namaAyah}
                onChange={(event) => update("namaAyah", event.target.value)}
              />
            </Field>
            <Field label="Status Hidup Ayah" htmlFor="statusHidupAyah">
              <SelectInput
                id="statusHidupAyah"
                value={values.statusHidupAyah}
                onChange={(event) => update("statusHidupAyah", event.target.value)}
              >
                <option value="MASIH_HIDUP">Masih Hidup</option>
                <option value="MENINGGAL">Meninggal Dunia</option>
              </SelectInput>
            </Field>
            <Field label="NIK Ayah" htmlFor="nikAyah" hint="Opsional, 16 digit.">
              <TextInput
                id="nikAyah"
                value={values.nikAyah}
                onChange={(event) => update("nikAyah", event.target.value)}
                inputMode="numeric"
                maxLength={16}
              />
            </Field>
            <Field label="No. HP / WhatsApp Ayah" htmlFor="noHpAyah" hint="Format: 08xxx">
              <TextInput
                id="noHpAyah"
                value={values.noHpAyah}
                onChange={(event) => update("noHpAyah", event.target.value)}
                placeholder="081234567890"
              />
            </Field>
            <Field label="Pekerjaan Ayah" htmlFor="pekerjaanAyah">
              <TextInput
                id="pekerjaanAyah"
                value={values.pekerjaanAyah}
                onChange={(event) => update("pekerjaanAyah", event.target.value)}
                placeholder="Petani / Wiraswasta"
              />
            </Field>
            <Field label="Penghasilan Ayah" htmlFor="penghasilanAyah">
              <SelectInput
                id="penghasilanAyah"
                value={values.penghasilanAyah}
                onChange={(event) => update("penghasilanAyah", event.target.value)}
              >
                <option value="">— Pilih rentang penghasilan —</option>
                <option value="DI_BAWAH_1_JUTA">Di bawah Rp 1.000.000</option>
                <option value="SATU_SAMPAI_2_JUTA">Rp 1.000.000 - Rp 2.000.000</option>
                <option value="DUA_SAMPAI_5_JUTA">Rp 2.000.000 - Rp 5.000.000</option>
                <option value="LIMA_SAMPAI_10_JUTA">Rp 5.000.000 - Rp 10.000.000</option>
                <option value="DI_ATAS_10_JUTA">Di atas Rp 10.000.000</option>
              </SelectInput>
            </Field>

            <Field label="Nama Ibu" htmlFor="namaIbu" required>
              <TextInput
                id="namaIbu"
                value={values.namaIbu}
                onChange={(event) => update("namaIbu", event.target.value)}
              />
            </Field>
            <Field label="Status Hidup Ibu" htmlFor="statusHidupIbu">
              <SelectInput
                id="statusHidupIbu"
                value={values.statusHidupIbu}
                onChange={(event) => update("statusHidupIbu", event.target.value)}
              >
                <option value="MASIH_HIDUP">Masih Hidup</option>
                <option value="MENINGGAL">Meninggal Dunia</option>
              </SelectInput>
            </Field>
            <Field label="NIK Ibu" htmlFor="nikIbu" hint="Opsional, 16 digit.">
              <TextInput
                id="nikIbu"
                value={values.nikIbu}
                onChange={(event) => update("nikIbu", event.target.value)}
                inputMode="numeric"
                maxLength={16}
              />
            </Field>
            <Field label="No. HP / WhatsApp Ibu" htmlFor="noHpIbu" hint="Format: 08xxx">
              <TextInput
                id="noHpIbu"
                value={values.noHpIbu}
                onChange={(event) => update("noHpIbu", event.target.value)}
                placeholder="081234567890"
              />
            </Field>
            <Field label="Pekerjaan Ibu" htmlFor="pekerjaanIbu">
              <TextInput
                id="pekerjaanIbu"
                value={values.pekerjaanIbu}
                onChange={(event) => update("pekerjaanIbu", event.target.value)}
                placeholder="Ibu Rumah Tangga"
              />
            </Field>
            <Field label="Penghasilan Ibu" htmlFor="penghasilanIbu">
              <SelectInput
                id="penghasilanIbu"
                value={values.penghasilanIbu}
                onChange={(event) => update("penghasilanIbu", event.target.value)}
              >
                <option value="">— Pilih rentang penghasilan —</option>
                <option value="DI_BAWAH_1_JUTA">Di bawah Rp 1.000.000</option>
                <option value="SATU_SAMPAI_2_JUTA">Rp 1.000.000 - Rp 2.000.000</option>
                <option value="DUA_SAMPAI_5_JUTA">Rp 2.000.000 - Rp 5.000.000</option>
                <option value="LIMA_SAMPAI_10_JUTA">Rp 5.000.000 - Rp 10.000.000</option>
                <option value="DI_ATAS_10_JUTA">Di atas Rp 10.000.000</option>
              </SelectInput>
            </Field>
            <Field
              label="Akun Wali Santri"
              htmlFor="waliId"
              className="sm:col-span-2"
              hint={
                waliOptions.length === 0
                  ? "Bila tidak dipilih, akun wali dibuat otomatis dari nomor HP orang tua/wali; password awal adalah NIS."
                  : "Pilih akun yang sudah ada atau kosongkan agar akun wali ditautkan otomatis dari nomor HP orang tua/wali."
              }
            >
              <SelectInput
                id="waliId"
                value={values.waliId}
                onChange={(event) => update("waliId", event.target.value)}
              >
                <option value="">— Pilih akun wali —</option>
                {waliOptions.map((wali) => (
                  <option key={wali.id} value={wali.id}>
                    {wali.name} · {wali.email}
                  </option>
                ))}
              </SelectInput>
            </Field>
            {([
              ["fotoSantriUrl", "Pas foto santri", "image/*"],
              ["fileKkUrl", "Kartu Keluarga", "image/*,application/pdf"],
              ["fileAktaUrl", "Akta Kelahiran", "image/*,application/pdf"],
              ["fileIjazahUrl", "Ijazah Terakhir", "image/*,application/pdf"],
            ] as const).map(([key, label, accept]) => (
              <Field key={key} label={label} htmlFor={`upload-${key}`} className="sm:col-span-2">
                <div className="flex flex-wrap items-center gap-3">
                  <input id={`upload-${key}`} type="file" accept={accept} disabled={Boolean(uploading)} onChange={(event) => void uploadDocument(key, event.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:font-semibold file:text-emerald-800" />
                  {uploading === key ? <span className="text-xs text-slate-500">Mengunggah…</span> : null}
                  {values[key] ? <a className="text-xs font-medium text-emerald-700 underline" href={values[key]} target="_blank" rel="noreferrer">Lihat berkas</a> : null}
                </div>
              </Field>
            ))}
            <div className="sm:col-span-2">
              <Button type="button" variant="secondary" disabled={!documentForExtract || Boolean(uploading)} onClick={() => void extractDocument()}>
                {uploading === "extract" ? "Membaca dokumen…" : `Baca & Isi otomatis dari Berkas ${documentKind}`}
              </Button>
              <p className="mt-1 text-xs text-slate-500">Ekstraksi memakai Gemini Vision; hasil perlu diperiksa sebelum disimpan.</p>
            </div>
          </FormSection>
        ) : null}

        {step === "AKADEMIK" ? (
          <div className="space-y-6">
            <FormSection
              title="Akademik & Kesantrian"
              description="Data kelas, kamar, dan status santri."
              icon={<BookOpenCheck aria-hidden="true" size={18} />}
            >
              <Field label="Kelas" htmlFor="kelas" required hint="Boleh memilih atau mengetik kelas baru.">
                <TextInput
                  id="kelas"
                  list={`${datalistId}-kelas`}
                  value={values.kelas}
                  onChange={(event) => update("kelas", event.target.value)}
                  placeholder="Kelas 10 - Aliyah"
                />
              </Field>
              <Field label="Kamar" htmlFor="kamar" required hint="Boleh memilih atau mengetik kamar baru.">
                <TextInput
                  id="kamar"
                  list={`${datalistId}-kamar`}
                  value={values.kamar}
                  onChange={(event) => update("kamar", event.target.value)}
                  placeholder="Asrama 3 - Kamar 12"
                />
              </Field>
              <datalist id={`${datalistId}-kelas`}>
                {(opsi?.kelas ?? []).map((kelas) => (
                  <option key={kelas} value={kelas} />
                ))}
              </datalist>
              <datalist id={`${datalistId}-kamar`}>
                {(opsi?.kamar ?? []).map((kamar) => (
                  <option key={kamar} value={kamar} />
                ))}
              </datalist>
              <Field label="Status Mukim" htmlFor="statusMukim" required>
                <SelectInput
                  id="statusMukim"
                  value={values.statusMukim}
                  onChange={(event) => update("statusMukim", event.target.value)}
                >
                  <option value="MUKIM">Mukim (mondok)</option>
                  <option value="NON_MUKIM">Non-mukim (kalong)</option>
                </SelectInput>
              </Field>
              <Field label="Tahun Masuk" htmlFor="tahunMasuk" required>
                <TextInput
                  id="tahunMasuk"
                  type="number"
                  min={1900}
                  max={2200}
                  value={values.tahunMasuk}
                  onChange={(event) => update("tahunMasuk", event.target.value)}
                />
              </Field>
              <Field label="Status Santri" htmlFor="statusSantri">
                <SelectInput
                  id="statusSantri"
                  value={values.statusSantri}
                  onChange={(event) =>
                    update("statusSantri", event.target.value)
                  }
                >
                  <option value="AKTIF">Aktif</option>
                  <option value="ALUMNI">Alumni</option>
                  <option value="PINDAH">Pindah</option>
                  <option value="DROPOUT">Dropout</option>
                </SelectInput>
              </Field>
            </FormSection>

            {values.statusSantri === "ALUMNI" ? (
              <div className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-2">
                <Field label="Tahun Lulus" htmlFor="tahunLulus" required>
                  <TextInput
                    id="tahunLulus"
                    type="number"
                    min={1900}
                    max={2200}
                    value={values.tahunLulus}
                    onChange={(event) =>
                      update("tahunLulus", event.target.value)
                    }
                  />
                </Field>
                <Field label="Nomor Syahadah" htmlFor="nomorSyahadah" required>
                  <TextInput
                    id="nomorSyahadah"
                    value={values.nomorSyahadah}
                    onChange={(event) =>
                      update("nomorSyahadah", event.target.value)
                    }
                    placeholder="SYH/2026/0001"
                  />
                </Field>
              </div>
            ) : null}

            <FormSection
              title="Kartu RFID & Barcode"
              description="Tempel/scan kartu pada kolom RFID; barcode kosong akan dibuat otomatis dari NIS."
              icon={<ScanLine aria-hidden="true" size={18} />}
            >
              <Field
                label="RFID UID"
                htmlFor="rfidUid"
                hint="Kosongkan bila kartu belum tersedia. Huruf otomatis disimpan kapital."
              >
                <TextInput
                  id="rfidUid"
                  value={values.rfidUid}
                  onChange={(event) => update("rfidUid", event.target.value)}
                  placeholder="A1B2C3D4"
                  className="font-mono uppercase tracking-wider"
                  autoComplete="off"
                />
              </Field>
              <Field
                label="Kode Barcode"
                htmlFor="barcodeCode"
                hint="Opsional. Default SANTRI-{NIS}."
              >
                <TextInput
                  id="barcodeCode"
                  value={values.barcodeCode}
                  onChange={(event) => update("barcodeCode", event.target.value)}
                  placeholder="SANTRI-20240012"
                  className="font-mono"
                  autoComplete="off"
                />
              </Field>
              {santri ? (
                <div className="sm:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    <Wallet aria-hidden="true" size={14} />
                    Dompet Custodial
                  </p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-700">
                    {santri.walletAddress}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Saldo jajan {Number(santri.saldoJajan).toLocaleString("id-ID")}{" "}
                    rupiah · tidak dapat ditarik ke SPP/infaq.
                  </p>
                </div>
              ) : null}
            </FormSection>


          </div>
        ) : null}
      </div>
    </Modal>
  );
}
