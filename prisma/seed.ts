import "dotenv/config";

import {
  JabatanGtk,
  JenisKelamin,
  JenisMutasiSantri,
  JenisTagihan,
  PendidikanTerakhir,
  PrismaClient,
  Role,
  SettingValueType,
  StatusKepegawaian,
  StatusMukim,
  StatusSantri,
  StatusTagihan,
} from "@prisma/client";
import bcrypt from "bcryptjs";

import { deriveCustodialWallet } from "../src/lib/web3/custodial-wallet";

const prisma = new PrismaClient();

// Mnemonic bawaan Hardhat. Hanya untuk development; produksi wajib memakai env.
const DEV_MNEMONIC =
  "test test test test test test test test test test test junk";
const SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Pesantren#2026";
const SANTRI_WALLET_INDEX = 0;
const ALUMNI_WALLET_INDEX = 1;

async function ensureRiwayatMutasi(data: {
  santriId: string;
  jenisMutasi: JenisMutasiSantri;
  keterangan: string;
  tanggalMutasi: Date;
  dicatatOleh: string;
}) {
  const existing = await prisma.riwayatMutasiSantri.findFirst({
    where: {
      santriId: data.santriId,
      jenisMutasi: data.jenisMutasi,
      tanggalMutasi: data.tanggalMutasi,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.riwayatMutasiSantri.create({ data });
}

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 12);

  const bendahara = await prisma.user.upsert({
    where: { email: "bendahara@pesantren.test" },
    update: {
      name: "Bendahara Yayasan",
      role: Role.BENDAHARA,
      passwordHash,
    },
    create: {
      email: "bendahara@pesantren.test",
      name: "Bendahara Yayasan",
      role: Role.BENDAHARA,
      phone: "081200000002",
      passwordHash,
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: "operator@pesantren.test" },
    update: {
      name: "Operator Pesantren",
      role: Role.OPERATOR,
      passwordHash,
    },
    create: {
      email: "operator@pesantren.test",
      name: "Operator Pesantren",
      role: Role.OPERATOR,
      phone: "081200000007",
      passwordHash,
    },
  });

  const wali = await prisma.user.upsert({
    where: { email: "wali@pesantren.test" },
    update: {
      name: "Bapak Ahmad Subarjo",
      role: Role.WALI_SANTRI,
      passwordHash,
    },
    create: {
      email: "wali@pesantren.test",
      name: "Bapak Ahmad Subarjo",
      role: Role.WALI_SANTRI,
      phone: "081200000003",
      passwordHash,
    },
  });

  const kasir = await prisma.user.upsert({
    where: { email: "kasir@pesantren.test" },
    update: {
      name: "Ibu Siti Kasir",
      role: Role.KASIR_KANTIN,
      passwordHash,
    },
    create: {
      email: "kasir@pesantren.test",
      name: "Ibu Siti Kasir",
      role: Role.KASIR_KANTIN,
      phone: "081200000004",
      passwordHash,
    },
  });

  const merchant = await prisma.merchantKantin.upsert({
    where: { pemilikUserId: kasir.id },
    update: { namaKantin: "Kantin Barokah" },
    create: {
      namaKantin: "Kantin Barokah",
      pemilikUserId: kasir.id,
    },
  });

  const ustadz = await prisma.user.upsert({
    where: { email: "ustadz@pesantren.test" },
    update: {
      name: "Ustadz Hasan",
      role: Role.USTADZ_PENGURUS,
      passwordHash,
    },
    create: {
      email: "ustadz@pesantren.test",
      name: "Ustadz Hasan",
      role: Role.USTADZ_PENGURUS,
      phone: "081200000005",
      passwordHash,
    },
  });

  const masterMnemonic =
    process.env.CUSTODIAL_MASTER_MNEMONIC ?? DEV_MNEMONIC;
  const santriWallet = deriveCustodialWallet(
    SANTRI_WALLET_INDEX,
    masterMnemonic,
  );

  const santri = await prisma.santri.upsert({
    where: { nis: "20260001" },
    update: {
      name: "Ahmad Fauzan",
      kelas: "7A",
      kamar: "Asrama Al-Fatih 01",
      statusAktif: true,
      statusSantri: StatusSantri.AKTIF,
      statusMukim: StatusMukim.MUKIM,
      waliId: wali.id,
      walletAddress: santriWallet.address,
      walletIndex: SANTRI_WALLET_INDEX,
      nik: "3507010107100004",
      nisn: "0109876543",
      nism: "2026001234",
      tempatLahir: "Magetan",
      tanggalLahir: new Date(Date.UTC(2010, 6, 1)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      alamatLengkap: "Jl. Raya Ponorogo No. 12",
      rtRw: "002/004",
      desaKelurahan: "Mranggen",
      kecamatan: "Geger",
      kabupatenKota: "Madiun",
      provinsi: "Jawa Timur",
      nomorKK: "3507011203080001",
      namaAyah: "Ahmad Subarjo",
      nikAyah: "3507010107850001",
      pekerjaanAyah: "Pedagang",
      namaIbu: "Siti Aminah",
      nikIbu: "3507011507880002",
      pekerjaanIbu: "Ibu Rumah Tangga",
      tahunMasuk: 2026,
      tahunLulus: null,
      nomorSyahadah: null,
    },
    create: {
      nis: "20260001",
      rfidUid: "04A1B2C3D4E5F6",
      barcodeCode: "SANTRI-20260001",
      name: "Ahmad Fauzan",
      kelas: "7A",
      kamar: "Asrama Al-Fatih 01",
      statusAktif: true,
      statusSantri: StatusSantri.AKTIF,
      statusMukim: StatusMukim.MUKIM,
      waliId: wali.id,
      walletAddress: santriWallet.address,
      walletIndex: SANTRI_WALLET_INDEX,
      saldoJajan: 0n,
      limitJajanHarian: 15_000n,
      // ---- Identitas santri ----
      nik: "3507010107100004",
      nisn: "0109876543",
      nism: "2026001234",
      tempatLahir: "Magetan",
      tanggalLahir: new Date(Date.UTC(2010, 6, 1)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      // ---- Domisili ----
      alamatLengkap: "Jl. Raya Ponorogo No. 12",
      rtRw: "002/004",
      desaKelurahan: "Mranggen",
      kecamatan: "Geger",
      kabupatenKota: "Madiun",
      provinsi: "Jawa Timur",
      // ---- Data orang tua ----
      nomorKK: "3507011203080001",
      namaAyah: "Ahmad Subarjo",
      nikAyah: "3507010107850001",
      pekerjaanAyah: "Pedagang",
      namaIbu: "Siti Aminah",
      nikIbu: "3507011507880002",
      pekerjaanIbu: "Ibu Rumah Tangga",
      // ---- Status kepesantrenan ----
      tahunMasuk: 2026,
    },
  });

  // Contoh alumni: statusAktif false agar tidak muncul di daftar santri aktif
  // dan tidak bisa bertransaksi di kantin, tetapi riwayatnya tetap utuh.
  const alumniWallet = deriveCustodialWallet(
    ALUMNI_WALLET_INDEX,
    masterMnemonic,
  );

  const alumni = await prisma.santri.upsert({
    where: { nis: "20230001" },
    update: {
      name: "Muhammad Ridho",
      kelas: "12 MA",
      kamar: "Asrama Al-Farabi 02",
      statusAktif: false,
      statusSantri: StatusSantri.ALUMNI,
      statusMukim: StatusMukim.NON_MUKIM,
      waliId: wali.id,
      walletAddress: alumniWallet.address,
      walletIndex: ALUMNI_WALLET_INDEX,
      nik: "3507031005080003",
      nisn: "0091234567",
      nism: "2020000456",
      tempatLahir: "Ponorogo",
      tanggalLahir: new Date(Date.UTC(2008, 4, 10)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      alamatLengkap: "Jl. KH. Wahid Hasyim No. 45",
      rtRw: "001/002",
      desaKelurahan: "Nologaten",
      kecamatan: "Ponorogo",
      kabupatenKota: "Ponorogo",
      provinsi: "Jawa Timur",
      nomorKK: "3507032205080002",
      namaAyah: "Ahmad Subarjo",
      nikAyah: "3507010107850001",
      pekerjaanAyah: "Pedagang",
      namaIbu: "Siti Aminah",
      nikIbu: "3507011507880002",
      pekerjaanIbu: "Ibu Rumah Tangga",
      tahunMasuk: 2020,
      tahunLulus: 2026,
      nomorSyahadah: "SYH/PDM/2026/0007",
    },
    create: {
      nis: "20230001",
      // Kartu RFID sengaja tidak diisi: kartu alumni sudah ditarik saat lulus.
      rfidUid: null,
      barcodeCode: "SANTRI-20230001",
      name: "Muhammad Ridho",
      kelas: "12 MA",
      kamar: "Asrama Al-Farabi 02",
      statusAktif: false,
      statusSantri: StatusSantri.ALUMNI,
      statusMukim: StatusMukim.NON_MUKIM,
      waliId: wali.id,
      walletAddress: alumniWallet.address,
      walletIndex: ALUMNI_WALLET_INDEX,
      saldoJajan: 0n,
      limitJajanHarian: 15_000n,
      nik: "3507031005080003",
      nisn: "0091234567",
      nism: "2020000456",
      tempatLahir: "Ponorogo",
      tanggalLahir: new Date(Date.UTC(2008, 4, 10)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      alamatLengkap: "Jl. KH. Wahid Hasyim No. 45",
      rtRw: "001/002",
      desaKelurahan: "Nologaten",
      kecamatan: "Ponorogo",
      kabupatenKota: "Ponorogo",
      provinsi: "Jawa Timur",
      nomorKK: "3507032205080002",
      namaAyah: "Ahmad Subarjo",
      nikAyah: "3507010107850001",
      pekerjaanAyah: "Pedagang",
      namaIbu: "Siti Aminah",
      nikIbu: "3507011507880002",
      pekerjaanIbu: "Ibu Rumah Tangga",
      tahunMasuk: 2020,
      tahunLulus: 2026,
      nomorSyahadah: "SYH/PDM/2026/0007",
    },
  });

  await ensureRiwayatMutasi({
    santriId: alumni.id,
    jenisMutasi: JenisMutasiSantri.KENAIKAN_KELAS,
    keterangan: "Naik dari kelas 11 MA ke kelas 12 MA.",
    tanggalMutasi: new Date(Date.UTC(2025, 5, 20)),
    dicatatOleh: "Ustadz Hasan Basri",
  });

  await ensureRiwayatMutasi({
    santriId: alumni.id,
    jenisMutasi: JenisMutasiSantri.KELULUSAN_ALUMNI,
    keterangan:
      "Dinyatakan lulus dan ditetapkan sebagai alumni. Syahadah SYH/PDM/2026/0007.",
    tanggalMutasi: new Date(Date.UTC(2026, 5, 15)),
    dicatatOleh: bendahara.name,
  });

  // ------------------------- DATABASE GURU & USTADZ -----------------------
  // Guru 1: memiliki akun login (terhubung ke user ustadz).
  const guruUstadz = await prisma.guruDanTendik.upsert({
    where: { nik: "3507011508800001" },
    update: {
      userId: ustadz.id,
      namaLengkap: "Hasan Basri",
      gelarDepan: "Ust.",
      gelarBelakang: "S.Pd.I",
      tempatLahir: "Magetan",
      tanggalLahir: new Date(Date.UTC(1980, 7, 15)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      pendidikanTerakhir: PendidikanTerakhir.S1,
      jurusan: "Pendidikan Agama Islam",
      jabatan: JabatanGtk.USTADZ_NGAJI,
      statusKepegawaian: StatusKepegawaian.GTY,
      mataPelajaranAtauKitab: "Nahwu Shorof, Fiqih",
      noHp: "081200000005",
      alamat: "Jl. Pesantren No. 3, Geger, Madiun",
      statusAktif: true,
      tanggalMulaiTugas: new Date(Date.UTC(2015, 6, 1)),
      nuptk: "8243758661234567",
      npk: "NPK-2020-001",
      nip: null,
    },
    create: {
      userId: ustadz.id,
      nik: "3507011508800001",
      nuptk: "8243758661234567",
      npk: "NPK-2020-001",
      nip: null,
      namaLengkap: "Hasan Basri",
      gelarDepan: "Ust.",
      gelarBelakang: "S.Pd.I",
      tempatLahir: "Magetan",
      tanggalLahir: new Date(Date.UTC(1980, 7, 15)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      pendidikanTerakhir: PendidikanTerakhir.S1,
      jurusan: "Pendidikan Agama Islam",
      jabatan: JabatanGtk.USTADZ_NGAJI,
      statusKepegawaian: StatusKepegawaian.GTY,
      mataPelajaranAtauKitab: "Nahwu Shorof, Fiqih",
      noHp: "081200000005",
      alamat: "Jl. Pesantren No. 3, Geger, Madiun",
      statusAktif: true,
      tanggalMulaiTugas: new Date(Date.UTC(2015, 6, 1)),
    },
  });

  // Guru 2: pengasuh tanpa akun login (userId null) untuk mendemokan relasi opsional.
  const guruPengasuh = await prisma.guruDanTendik.upsert({
    where: { nik: "3507021207750002" },
    update: {
      userId: null,
      namaLengkap: "Abdullah Musthofa",
      gelarDepan: "KH.",
      gelarBelakang: null,
      tempatLahir: "Jombang",
      tanggalLahir: new Date(Date.UTC(1975, 11, 12)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      pendidikanTerakhir: PendidikanTerakhir.PESANTREN_SALAF,
      jurusan: "Ilmu Alat",
      jabatan: JabatanGtk.PENGASUH,
      statusKepegawaian: StatusKepegawaian.PENGABDIAN,
      mataPelajaranAtauKitab: "Kitab Kuning, Akhlak",
      noHp: "081200000006",
      alamat: "Kompleks Pesantren, Geger, Madiun",
      statusAktif: true,
      tanggalMulaiTugas: new Date(Date.UTC(1998, 6, 1)),
      nuptk: null,
      npk: "NPK-2010-002",
      nip: null,
    },
    create: {
      userId: null,
      nik: "3507021207750002",
      nuptk: null,
      npk: "NPK-2010-002",
      nip: null,
      namaLengkap: "Abdullah Musthofa",
      gelarDepan: "KH.",
      gelarBelakang: null,
      tempatLahir: "Jombang",
      tanggalLahir: new Date(Date.UTC(1975, 11, 12)),
      jenisKelamin: JenisKelamin.LAKI_LAKI,
      pendidikanTerakhir: PendidikanTerakhir.PESANTREN_SALAF,
      jurusan: "Ilmu Alat",
      jabatan: JabatanGtk.PENGASUH,
      statusKepegawaian: StatusKepegawaian.PENGABDIAN,
      mataPelajaranAtauKitab: "Kitab Kuning, Akhlak",
      noHp: "081200000006",
      alamat: "Kompleks Pesantren, Geger, Madiun",
      statusAktif: true,
      tanggalMulaiTugas: new Date(Date.UTC(1998, 6, 1)),
    },
  });

  const now = new Date();
  const bulan = now.getUTCMonth() + 1;
  const tahun = now.getUTCFullYear();
  const jatuhTempo = new Date(Date.UTC(tahun, bulan - 1, 10));

  const existingTagihan = await prisma.tagihan.findFirst({
    where: {
      santriId: santri.id,
      jenisTagihan: JenisTagihan.INFAQ_MAKAN,
      bulan,
      tahun,
    },
  });

  const tagihan =
    existingTagihan ??
    (await prisma.tagihan.create({
      data: {
        santriId: santri.id,
        jenisTagihan: JenisTagihan.INFAQ_MAKAN,
        bulan,
        tahun,
        nominalTagihan: 350_000n,
        nominalTerbayar: 0n,
        status: StatusTagihan.BELUM_LUNAS,
        jatuhTempo,
      },
    }));

  await prisma.systemSetting.upsert({
    where: { key: "AUTO_REDIRECT_JAJAN_TO_INFAQ" },
    // Jangan timpa nilai operasional saat seed dijalankan ulang.
    update: { updatedById: bendahara.id },
    create: {
      key: "AUTO_REDIRECT_JAJAN_TO_INFAQ",
      value: "true",
      valueType: SettingValueType.BOOLEAN,
      description:
        "Otomatis mengalihkan uang jajan titipan wali ke pembayaran tunggakan infaq makan.",
      updatedById: bendahara.id,
    },
  });

  console.log("Seed selesai.");
  console.log(`- Bendahara : ${bendahara.email}`);
  console.log(`- Operator  : ${operator.email}`);
  console.log(`- Wali      : ${wali.email}`);
  console.log(`- Kasir     : ${kasir.email}`);
  console.log(`- Ustadz    : ${ustadz.email}`);
  console.log(`- Merchant  : ${merchant.namaKantin} (${merchant.id})`);
  console.log(`- Santri    : ${santri.nis} (${santri.name}) - ${santri.statusSantri}`);
  console.log(`- Alumni    : ${alumni.nis} (${alumni.name}) - ${alumni.nomorSyahadah}`);
  console.log(`- Wallet    : ${santri.walletAddress}`);
  console.log(
    `- Guru      : ${guruUstadz.namaLengkap} (${guruUstadz.jabatan}), ${guruPengasuh.namaLengkap} (${guruPengasuh.jabatan})`,
  );
  console.log(
    `- Tagihan   : INFAQ_MAKAN ${bulan}/${tahun} = Rp${tagihan.nominalTagihan.toString()} (${tagihan.status})`,
  );
  console.log("- Password  : gunakan SEED_DEFAULT_PASSWORD dari .env");
}

main()
  .catch((error) => {
    console.error("Seed gagal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
