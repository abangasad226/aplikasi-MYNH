export const PENDIDIKAN_OPTIONS = [
  { value: "SMA_MA", label: "SMA / MA sederajat" },
  { value: "D3", label: "Diploma 3 (D3)" },
  { value: "S1", label: "Sarjana (S1)" },
  { value: "S2", label: "Magister (S2)" },
  { value: "S3", label: "Doktor (S3)" },
  { value: "PESANTREN_SALAF", label: "Pesantren Salaf" },
] as const;

export const JABATAN_OPTIONS = [
  { value: "PENGASUH", label: "Pengasuh" },
  { value: "KEPALA_MADRASAH", label: "Kepala Madrasah" },
  { value: "USTADZ_NGAJI", label: "Ustadz Pengajar Kitab" },
  { value: "GURU_MAPEL", label: "Guru Mata Pelajaran" },
  { value: "BENDAHARA", label: "Bendahara" },
  { value: "STAF_TATA_USAHA", label: "Staf Tata Usaha" },
] as const;

export const STATUS_KEPEGAWAIAN_OPTIONS = [
  { value: "GTY", label: "GTY — Guru Tetap Yayasan" },
  { value: "GTT", label: "GTT — Guru Tidak Tetap" },
  { value: "PNS_DPK", label: "PNS / DPK" },
  { value: "PENGABDIAN", label: "Pengabdian" },
] as const;

export const JABATAN_LABEL: Record<string, string> = Object.fromEntries(
  JABATAN_OPTIONS.map((option) => [option.value, option.label]),
);

export const STATUS_KEPEGAWAIAN_LABEL: Record<string, string> =
  Object.fromEntries(
    STATUS_KEPEGAWAIAN_OPTIONS.map((option) => [option.value, option.label]),
  );

export const JABATAN_BADGE_TONE: Record<
  string,
  "emerald" | "teal" | "amber" | "violet" | "blue" | "slate"
> = {
  PENGASUH: "emerald",
  KEPALA_MADRASAH: "teal",
  USTADZ_NGAJI: "violet",
  GURU_MAPEL: "blue",
  BENDAHARA: "amber",
  STAF_TATA_USAHA: "slate",
};
