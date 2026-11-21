import {
  JabatanGtk,
  Prisma,
  StatusKepegawaian,
  StatusMukim,
  StatusSantri,
} from "@prisma/client";

import { AppError } from "@/lib/errors";

function parseEnumParam<T extends string>(
  raw: string | null,
  values: Record<string, T>,
  label: string,
): T | undefined {
  if (!raw) {
    return undefined;
  }

  if (!Object.values(values).includes(raw as T)) {
    throw new AppError(
      400,
      "FILTER_INVALID",
      `${label} tidak valid. Pilihan: ${Object.values(values).join(", ")}.`,
    );
  }

  return raw as T;
}

export function parsePagination(
  searchParams: URLSearchParams,
  defaultLimit = 50,
  maxLimit = 100,
): { page: number; limit: number; skip: number } {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const limitRaw = Number(searchParams.get("limit") ?? String(defaultLimit));

  const page =
    Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 10_000) : 1;
  const limit =
    Number.isInteger(limitRaw) && limitRaw > 0
      ? Math.min(limitRaw, maxLimit)
      : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
}

export function readSearchQuery(searchParams: URLSearchParams): string | null {
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return null;
  }

  if (q.length > 80) {
    throw new AppError(
      400,
      "PENCARIAN_TERLALU_PANJANG",
      "Kata kunci pencarian maksimal 80 karakter.",
    );
  }

  return q;
}

export function buildSantriWhere(
  searchParams: URLSearchParams,
): Prisma.SantriWhereInput {
  const statusSantri = parseEnumParam(
    searchParams.get("statusSantri"),
    StatusSantri,
    "statusSantri",
  );
  const statusMukim = parseEnumParam(
    searchParams.get("statusMukim"),
    StatusMukim,
    "statusMukim",
  );
  const kelas = searchParams.get("kelas")?.trim() || null;
  const kamar = searchParams.get("kamar")?.trim() || null;
  const q = readSearchQuery(searchParams);
  const tahunLulusRaw = searchParams.get("tahunLulus")?.trim();
  let tahunLulus: number | undefined;

  if (tahunLulusRaw) {
    const parsed = Number(tahunLulusRaw);

    if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) {
      throw new AppError(
        400,
        "FILTER_INVALID",
        "tahunLulus harus berupa tahun antara 1900 dan 2200.",
      );
    }

    tahunLulus = parsed;
  }

  return {
    ...(statusSantri ? { statusSantri } : {}),
    ...(statusMukim ? { statusMukim } : {}),
    ...(kelas ? { kelas } : {}),
    ...(kamar ? { kamar } : {}),
    ...(tahunLulus ? { tahunLulus } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { nis: { contains: q } },
            { nik: { contains: q } },
            { rfidUid: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export function buildGuruWhere(
  searchParams: URLSearchParams,
): Prisma.GuruDanTendikWhereInput {
  const statusKepegawaian = parseEnumParam(
    searchParams.get("statusKepegawaian"),
    StatusKepegawaian,
    "statusKepegawaian",
  );
  const jabatan = parseEnumParam(
    searchParams.get("jabatan"),
    JabatanGtk,
    "jabatan",
  );
  const q = readSearchQuery(searchParams);

  return {
    ...(statusKepegawaian ? { statusKepegawaian } : {}),
    ...(jabatan ? { jabatan } : {}),
    ...(q
      ? {
          OR: [
            { namaLengkap: { contains: q, mode: "insensitive" } },
            { nik: { contains: q } },
            { nip: { contains: q } },
            { nuptk: { contains: q } },
            { npk: { contains: q, mode: "insensitive" } },
            { mataPelajaranAtauKitab: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
