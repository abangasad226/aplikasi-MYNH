import {
  JenisMutasiSantri,
  StatusSantri,
} from "@prisma/client";
import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import type { MutasiMassalResponse } from "@/lib/api-types";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import { hitungTunggakan } from "@/lib/data-induk/santri-service";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { mutasiMassalSchema } from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, DATA_INDUK_ROLES);

    const body = await parseJson(request);
    const input = mutasiMassalSchema.parse(body);
    const santriIds = Array.from(new Set(input.santriIds));

    const santriList = await prisma.santri.findMany({
      where: { id: { in: santriIds } },
      select: {
        id: true,
        nis: true,
        name: true,
        kelas: true,
        statusSantri: true,
      },
    });

    if (santriList.length !== santriIds.length) {
      const found = new Set(santriList.map((item) => item.id));
      const missing = santriIds.filter((id) => !found.has(id));
      throw new AppError(
        404,
        "SANTRI_TIDAK_DITEMUKAN",
        "Sebagian santri yang dipilih tidak ditemukan.",
        { missing },
      );
    }

    const tidakAktif = santriList.filter(
      (item) => item.statusSantri !== StatusSantri.AKTIF,
    );

    if (tidakAktif.length > 0) {
      throw new AppError(
        409,
        "HANYA_SANTRI_AKTIF",
        "Proses massal hanya berlaku untuk santri berstatus AKTIF.",
        { santri: tidakAktif.map((item) => ({ id: item.id, nis: item.nis })) },
      );
    }

    const tunggakan = await hitungTunggakan(santriIds);
    const tahunLulus = input.tahunLulus ?? new Date().getUTCFullYear();
    const prefix =
      input.nomorSyahadahPrefix?.trim() || `SYH/${tahunLulus}/`;

    const items = await prisma.$transaction(
      async (tx) => {
        const hasil: MutasiMassalResponse["items"] = [];

        for (const santri of santriList) {
          if (input.mode === "NAIK_KELAS") {
            const kelasBaru = input.kelasBaru ?? santri.kelas;

            await tx.santri.update({
              where: { id: santri.id },
              data: { kelas: kelasBaru },
            });

            await tx.riwayatMutasiSantri.create({
              data: {
                santriId: santri.id,
                jenisMutasi: JenisMutasiSantri.KENAIKAN_KELAS,
                keterangan: `Kenaikan kelas massal dari ${santri.kelas} ke ${kelasBaru}.`,
                tanggalMutasi: new Date(),
                dicatatOleh: actor.name,
              },
            });

            hasil.push({
              id: santri.id,
              nis: santri.nis,
              name: santri.name,
              kelas: kelasBaru,
              statusSantri: santri.statusSantri,
              tahunLulus: null,
              nomorSyahadah: null,
            });
            continue;
          }

          const nomorSyahadah = `${prefix}${santri.nis}`;

          await tx.santri.update({
            where: { id: santri.id },
            data: {
              statusSantri: StatusSantri.ALUMNI,
              statusAktif: false,
              tahunLulus,
              nomorSyahadah,
            },
          });

          await tx.riwayatMutasiSantri.create({
            data: {
              santriId: santri.id,
              jenisMutasi: JenisMutasiSantri.KELULUSAN_ALUMNI,
              keterangan: `Dinyatakan lulus tahun ${tahunLulus}. Syahadah ${nomorSyahadah}.`,
              tanggalMutasi: new Date(),
              dicatatOleh: actor.name,
            },
          });

          hasil.push({
            id: santri.id,
            nis: santri.nis,
            name: santri.name,
            kelas: santri.kelas,
            statusSantri: StatusSantri.ALUMNI,
            tahunLulus,
            nomorSyahadah,
          });
        }

        return hasil;
      },
      { timeout: 60_000 },
    );

    const payload: MutasiMassalResponse = {
      mode: input.mode,
      diproses: items.length,
      items,
      peringatanTunggakan: santriList
        .map((santri) => ({
          santriId: santri.id,
          name: santri.name,
          tunggakanTotal: (tunggakan.get(santri.id) ?? 0n).toString(),
        }))
        .filter((item) => item.tunggakanTotal !== "0"),
    };

    return jsonData(payload);
  } catch (error) {
    return errorResponse(error);
  }
}
