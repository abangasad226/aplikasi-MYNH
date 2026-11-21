-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'BENDAHARA', 'KASIR_KANTIN', 'USTADZ_PENGURUS', 'WALI_SANTRI');

-- CreateEnum
CREATE TYPE "JenisTagihan" AS ENUM ('SPP', 'INFAQ_MAKAN', 'DAFTAR_ULANG', 'LAINNYA');

-- CreateEnum
CREATE TYPE "StatusTagihan" AS ENUM ('BELUM_LUNAS', 'CICILAN', 'LUNAS');

-- CreateEnum
CREATE TYPE "JenisTransaksi" AS ENUM ('BAYAR_SPP', 'BAYAR_INFAQ_MAKAN', 'TOPUP_JAJAN', 'REDIRECT_JAJAN_KE_INFAQ', 'JAJAN_KANTIN', 'PENARIKAN_TUNAI');

-- CreateEnum
CREATE TYPE "MetodePembayaran" AS ENUM ('TRANSFER_VA', 'QRIS', 'TUNAI_BENDAHARA', 'AUTO_SYSTEM');

-- CreateEnum
CREATE TYPE "JenisKegiatan" AS ENUM ('SHOLAT_JEMAAH', 'NGAJI_KITAB', 'TAHFIDZ', 'SEKOLAH_FORMAL');

-- CreateEnum
CREATE TYPE "StatusKehadiran" AS ENUM ('HADIR', 'IZIN', 'SAKIT', 'ALPA');

