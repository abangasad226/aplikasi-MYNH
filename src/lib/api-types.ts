// Tipe respons API yang dipakai bersama oleh halaman client. Semua nilai uang
// dikirim server sebagai string agar BigInt tidak kehilangan presisi di JSON.

export type Web3SyncStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "SYNCED"
  | "FAILED";

export type RoleName =
  | "BENDAHARA"
  | "OPERATOR"
  | "KASIR_KANTIN"
  | "USTADZ_PENGURUS"
  | "WALI_SANTRI";

export type JenisTransaksi =
  | "BAYAR_SPP"
  | "BAYAR_INFAQ_MAKAN"
  | "TOPUP_JAJAN"
  | "REDIRECT_JAJAN_KE_INFAQ"
  | "JAJAN_KANTIN"
  | "PENARIKAN_TUNAI"
  | "REVERSAL_INFAQ_KE_JAJAN";

export type MetodePembayaran =
  | "TRANSFER_VA"
  | "QRIS"
  | "TUNAI_BENDAHARA"
  | "AUTO_SYSTEM";

export type JenisTagihan =
  | "SPP"
  | "INFAQ_MAKAN"
  | "DAFTAR_ULANG"
  | "LAINNYA";

export type StatusTagihan = "BELUM_LUNAS" | "CICILAN" | "LUNAS";

export type JenisKegiatan =
  | "SHOLAT_JEMAAH"
  | "NGAJI_KITAB"
  | "TAHFIDZ"
  | "SEKOLAH_FORMAL";

export type StatusKehadiran = "HADIR" | "IZIN" | "SAKIT" | "ALPA";

export type KategoriPelanggaran = "RINGAN" | "SEDANG" | "BERAT";

