import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

import type { GuruItem } from "@/lib/api-types";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type {
  GuruCreatePayload,
  GuruUpdatePayload,
} from "@/lib/validators/data-induk";

type DbClient = Prisma.TransactionClient | typeof prisma;

export const GURU_SELECT = {
  id: true,
  userId: true,
  nip: true,
  nuptk: true,
  npk: true,
  nik: true,
  namaLengkap: true,
  gelarDepan: true,
  gelarBelakang: true,
  tempatLahir: true,
  tanggalLahir: true,
  jenisKelamin: true,
  pendidikanTerakhir: true,
  jurusan: true,
  jabatan: true,
  statusKepegawaian: true,
  mataPelajaranAtauKitab: true,
  noHp: true,
  alamat: true,
  statusAktif: true,
  tanggalMulaiTugas: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
    },
  },
} as const;

export type GuruRow = Prisma.GuruDanTendikGetPayload<{
  select: typeof GURU_SELECT;
}>;

export function namaTampilGuru(parts: {
  gelarDepan?: string | null;
  namaLengkap: string;
  gelarBelakang?: string | null;
}): string {
  return [parts.gelarDepan, parts.namaLengkap, parts.gelarBelakang]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ");
}

async function assertGuruUnique(
  db: DbClient,
  input: {
    nik: string;
    nip?: string | null;
    nuptk?: string | null;
    npk?: string | null;
  },
  excludeId?: string,
): Promise<void> {
  const conditions: Prisma.GuruDanTendikWhereInput[] = [{ nik: input.nik }];

  if (input.nip) conditions.push({ nip: input.nip });
  if (input.nuptk) conditions.push({ nuptk: input.nuptk });
  if (input.npk) conditions.push({ npk: input.npk });

  const candidates = await db.guruDanTendik.findMany({
    where: {
      OR: conditions,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      nik: true,
      nip: true,
      nuptk: true,
      npk: true,
    },
  });

  if (candidates.length === 0) {
    return;
  }

  const bentrok = new Set<string>();

  for (const row of candidates) {
    if (row.nik === input.nik) bentrok.add("NIK");
    if (input.nip && row.nip === input.nip) bentrok.add("NIP");
    if (input.nuptk && row.nuptk === input.nuptk) bentrok.add("NUPTK");
    if (input.npk && row.npk === input.npk) bentrok.add("NPK");
  }

  throw new AppError(
    409,
    "DUPLIKAT_GURU",
    `Data guru/ustadz sudah terdaftar: ${Array.from(bentrok).join(", ")}.`,
    { field: Array.from(bentrok) },
  );
}

function buildGuruData(
  input: GuruCreatePayload,
  userId: string | null,
): Prisma.GuruDanTendikUncheckedCreateInput {
  return {
    userId,
    nip: input.nip ?? null,
    nuptk: input.nuptk ?? null,
    npk: input.npk ?? null,
    nik: input.nik,
    namaLengkap: input.namaLengkap,
    gelarDepan: input.gelarDepan ?? null,
    gelarBelakang: input.gelarBelakang ?? null,
    tempatLahir: input.tempatLahir,
    tanggalLahir: input.tanggalLahir,
    jenisKelamin: input.jenisKelamin,
    pendidikanTerakhir: input.pendidikanTerakhir,
    jurusan: input.jurusan ?? null,
    jabatan: input.jabatan,
    statusKepegawaian: input.statusKepegawaian,
    mataPelajaranAtauKitab: input.mataPelajaranAtauKitab ?? null,
    noHp: input.noHp,
    alamat: input.alamat,
    statusAktif: input.statusAktif,
    tanggalMulaiTugas: input.tanggalMulaiTugas,
  };
}

async function buatAkunUstadz(
  tx: Prisma.TransactionClient,
  input: { nama: string; noHp: string; email?: string; password?: string },
): Promise<string> {
  if (!input.email || !input.password) {
    throw new AppError(
      400,
      "AKUN_TIDAK_LENGKAP",
      "Email dan password wajib diisi untuk membuat akun login.",
    );
  }

  const email = input.email.trim().toLowerCase();
  const existing = await tx.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(
      409,
      "EMAIL_DIPAKAI",
      "Email tersebut sudah digunakan akun lain.",
    );
  }

  const user = await tx.user.create({
    data: {
      email,
      name: input.nama,
      phone: input.noHp,
      role: Role.USTADZ_PENGURUS,
      passwordHash: await bcrypt.hash(input.password, 12),
    },
    select: { id: true },
  });

  return user.id;
}

export async function createGuru(
  input: GuruCreatePayload,
): Promise<{ guru: GuruRow; akunDibuat: boolean }> {
  return prisma.$transaction(
    async (tx) => {
      await assertGuruUnique(tx, input);

      const userId = input.buatAkun
        ? await buatAkunUstadz(tx, {
            nama: namaTampilGuru(input),
            noHp: input.noHp,
            email: input.emailAkun,
            password: input.passwordAkun,
          })
        : null;

      const guru = await tx.guruDanTendik.create({
        data: buildGuruData(input, userId),
        select: GURU_SELECT,
      });

      return { guru, akunDibuat: userId !== null };
    },
    { timeout: 15_000 },
  );
}