-- CreateEnum
CREATE TYPE "KategoriPelanggaran" AS ENUM ('RINGAN', 'SEDANG', 'BERAT');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('STRING', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "Web3SyncStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "JenisKelamin" AS ENUM ('LAKI_LAKI', 'PEREMPUAN');

-- CreateEnum
CREATE TYPE "StatusMukim" AS ENUM ('MUKIM', 'NON_MUKIM');

-- CreateEnum
CREATE TYPE "StatusSantri" AS ENUM ('AKTIF', 'ALUMNI', 'PINDAH', 'DROPOUT');

-- CreateEnum
CREATE TYPE "PendidikanTerakhir" AS ENUM ('SMA_MA', 'D3', 'S1', 'S2', 'S3', 'PESANTREN_SALAF');

-- CreateEnum
CREATE TYPE "JabatanGtk" AS ENUM ('PENGASUH', 'KEPALA_MADRASAH', 'USTADZ_NGAJI', 'GURU_MAPEL', 'BENDAHARA', 'OPERATOR_EMIS', 'STAF_TATA_USAHA');

-- CreateEnum
CREATE TYPE "StatusKepegawaian" AS ENUM ('GTY', 'GTT', 'PNS_DPK', 'PENGABDIAN');

-- CreateEnum
CREATE TYPE "JenisMutasiSantri" AS ENUM ('KENAIKAN_KELAS', 'PINDAH_KAMAR', 'KELULUSAN_ALUMNI', 'MUTASI_KELUAR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "walletAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Santri" (
    "id" TEXT NOT NULL,
    "nis" TEXT NOT NULL,
    "rfidUid" TEXT,
    "barcodeCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kelas" TEXT NOT NULL,
    "kamar" TEXT NOT NULL,
    "statusAktif" BOOLEAN NOT NULL DEFAULT true,
    "waliId" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "walletIndex" INTEGER NOT NULL,
    "saldoJajan" BIGINT NOT NULL DEFAULT 0,
    "limitJajanHarian" BIGINT NOT NULL DEFAULT 15000,
    "pinHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nik" TEXT NOT NULL,
    "nisn" TEXT,
    "nism" TEXT,
    "tempatLahir" TEXT NOT NULL,
    "tanggalLahir" DATE NOT NULL,
    "jenisKelamin" "JenisKelamin" NOT NULL,
    "alamatLengkap" TEXT NOT NULL,
    "rtRw" TEXT,
    "desaKelurahan" TEXT NOT NULL,
    "kecamatan" TEXT NOT NULL,
    "kabupatenKota" TEXT NOT NULL,
    "provinsi" TEXT NOT NULL,
    "nomorKK" TEXT NOT NULL,
    "namaAyah" TEXT NOT NULL,
    "nikAyah" TEXT,
    "pekerjaanAyah" TEXT,
    "namaIbu" TEXT NOT NULL,
    "nikIbu" TEXT,
    "pekerjaanIbu" TEXT,
    "statusMukim" "StatusMukim" NOT NULL DEFAULT 'MUKIM',
    "statusSantri" "StatusSantri" NOT NULL DEFAULT 'AKTIF',
    "tahunMasuk" INTEGER NOT NULL,
    "tahunLulus" INTEGER,
    "nomorSyahadah" TEXT,

    CONSTRAINT "Santri_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" "SettingValueType" NOT NULL DEFAULT 'STRING',
    "description" TEXT,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tagihan" (
    "id" TEXT NOT NULL,
    "santriId" TEXT NOT NULL,
    "jenisTagihan" "JenisTagihan" NOT NULL,
    "bulan" INTEGER NOT NULL,
    "tahun" INTEGER NOT NULL,
    "nominalTagihan" BIGINT NOT NULL,
    "nominalTerbayar" BIGINT NOT NULL DEFAULT 0,
    "status" "StatusTagihan" NOT NULL DEFAULT 'BELUM_LUNAS',
    "jatuhTempo" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tagihan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransaksiKeuangan" (
    "id" TEXT NOT NULL,
    "kodeTransaksi" TEXT NOT NULL,
    "santriId" TEXT NOT NULL,
    "jenisTransaksi" "JenisTransaksi" NOT NULL,
    "nominal" BIGINT NOT NULL,
    "metodePembayaran" "MetodePembayaran" NOT NULL,
    "keterangan" TEXT,
    "txHashWeb3" TEXT,
    "web3Status" "Web3SyncStatus" NOT NULL DEFAULT 'PENDING',
    "web3Attempts" INTEGER NOT NULL DEFAULT 0,
    "web3LastError" TEXT,
    "web3SyncedAt" TIMESTAMP(3),
    "merchantId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransaksiKeuangan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantKantin" (
    "id" TEXT NOT NULL,
    "namaKantin" TEXT NOT NULL,
    "pemilikUserId" TEXT NOT NULL,
    "saldoPendapatan" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantKantin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAkademikDanNgaji" (
    "id" TEXT NOT NULL,
    "santriId" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "jenisKegiatan" "JenisKegiatan" NOT NULL,
    "statusKehadiran" "StatusKehadiran" NOT NULL,
    "catatanUstadz" TEXT NOT NULL,
    "nilaiHafalan" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAkademikDanNgaji_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogPelanggaran" (
    "id" TEXT NOT NULL,
    "santriId" TEXT NOT NULL,
    "tanggal" DATE NOT NULL,
    "kategori" "KategoriPelanggaran" NOT NULL,
    "deskripsiPelanggaran" TEXT NOT NULL,
    "poin" INTEGER NOT NULL,
    "tindakanPembinaan" TEXT NOT NULL,
    "dicatatOlehId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogPelanggaran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuruDanTendik" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "nip" TEXT,
    "nuptk" TEXT,
    "npk" TEXT,
    "nik" TEXT NOT NULL,
    "namaLengkap" TEXT NOT NULL,
    "gelarDepan" TEXT,
    "gelarBelakang" TEXT,
    "tempatLahir" TEXT NOT NULL,
    "tanggalLahir" DATE NOT NULL,
    "jenisKelamin" "JenisKelamin" NOT NULL,
    "pendidikanTerakhir" "PendidikanTerakhir" NOT NULL,
    "jurusan" TEXT,
    "jabatan" "JabatanGtk" NOT NULL,
    "statusKepegawaian" "StatusKepegawaian" NOT NULL,
    "mataPelajaranAtauKitab" TEXT,
    "noHp" TEXT NOT NULL,
    "alamat" TEXT NOT NULL,
    "statusAktif" BOOLEAN NOT NULL DEFAULT true,
    "tanggalMulaiTugas" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuruDanTendik_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiwayatMutasiSantri" (
    "id" TEXT NOT NULL,
    "santriId" TEXT NOT NULL,
    "jenisMutasi" "JenisMutasiSantri" NOT NULL,
    "keterangan" TEXT NOT NULL,
    "tanggalMutasi" DATE NOT NULL,
    "dicatatOleh" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiwayatMutasiSantri_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_walletAddress_key" ON "User"("walletAddress");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Santri_nis_key" ON "Santri"("nis");

-- CreateIndex
CREATE UNIQUE INDEX "Santri_rfidUid_key" ON "Santri"("rfidUid");

-- CreateIndex
CREATE UNIQUE INDEX "Santri_barcodeCode_key" ON "Santri"("barcodeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Santri_walletAddress_key" ON "Santri"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Santri_walletIndex_key" ON "Santri"("walletIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Santri_nik_key" ON "Santri"("nik");

-- CreateIndex
CREATE UNIQUE INDEX "Santri_nisn_key" ON "Santri"("nisn");

-- CreateIndex
CREATE INDEX "Santri_waliId_idx" ON "Santri"("waliId");

-- CreateIndex
CREATE INDEX "Santri_statusAktif_idx" ON "Santri"("statusAktif");

-- CreateIndex
CREATE INDEX "Santri_statusSantri_idx" ON "Santri"("statusSantri");

-- CreateIndex
CREATE INDEX "Santri_tahunMasuk_tahunLulus_idx" ON "Santri"("tahunMasuk", "tahunLulus");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "SystemSetting_updatedById_idx" ON "SystemSetting"("updatedById");

-- CreateIndex
CREATE INDEX "Tagihan_santriId_status_idx" ON "Tagihan"("santriId", "status");

-- CreateIndex
CREATE INDEX "Tagihan_status_jatuhTempo_idx" ON "Tagihan"("status", "jatuhTempo");

-- CreateIndex
CREATE INDEX "Tagihan_tahun_bulan_idx" ON "Tagihan"("tahun", "bulan");

-- CreateIndex
CREATE UNIQUE INDEX "TransaksiKeuangan_kodeTransaksi_key" ON "TransaksiKeuangan"("kodeTransaksi");

-- CreateIndex
CREATE UNIQUE INDEX "TransaksiKeuangan_txHashWeb3_key" ON "TransaksiKeuangan"("txHashWeb3");

-- CreateIndex
CREATE INDEX "TransaksiKeuangan_santriId_createdAt_idx" ON "TransaksiKeuangan"("santriId", "createdAt");

-- CreateIndex
CREATE INDEX "TransaksiKeuangan_santriId_merchantId_createdAt_idx" ON "TransaksiKeuangan"("santriId", "merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "TransaksiKeuangan_santriId_jenisTransaksi_createdAt_idx" ON "TransaksiKeuangan"("santriId", "jenisTransaksi", "createdAt");

-- CreateIndex
CREATE INDEX "TransaksiKeuangan_jenisTransaksi_createdAt_idx" ON "TransaksiKeuangan"("jenisTransaksi", "createdAt");

-- CreateIndex
CREATE INDEX "TransaksiKeuangan_createdById_idx" ON "TransaksiKeuangan"("createdById");

-- CreateIndex
CREATE INDEX "TransaksiKeuangan_web3Status_createdAt_idx" ON "TransaksiKeuangan"("web3Status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantKantin_pemilikUserId_key" ON "MerchantKantin"("pemilikUserId");

-- CreateIndex
CREATE INDEX "LogAkademikDanNgaji_santriId_tanggal_idx" ON "LogAkademikDanNgaji"("santriId", "tanggal");

-- CreateIndex
CREATE INDEX "LogAkademikDanNgaji_santriId_jenisKegiatan_createdAt_idx" ON "LogAkademikDanNgaji"("santriId", "jenisKegiatan", "createdAt");

-- CreateIndex
CREATE INDEX "LogAkademikDanNgaji_jenisKegiatan_tanggal_idx" ON "LogAkademikDanNgaji"("jenisKegiatan", "tanggal");

-- CreateIndex
CREATE INDEX "LogPelanggaran_santriId_tanggal_idx" ON "LogPelanggaran"("santriId", "tanggal");

-- CreateIndex
CREATE INDEX "LogPelanggaran_santriId_createdAt_idx" ON "LogPelanggaran"("santriId", "createdAt");

-- CreateIndex
CREATE INDEX "LogPelanggaran_kategori_idx" ON "LogPelanggaran"("kategori");

-- CreateIndex
CREATE INDEX "LogPelanggaran_dicatatOlehId_idx" ON "LogPelanggaran"("dicatatOlehId");

-- CreateIndex
CREATE UNIQUE INDEX "GuruDanTendik_userId_key" ON "GuruDanTendik"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GuruDanTendik_nip_key" ON "GuruDanTendik"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "GuruDanTendik_nuptk_key" ON "GuruDanTendik"("nuptk");

-- CreateIndex
CREATE UNIQUE INDEX "GuruDanTendik_npk_key" ON "GuruDanTendik"("npk");

-- CreateIndex
CREATE UNIQUE INDEX "GuruDanTendik_nik_key" ON "GuruDanTendik"("nik");

-- CreateIndex
CREATE INDEX "GuruDanTendik_jabatan_idx" ON "GuruDanTendik"("jabatan");

-- CreateIndex
CREATE INDEX "GuruDanTendik_statusKepegawaian_idx" ON "GuruDanTendik"("statusKepegawaian");

-- CreateIndex
CREATE INDEX "GuruDanTendik_statusAktif_idx" ON "GuruDanTendik"("statusAktif");

-- CreateIndex
CREATE INDEX "GuruDanTendik_namaLengkap_idx" ON "GuruDanTendik"("namaLengkap");

-- CreateIndex
CREATE INDEX "RiwayatMutasiSantri_santriId_tanggalMutasi_idx" ON "RiwayatMutasiSantri"("santriId", "tanggalMutasi");

-- CreateIndex
CREATE INDEX "RiwayatMutasiSantri_jenisMutasi_tanggalMutasi_idx" ON "RiwayatMutasiSantri"("jenisMutasi", "tanggalMutasi");

-- AddForeignKey
ALTER TABLE "Santri" ADD CONSTRAINT "Santri_waliId_fkey" FOREIGN KEY ("waliId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tagihan" ADD CONSTRAINT "Tagihan_santriId_fkey" FOREIGN KEY ("santriId") REFERENCES "Santri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransaksiKeuangan" ADD CONSTRAINT "TransaksiKeuangan_santriId_fkey" FOREIGN KEY ("santriId") REFERENCES "Santri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransaksiKeuangan" ADD CONSTRAINT "TransaksiKeuangan_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "MerchantKantin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransaksiKeuangan" ADD CONSTRAINT "TransaksiKeuangan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantKantin" ADD CONSTRAINT "MerchantKantin_pemilikUserId_fkey" FOREIGN KEY ("pemilikUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogAkademikDanNgaji" ADD CONSTRAINT "LogAkademikDanNgaji_santriId_fkey" FOREIGN KEY ("santriId") REFERENCES "Santri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogPelanggaran" ADD CONSTRAINT "LogPelanggaran_santriId_fkey" FOREIGN KEY ("santriId") REFERENCES "Santri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogPelanggaran" ADD CONSTRAINT "LogPelanggaran_dicatatOlehId_fkey" FOREIGN KEY ("dicatatOlehId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuruDanTendik" ADD CONSTRAINT "GuruDanTendik_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiwayatMutasiSantri" ADD CONSTRAINT "RiwayatMutasiSantri_santriId_fkey" FOREIGN KEY ("santriId") REFERENCES "Santri"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

