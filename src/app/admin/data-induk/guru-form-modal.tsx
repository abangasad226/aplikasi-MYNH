"use client";

import { useState } from "react";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  IdCard,
  KeyRound,
} from "lucide-react";

import { Alert, Badge, Button, Modal } from "@/components/ui";
import type {
  GuruItem,
  GuruMutationResponse,
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
import {
  JABATAN_OPTIONS,
  PENDIDIKAN_OPTIONS,
  STATUS_KEPEGAWAIAN_OPTIONS,
} from "./guru-options";

type StepKey = "IDENTITAS" | "KEPEGAWAIAN" | "AKUN";

const STEPS: Array<{ key: StepKey; label: string }> = [
  { key: "IDENTITAS", label: "Identitas Pribadi" },
  { key: "KEPEGAWAIAN", label: "Kepegawaian" },
  { key: "AKUN", label: "Kontak & Akun" },
];

const fieldNames = [
  "nik",
  "nip",
  "nuptk",
  "npk",
  "namaLengkap",
  "gelarDepan",
  "gelarBelakang",
  "tempatLahir",
  "tanggalLahir",
  "jenisKelamin",
  "pendidikanTerakhir",
  "jurusan",
  "jabatan",
  "statusKepegawaian",
  "mataPelajaranAtauKitab",
  "noHp",
  "alamat",
  "tanggalMulaiTugas",
  "emailAkun",
  "passwordAkun",
] as const;

type FieldName = (typeof fieldNames)[number];
type FormValues = Record<FieldName, string>;

const REQUIRED: Record<StepKey, Array<[FieldName, string]>> = {
  IDENTITAS: [
    ["nik", "NIK"],
    ["namaLengkap", "Nama lengkap"],
    ["tempatLahir", "Tempat lahir"],
    ["tanggalLahir", "Tanggal lahir"],
    ["jenisKelamin", "Jenis kelamin"],
  ],
  KEPEGAWAIAN: [
    ["pendidikanTerakhir", "Pendidikan terakhir"],
    ["jabatan", "Jabatan"],
    ["statusKepegawaian", "Status kepegawaian"],
    ["tanggalMulaiTugas", "Tanggal mulai tugas"],
  ],
  AKUN: [
    ["noHp", "Nomor HP"],
    ["alamat", "Alamat"],
  ],
};

function initialState(guru: GuruItem | null): FormValues {
  return {
    nik: guru?.nik ?? "",
    nip: guru?.nip ?? "",
    nuptk: guru?.nuptk ?? "",
    npk: guru?.npk ?? "",
    namaLengkap: guru?.namaLengkap ?? "",
    gelarDepan: guru?.gelarDepan ?? "",
    gelarBelakang: guru?.gelarBelakang ?? "",
    tempatLahir: guru?.tempatLahir ?? "",
    tanggalLahir: guru?.tanggalLahir ?? "",
    jenisKelamin: guru?.jenisKelamin ?? "LAKI_LAKI",
    pendidikanTerakhir: guru?.pendidikanTerakhir ?? "S1",
    jurusan: guru?.jurusan ?? "",
    jabatan: guru?.jabatan ?? "USTADZ_NGAJI",
    statusKepegawaian: guru?.statusKepegawaian ?? "GTY",
    mataPelajaranAtauKitab: guru?.mataPelajaranAtauKitab ?? "",
    noHp: guru?.noHp ?? "",
    alamat: guru?.alamat ?? "",
    tanggalMulaiTugas:
      guru?.tanggalMulaiTugas ?? new Date().toISOString().slice(0, 10),
    emailAkun: "",
    passwordAkun: "",
  };
}

export function GuruFormModal({
  guru,
  initialStep = "IDENTITAS",
  onClose,
  onSaved,
}: {
  guru: GuruItem | null;
  initialStep?: StepKey;
  onClose: () => void;
  onSaved: (
    item: GuruItem,
    mode: "create" | "edit",
    akunDibuat: boolean,
  ) => void;
}) {
  const mode = guru ? "edit" : "create";
  const hasAccount = Boolean(guru?.akun);
  const [step, setStep] = useState<StepKey>(initialStep);
  const [values, setValues] = useState<FormValues>(() => initialState(guru));
  const [statusAktif, setStatusAktif] = useState(guru?.statusAktif ?? true);
  const [buatAkun, setBuatAkun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stepIndex = STEPS.findIndex((item) => item.key === step);

  const update = (key: FieldName, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const findMissing = (): { step: StepKey; label: string } | null => {
    for (const item of STEPS) {
      const missing = REQUIRED[item.key].find(
        ([key]) => (values[key] ?? "").trim() === "",
      );

      if (missing) {
        return { step: item.key, label: missing[1] };
      }
    }

    if (buatAkun && !hasAccount) {
      if (!values.emailAkun.trim()) {
        return { step: "AKUN", label: "Email akun" };
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.emailAkun.trim())) {
        return { step: "AKUN", label: "email yang valid" };
      }
      if (values.passwordAkun.trim().length < 8) {
        return { step: "AKUN", label: "password minimal 8 karakter" };
      }
    }

    return null;
  };

  const guardStep = (nextStep: StepKey): boolean => {
    const missing = REQUIRED[step].find(
      ([key]) => (values[key] ?? "").trim() === "",
    );

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

    const text = (key: FieldName) => {
      const value = values[key].trim();
      return value === "" ? undefined : value;
    };

    setSaving(true);
    setError(null);

    try {
      const payload = {
        nik: values.nik.trim(),
        nip: text("nip"),
        nuptk: text("nuptk"),
        npk: text("npk"),
        namaLengkap: values.namaLengkap.trim(),
        gelarDepan: text("gelarDepan"),
        gelarBelakang: text("gelarBelakang"),
        tempatLahir: values.tempatLahir.trim(),
        tanggalLahir: values.tanggalLahir,
        jenisKelamin: values.jenisKelamin,
        pendidikanTerakhir: values.pendidikanTerakhir,
        jurusan: text("jurusan"),
        jabatan: values.jabatan,
        statusKepegawaian: values.statusKepegawaian,
        mataPelajaranAtauKitab: text("mataPelajaranAtauKitab"),
        noHp: values.noHp.trim(),
        alamat: values.alamat.trim(),
        statusAktif,
        tanggalMulaiTugas: values.tanggalMulaiTugas,
        buatAkun: buatAkun && !hasAccount,
        ...(buatAkun && !hasAccount
          ? {
              emailAkun: values.emailAkun.trim(),
              passwordAkun: values.passwordAkun,
            }
          : {}),
      };

      const response =
        mode === "create"
          ? await apiFetch<GuruMutationResponse>("/api/operator/guru", {
              method: "POST",
              body: JSON.stringify(payload),
            })
          : await apiFetch<GuruMutationResponse>(
              `/api/operator/guru/${guru?.id}`,
              { method: "PUT", body: JSON.stringify(payload) },
            );

      onSaved(response.item, mode, response.akunDibuat);
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
            {mode === "create" ? "Simpan Data Guru" : "Simpan Perubahan"}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open
      onClose={saving ? () => undefined : onClose}
      size="xl"
      title={mode === "create" ? "Tambah Guru / Tenaga Kependidikan" : "Edit Data Guru"}
      description="Data guru dan ustadz sesuai pendataan resmi pesantren."
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
            description="Nama dan gelar akan tampil di direktori guru & ustadz serta jurnal ngaji."
            icon={<IdCard aria-hidden="true" size={18} />}
          >
            <Field label="Nama Lengkap" htmlFor="namaLengkapGuru" required>
              <TextInput
                id="namaLengkapGuru"
                value={values.namaLengkap}
                onChange={(event) => update("namaLengkap", event.target.value)}
                placeholder="Hasan Basri"
              />
            </Field>
            <Field label="NIK" htmlFor="nikGuru" required hint="16 digit angka.">
              <TextInput
                id="nikGuru"
                value={values.nik}
                onChange={(event) => update("nik", event.target.value)}
                inputMode="numeric"
                maxLength={16}
              />
            </Field>
            <Field label="Gelar Depan" htmlFor="gelarDepan">
              <TextInput
                id="gelarDepan"
                value={values.gelarDepan}
                onChange={(event) => update("gelarDepan", event.target.value)}
                placeholder="KH."
              />
            </Field>
            <Field label="Gelar Belakang" htmlFor="gelarBelakang">
              <TextInput
                id="gelarBelakang"
                value={values.gelarBelakang}
                onChange={(event) => update("gelarBelakang", event.target.value)}
                placeholder="S.Pd.I"
              />
            </Field>
            <Field label="Jenis Kelamin" htmlFor="jenisKelaminGuru" required>
              <SelectInput
                id="jenisKelaminGuru"
                value={values.jenisKelamin}
                onChange={(event) => update("jenisKelamin", event.target.value)}
              >
                <option value="LAKI_LAKI">Laki-laki</option>
                <option value="PEREMPUAN">Perempuan</option>
              </SelectInput>
            </Field>
            <Field label="Tempat Lahir" htmlFor="tempatLahirGuru" required>
              <TextInput
                id="tempatLahirGuru"
                value={values.tempatLahir}
                onChange={(event) => update("tempatLahir", event.target.value)}
              />
            </Field>
            <Field label="Tanggal Lahir" htmlFor="tanggalLahirGuru" required>
              <TextInput
                id="tanggalLahirGuru"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={values.tanggalLahir}
                onChange={(event) => update("tanggalLahir", event.target.value)}
              />
            </Field>
          </FormSection>
        ) : null}

        {step === "KEPEGAWAIAN" ? (
          <FormSection
            title="Data Kepegawaian & Kompetensi"
            description="NIP/NUPTK/NPK untuk administrasi yayasan."
            icon={<Briefcase aria-hidden="true" size={18} />}
          >
            <Field label="NIP" htmlFor="nipGuru" hint="Opsional.">
              <TextInput
                id="nipGuru"
                value={values.nip}
                onChange={(event) => update("nip", event.target.value)}
              />
            </Field>
            <Field label="NUPTK" htmlFor="nuptkGuru" hint="Opsional, 16 digit.">
              <TextInput
                id="nuptkGuru"
                value={values.nuptk}
                onChange={(event) => update("nuptk", event.target.value)}
                inputMode="numeric"
                maxLength={16}
              />
            </Field>
            <Field label="NPK" htmlFor="npkGuru" hint="Nomor Pokok Karyawan yayasan.">
              <TextInput
                id="npkGuru"
                value={values.npk}
                onChange={(event) => update("npk", event.target.value)}
              />
            </Field>
            <Field label="Pendidikan Terakhir" htmlFor="pendidikan" required>
              <SelectInput
                id="pendidikan"
                value={values.pendidikanTerakhir}
                onChange={(event) =>
                  update("pendidikanTerakhir", event.target.value)
                }
              >
                {PENDIDIKAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Jurusan" htmlFor="jurusanGuru">
              <TextInput
                id="jurusanGuru"
                value={values.jurusan}
                onChange={(event) => update("jurusan", event.target.value)}
                placeholder="Pendidikan Agama Islam"
              />
            </Field>
            <Field label="Jabatan" htmlFor="jabatanGuru" required>
              <SelectInput
                id="jabatanGuru"
                value={values.jabatan}
                onChange={(event) => update("jabatan", event.target.value)}
              >
                {JABATAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Status Kepegawaian" htmlFor="statusKepegawaian" required>
              <SelectInput
                id="statusKepegawaian"
                value={values.statusKepegawaian}
                onChange={(event) =>
                  update("statusKepegawaian", event.target.value)
                }
              >
                {STATUS_KEPEGAWAIAN_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Tanggal Mulai Tugas" htmlFor="tanggalMulaiTugas" required>
              <TextInput
                id="tanggalMulaiTugas"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={values.tanggalMulaiTugas}
                onChange={(event) =>
                  update("tanggalMulaiTugas", event.target.value)
                }
              />
            </Field>
            <Field
              label="Mapel / Kitab yang Diampu"
              htmlFor="mapelGuru"
              className="sm:col-span-2"
              hint="Contoh: Fiqih, Nahwu, Al-Qur'an, Matematika."
            >
              <TextInput
                id="mapelGuru"
                value={values.mataPelajaranAtauKitab}
                onChange={(event) =>
                  update("mataPelajaranAtauKitab", event.target.value)
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={statusAktif}
                onChange={(event) => setStatusAktif(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              Masih aktif bertugas
            </label>
          </FormSection>
        ) : null}

        {step === "AKUN" ? (
          <div className="space-y-4">
            <FormSection
              title="Kontak & Akun Login"
              description="Akun login hanya untuk Ustadz Pengurus agar dapat mengisi absensi ngaji dan pelanggaran."
              icon={<KeyRound aria-hidden="true" size={18} />}
            >
              <Field label="Nomor HP" htmlFor="noHpGuru" required>
                <TextInput
                  id="noHpGuru"
                  value={values.noHp}
                  onChange={(event) => update("noHp", event.target.value)}
                  placeholder="0812xxxxxxx"
                  inputMode="tel"
                />
              </Field>
              <Field
                label="Alamat"
                htmlFor="alamatGuru"
                required
                className="sm:col-span-2"
              >
                <TextAreaInput
                  id="alamatGuru"
                  value={values.alamat}
                  onChange={(event) => update("alamat", event.target.value)}
                />
              </Field>
            </FormSection>

            {hasAccount ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                  <CheckCircle2 aria-hidden="true" size={16} />
                  Akun login sudah aktif
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone="emerald">{guru?.akun?.email}</Badge>
                  <Badge tone="teal">Role Ustadz Pengurus</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-emerald-700">
                  Email dan role akun tidak dapat diubah dari formulir ini.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={buatAkun}
                    onChange={(event) => setBuatAkun(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-800">
                      Buat akun login untuk ustadz ini
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                      Akun otomatis diberi role USTADZ_PENGURUS sehingga dapat
                      mengakses absensi ngaji dan monitoring pelanggaran.
                    </span>
                  </span>
                </label>

                {buatAkun ? (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Email Akun" htmlFor="emailAkun" required>
                      <TextInput
                        id="emailAkun"
                        type="email"
                        value={values.emailAkun}
                        onChange={(event) =>
                          update("emailAkun", event.target.value)
                        }
                        placeholder="ustadz@pesantren.test"
                        autoComplete="off"
                      />
                    </Field>
                    <Field
                      label="Password Awal"
                      htmlFor="passwordAkun"
                      required
                      hint="Minimal 8 karakter. Minta pengguna mengganti setelah login."
                    >
                      <TextInput
                        id="passwordAkun"
                        type="password"
                        value={values.passwordAkun}
                        onChange={(event) =>
                          update("passwordAkun", event.target.value)
                        }
                        autoComplete="new-password"
                      />
                    </Field>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
