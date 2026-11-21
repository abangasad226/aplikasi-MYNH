import type { JenisKegiatan, RekapKehadiran } from "@/lib/api-types";

export type Semester = "GANJIL" | "GENAP";
export type KategoriMapel = "SEKOLAH_FORMAL" | "NGAJI_DINIYAH" | "TAHFIDZ";
export type StatusRapor = "DRAFT" | "DITERBITKAN";
export interface PeriodeAkademik { semester: Semester; tahunAjaran: string }
export interface MapelItem {
  id: string;
  kodeMapel: string;
  namaMapel: string;
  kategori: KategoriMapel;
  kkm: number;
  pengampuId: string;
  pengampu: { id: string; namaLengkap: string };
}
export interface AkademikOptions {
  actor: { id: string; name: string; role: string };
  kelas: string[];
  guru: { id: string; namaLengkap: string }[];
}
export interface NilaiInput {
  santriId: string;
  nilaiHarian: number;
  nilaiUTS: number;
  nilaiUAS: number;
  catatanGuru: string | null;
}
export interface NilaiItem extends NilaiInput {
  id: string;
  nilaiAkhir: number;
  predikat: string;
}
export interface SantriAkademik { id: string; nis: string; name: string; kelas: string }
export interface NilaiRow {
  santri: SantriAkademik;
  nilai: NilaiItem | null;
  diterbitkan: boolean;
}
export interface RaporSummary extends PeriodeAkademik {
  id: string;
  statusRapor: StatusRapor;
  tanggalTerbit: string | null;
}
export interface RaporRosterItem {
  santri: SantriAkademik;
  rapor: RaporSummary | null;
}
export interface RaporIsi {
  santri: SantriAkademik & {
    nisn: string | null;
    tempatLahir: string;
    tanggalLahir: string;
    fotoSantriUrl: string | null;
    namaWali: string;
  };
  periode: PeriodeAkademik & { mulai: string; selesai: string };
  nilai: (NilaiItem & { mapel: MapelItem; tuntas: boolean })[];
  absensi: Record<JenisKegiatan, RekapKehadiran>;
  totalAbsensi: RekapKehadiran;
  pelanggaran: {
    tanggal: string;
    kategori: string;
    deskripsi: string;
    poin: number;
    tindakan: string;
  }[];
  totalPoin: number;
}
export interface RaporDetail extends PeriodeAkademik {
  id: string | null;
  statusRapor: StatusRapor;
  catatanWaliKelas: string;
  keputusanKenaikan: string;
  tanggalTerbit: string | null;
  isi: RaporIsi;
}

export const KATEGORI_MAPEL_LABEL: Record<KategoriMapel, string> = {
  SEKOLAH_FORMAL: "Sekolah Formal",
  NGAJI_DINIYAH: "Ngaji Diniyah / Kitab",
  TAHFIDZ: "Tahfidz",
};
export const KEGIATAN_RAPOR_LABEL: Record<JenisKegiatan, string> = {
  SHOLAT_JEMAAH: "Sholat Jemaah",
  NGAJI_KITAB: "Ngaji Kitab",
  TAHFIDZ: "Tahfidz",
  SEKOLAH_FORMAL: "Sekolah Formal",
};
export function periodeSaatIni(): PeriodeAkademik {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const awal = month >= 7 ? year : year - 1;
  return { semester: month >= 7 ? "GANJIL" : "GENAP", tahunAjaran: `${awal}/${awal + 1}` };
}