export interface PolicySetting {
  key: string;
  value: string | null;
  enabled: boolean;
  valueType: string | null;
  description: string | null;
  updatedAt: string | null;
  updatedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface AdminRingkasanResponse {
  actor: {
    name: string;
    role: RoleName;
  };
  summary: {
    totalSpp: string;
    totalInfaq: string;
    totalInfaqDirect: string;
    totalInfaqRedirect: string;
    totalInfaqReversal: string;
    totalTitipanJajan: string;
    santriAktif: number;
    santriDenganSaldo: number;
    web3: {
      pending: number;
      synced: number;
      failed: number;
      notRequired: number;
      total: number;
    };
  };
  generatedAt: string;
}

export interface AdminPencairanSaldoResponse {
  santri: {
    id: string;
    nis: string;
    name: string;
    statusSantri: StatusSantri;
  };
  transaksi: {
    id: string;
    kodeTransaksi: string;
    jenisTransaksi: "PENARIKAN_TUNAI";
    nominal: string;
    web3Status: string;
  };
  saldoJajanAkhir: string;
}

export interface MutasiItem {
  id: string;
  kodeTransaksi: string;
  santri: {
    id: string;
    name: string;
    nis: string;
  };
  jenisTransaksi: JenisTransaksi;
  nominal: string;
  metodePembayaran: MetodePembayaran;
  keterangan: string | null;
  merchant: {
    namaKantin: string;
  } | null;
  createdBy: {
    name: string;
  };
  createdAt: string;
  web3Status: Web3SyncStatus;
  txHashWeb3: string | null;
  web3LastError: string | null;
  tagihanId: string | null;
  sudahDireversal: boolean;
  reversal: { id: string; kodeTransaksi: string } | null;
  reversalDari: { id: string; kodeTransaksi: string } | null;
}

export interface MutasiResponse {
  items: MutasiItem[];
  generatedAt: string;
}

export interface AdminReversalInfaqResponse {
  transaksi: {
    id: string;
    kodeTransaksi: string;
    jenisTransaksi: JenisTransaksi;
    nominal: string;
    web3Status: Web3SyncStatus;
  };
  transaksiAsalId: string;
  santri: {
    id: string;
    nis: string;
    name: string;
    saldoJajanAkhir: string;
  };
  tagihan: {
    id: string;
    bulan: number;
    tahun: number;
    nominalTerbayar: string;
    status: string;
  };
}

export interface KantinKonteksResponse {
  kasir: {
    id: string;
    name: string;
  };
  merchant: {
    id: string;
    namaKantin: string;
    saldoPendapatan: string;
  };
  hariIni: {
    totalPenjualan: string;
    jumlahTransaksi: number;
  };
}

export interface KantinKartuResponse {
  santri: {
    id: string;
    nis: string;
    name: string;
    kelas: string;
    kamar: string;
  };
  saldoJajan: string;
  limitJajanHarian: string;
  totalJajanHariIni: string;
  sisaLimitHarian: string;
  pinDiperlukan: boolean;
}

export interface TransaksiKantinResponse {
  santri: {
    id: string;
    nis: string;
    name: string;
    kelas: string;
    kamar: string;
  };
  merchant: {
    id: string;
    namaKantin: string;
  };
  transaksi: {
    id: string;
    kodeTransaksi: string;
    nominal: string;
    createdAt: string;
    web3Status: Web3SyncStatus;
  };
  saldoJajanAkhir: string;
  totalJajanHariIni: string;
  sisaLimitHarian: string;
}

export interface WaliChild {
  id: string;
  nis: string;
  name: string;
  kelas: string;
  kamar: string;
  saldoJajan: string;
  statusAktif: boolean;
}

export interface TagihanRingkas {
  id: string;
  jenisTagihan: JenisTagihan;
  bulan: number;
  tahun: number;
  nominalTagihan: string;
  nominalTerbayar: string;
  sisa: string;
  status: StatusTagihan;
  jatuhTempo: string;
}

export interface WaliTransaksi {
  id: string;
  kodeTransaksi: string;
  jenisTransaksi: JenisTransaksi;
  nominal: string;
  metodePembayaran: MetodePembayaran;
  keterangan: string | null;
  merchant: string | null;
  createdAt: string;
  web3Status: Web3SyncStatus;
  txHashWeb3: string | null;
  referensiSetoran: string | null;
}

export interface RekapKehadiran {
  HADIR: number;
  IZIN: number;
  SAKIT: number;
  ALPA: number;
  total: number;
}

export interface WaliAkademikLog {
  id: string;
  tanggal: string;
  jenisKegiatan: JenisKegiatan;
  statusKehadiran: StatusKehadiran;
  catatanUstadz: string;
  nilaiHafalan: number | null;
  createdAt: string;
}

export interface WaliPelanggaran {
  id: string;
  tanggal: string;
  kategori: KategoriPelanggaran;
  deskripsiPelanggaran: string;
  poin: number;
  tindakanPembinaan: string;
  dicatatOleh: string;
  createdAt: string;
}

export interface WaliSelected {
  santri: WaliChild;
  policy: {
    autoRedirectAktif: boolean;
  };
  periode: {
    bulan: number;
    tahun: number;
  };
  tagihanBulanIni: TagihanRingkas[];
  tunggakanInfaq: {
    total: string;
    jumlahTagihan: number;
    tagihan: TagihanRingkas[];
  };
  transaksi: WaliTransaksi[];
  kehadiran: Record<JenisKegiatan, RekapKehadiran>;
  perkembangan: WaliAkademikLog[];
  pelanggaran: WaliPelanggaran[];
  poinBulanIni: number;
  poinTotal: number;
}

export interface WaliDashboardResponse {
  wali: {
    name: string;
    email: string;
  };
  children: WaliChild[];
  selected: WaliSelected | null;
  generatedAt: string;
}

export interface SetoranResult {
  referensiSetoran: string;
  santriId: string;
  nominalSetor: string;
  autoRedirectAktif: boolean;
  totalDialihkanKeInfaq: string;
  totalMasukSaldoJajan: string;
  saldoJajanAkhir: string;
  alokasiInfaq: Array<{
    tagihanId: string;
    bulan: number;
    tahun: number;
    nominal: string;
    status: StatusTagihan;
  }>;
  transaksi: Array<{
    id: string;
    kodeTransaksi: string;
    jenisTransaksi: JenisTransaksi;
    nominal: string;
    web3Status: Web3SyncStatus;
  }>;
}

export interface LoginResponse {
  user: {
    id: string;
    name: string;
    email: string;
    role: RoleName;
  };
}

// ----------------------- MODUL DATA INDUK PESANTREN -------------------------

export type StatusSantri = "AKTIF" | "ALUMNI" | "PINDAH" | "DROPOUT";
export type StatusMukim = "MUKIM" | "NON_MUKIM";
export type JenisKelamin = "LAKI_LAKI" | "PEREMPUAN";
export type StatusHidup = "MASIH_HIDUP" | "MENINGGAL";
export type RentangPenghasilan =
  | "DI_BAWAH_1_JUTA"
  | "SATU_SAMPAI_2_JUTA"
  | "DUA_SAMPAI_5_JUTA"
  | "LIMA_SAMPAI_10_JUTA"
  | "DI_ATAS_10_JUTA";
export type PendidikanTerakhir =
  | "TIDAK_SEKOLAH"
  | "SD"
  | "SMP"
  | "SMA_MA"
  | "D3"
  | "S1"
  | "S2"
  | "S3"
  | "PESANTREN_SALAF";
export type JabatanGuru =
  | "PENGASUH"
  | "KEPALA_MADRASAH"
  | "USTADZ_NGAJI"
  | "GURU_MAPEL"
  | "BENDAHARA"
  | "STAF_TATA_USAHA";
export type StatusKepegawaian = "GTY" | "GTT" | "PNS_DPK" | "PENGABDIAN";
export type JenisMutasiSantri =
  | "KENAIKAN_KELAS"
  | "PINDAH_KAMAR"
  | "KELULUSAN_ALUMNI"
  | "MUTASI_KELUAR";

export interface WaliOption {
  id: string;
  name: string;
  email: string;
}

export interface SantriItem {
  id: string;
  nis: string;
  nik: string;
  nisn: string | null;
  nism: string | null;
  name: string;
  kelas: string;
  kamar: string;
  rfidUid: string | null;
  barcodeCode: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: JenisKelamin;
  alamatLengkap: string;
  rtRw: string | null;
  desaKelurahan: string;
  kecamatan: string;
  kabupatenKota: string;
  provinsi: string;
  nomorKK: string;
  namaAyah: string;
  nikAyah: string | null;
  tempatLahirAyah: string | null;
  tanggalLahirAyah: string | null;
  statusHidupAyah: StatusHidup;
  pendidikanAyah: PendidikanTerakhir | null;
  pekerjaanAyah: string | null;
  penghasilanAyah: RentangPenghasilan | null;
  noHpAyah: string | null;
  namaIbu: string;
  nikIbu: string | null;
  tempatLahirIbu: string | null;
  tanggalLahirIbu: string | null;
  statusHidupIbu: StatusHidup;
  pendidikanIbu: PendidikanTerakhir | null;
  pekerjaanIbu: string | null;
  penghasilanIbu: RentangPenghasilan | null;
  noHpIbu: string | null;
  namaWali: string | null;
  hubunganWali: string | null;
  tempatLahirWali: string | null;
  tanggalLahirWali: string | null;
  pekerjaanWali: string | null;
  penghasilanWali: RentangPenghasilan | null;
  noHpWali: string | null;
  alamatWali: string | null;
  fotoSantriUrl: string | null;
  fileKkUrl: string | null;
  fileAktaUrl: string | null;
  fileIjazahUrl: string | null;
  statusMukim: StatusMukim;
  statusSantri: StatusSantri;
  statusAktif: boolean;
  tahunMasuk: number;
  tahunLulus: number | null;
  nomorSyahadah: string | null;
  saldoJajan: string;
  limitJajanHarian: string;
  isDispensasiInfaq: boolean;
  catatanDispensasi: string | null;
  walletAddress: string;
  wali: WaliOption;
  tunggakanTotal: string;
  bebasTunggakan: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SantriListResponse {
  items: SantriItem[];
  total: number;
  page: number;
  limit: number;
  summary: {
    aktif: number;
    alumni: number;
    belumPairing: number;
  };
  generatedAt: string;
}

export interface OpsiResponse {
  wali: WaliOption[];
  kelas: string[];
  kamar: string[];
  tahunLulus: number[];
}

export interface GuruItem {
  id: string;
  userId: string | null;
  nip: string | null;
  nuptk: string | null;
  npk: string | null;
  nik: string;
  namaLengkap: string;
  gelarDepan: string | null;
  gelarBelakang: string | null;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: JenisKelamin;
  pendidikanTerakhir: PendidikanTerakhir;
  jurusan: string | null;
  jabatan: JabatanGuru;
  statusKepegawaian: StatusKepegawaian;
  mataPelajaranAtauKitab: string | null;
  noHp: string;
  alamat: string;
  statusAktif: boolean;
  tanggalMulaiTugas: string;
  akun: {
    id: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuruListResponse {
  items: GuruItem[];
  total: number;
  page: number;
  limit: number;
  summary: {
    total: number;
    aktif: number;
    gty: number;
    gtt: number;
    pnsDpk: number;
    pengabdian: number;
  };
  generatedAt: string;
}

export interface MutasiMassalResponse {
  mode: "NAIK_KELAS" | "LULUSKAN";
  diproses: number;
  items: Array<{
    id: string;
    nis: string;
    name: string;
    kelas: string;
    statusSantri: StatusSantri;
    tahunLulus: number | null;
    nomorSyahadah: string | null;
  }>;
  peringatanTunggakan: Array<{
    santriId: string;
    name: string;
    tunggakanTotal: string;
  }>;
}

export interface ImportReport {
  jenis: "santri" | "guru";
  totalBaris: number;
  berhasil: number;
  gagal: number;
  errors: Array<{
    baris: number;
    pesan: string;
  }>;
}

export interface SantriMutationResponse {
  item: SantriItem;
}

export interface GuruMutationResponse {
  item: GuruItem;
  akunDibuat: boolean;
}