export async function updateGuru(
  id: string,
  input: GuruUpdatePayload,
): Promise<{ guru: GuruRow; akunDibuat: boolean }> {
  const existing = await prisma.guruDanTendik.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      nik: true,
      nip: true,
      nuptk: true,
      npk: true,
      namaLengkap: true,
      gelarDepan: true,
      gelarBelakang: true,
      noHp: true,
    },
  });

  if (!existing) {
    throw new AppError(404, "GURU_NOT_FOUND", "Data guru tidak ditemukan.");
  }

  await assertGuruUnique(
    prisma,
    {
      nik: input.nik ?? existing.nik,
      nip: input.nip !== undefined ? input.nip : existing.nip,
      nuptk: input.nuptk !== undefined ? input.nuptk : existing.nuptk,
      npk: input.npk !== undefined ? input.npk : existing.npk,
    },
    id,
  );

  if (input.buatAkun && existing.userId) {
    throw new AppError(
      409,
      "AKUN_SUDAH_ADA",
      "Data guru ini sudah memiliki akun login.",
    );
  }

  return prisma.$transaction(
    async (tx) => {
      let userId = existing.userId;
      let akunDibuat = false;

      if (input.buatAkun) {
        userId = await buatAkunUstadz(tx, {
          nama: namaTampilGuru({
            gelarDepan: input.gelarDepan ?? existing.gelarDepan,
            namaLengkap: input.namaLengkap ?? existing.namaLengkap,
            gelarBelakang: input.gelarBelakang ?? existing.gelarBelakang,
          }),
          noHp: input.noHp ?? existing.noHp,
          email: input.emailAkun,
          password: input.passwordAkun,
        });
        akunDibuat = true;
      }

      const data: Prisma.GuruDanTendikUncheckedUpdateInput = {
        ...(input.nip !== undefined ? { nip: input.nip ?? null } : {}),
        ...(input.nuptk !== undefined ? { nuptk: input.nuptk ?? null } : {}),
        ...(input.npk !== undefined ? { npk: input.npk ?? null } : {}),
        ...(input.nik !== undefined ? { nik: input.nik } : {}),
        ...(input.namaLengkap !== undefined
          ? { namaLengkap: input.namaLengkap }
          : {}),
        ...(input.gelarDepan !== undefined
          ? { gelarDepan: input.gelarDepan ?? null }
          : {}),
        ...(input.gelarBelakang !== undefined
          ? { gelarBelakang: input.gelarBelakang ?? null }
          : {}),
        ...(input.tempatLahir !== undefined
          ? { tempatLahir: input.tempatLahir }
          : {}),
        ...(input.tanggalLahir !== undefined
          ? { tanggalLahir: input.tanggalLahir }
          : {}),
        ...(input.jenisKelamin !== undefined
          ? { jenisKelamin: input.jenisKelamin }
          : {}),
        ...(input.pendidikanTerakhir !== undefined
          ? { pendidikanTerakhir: input.pendidikanTerakhir }
          : {}),
        ...(input.jurusan !== undefined ? { jurusan: input.jurusan ?? null } : {}),
        ...(input.jabatan !== undefined ? { jabatan: input.jabatan } : {}),
        ...(input.statusKepegawaian !== undefined
          ? { statusKepegawaian: input.statusKepegawaian }
          : {}),
        ...(input.mataPelajaranAtauKitab !== undefined
          ? { mataPelajaranAtauKitab: input.mataPelajaranAtauKitab ?? null }
          : {}),
        ...(input.noHp !== undefined ? { noHp: input.noHp } : {}),
        ...(input.alamat !== undefined ? { alamat: input.alamat } : {}),
        ...(input.statusAktif !== undefined
          ? { statusAktif: input.statusAktif }
          : {}),
        ...(input.tanggalMulaiTugas !== undefined
          ? { tanggalMulaiTugas: input.tanggalMulaiTugas }
          : {}),
        ...(akunDibuat ? { userId } : {}),
      };

      const guru = await tx.guruDanTendik.update({
        where: { id },
        data,
        select: GURU_SELECT,
      });

      return { guru, akunDibuat };
    },
    { timeout: 15_000 },
  );
}

export function serializeGuru(row: GuruRow): GuruItem {
  return {
    id: row.id,
    userId: row.userId,
    nip: row.nip,
    nuptk: row.nuptk,
    npk: row.npk,
    nik: row.nik,
    namaLengkap: row.namaLengkap,
    gelarDepan: row.gelarDepan,
    gelarBelakang: row.gelarBelakang,
    tempatLahir: row.tempatLahir,
    tanggalLahir: row.tanggalLahir.toISOString().slice(0, 10),
    jenisKelamin: row.jenisKelamin,
    pendidikanTerakhir: row.pendidikanTerakhir,
    jurusan: row.jurusan,
    jabatan: row.jabatan,
    statusKepegawaian: row.statusKepegawaian,
    mataPelajaranAtauKitab: row.mataPelajaranAtauKitab,
    noHp: row.noHp,
    alamat: row.alamat,
    statusAktif: row.statusAktif,
    tanggalMulaiTugas: row.tanggalMulaiTugas.toISOString().slice(0, 10),
    akun: row.user,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
