import {
  JenisMutasiSantri,
  Prisma,
  Role,
  StatusSantri,
} from "@prisma/client";
import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import {
  SANTRI_SELECT,
  assertSantriUnique,
  assertWaliUser,
  hitungTunggakan,
  serializeSantri,
} from "@/lib/data-induk/santri-service";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { santriUpdateSchema } from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const row = await prisma.santri.findUnique({
      where: { id: params.id },
      select: SANTRI_SELECT,
    });

    if (!row) {
      throw new AppError(404, "SANTRI_NOT_FOUND", "Data santri tidak ditemukan.");
    }

    const tunggakan = await hitungTunggakan([row.id]);

    return jsonData({
      item: serializeSantri(row, tunggakan.get(row.id) ?? 0n),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const actor = await requireRoles(request, DATA_INDUK_ROLES);

    const existing = await prisma.santri.findUnique({
      where: { id: params.id },
      select: SANTRI_SELECT,
    });

    if (!existing) {
      throw new AppError(404, "SANTRI_NOT_FOUND", "Data santri tidak ditemukan.");
    }

    const body = await parseJson(request);
    const input = santriUpdateSchema.parse(body);

    if (
      (input.isDispensasiInfaq !== undefined ||
        input.catatanDispensasi !== undefined) &&
      actor.role !== Role.BENDAHARA
    ) {
      throw new AppError(
        403,
        "FORBIDDEN",
        "Pengaturan dispensasi Infaq Makan hanya dapat dilakukan oleh Bendahara.",
      );
    }

    if (input.waliId && input.waliId !== existing.waliId) {
      await assertWaliUser(prisma, input.waliId);
    }

    const mergedUnique = {
      nis: input.nis ?? existing.nis,
      nik: input.nik ?? existing.nik,
      nisn: input.nisn !== undefined ? input.nisn : existing.nisn,
      rfidUid: input.rfidUid !== undefined ? input.rfidUid : existing.rfidUid,
      barcodeCode:
        input.barcodeCode !== undefined ? input.barcodeCode : existing.barcodeCode,
    };
    await assertSantriUnique(prisma, mergedUnique, existing.id);

    const nextStatus = input.statusSantri ?? existing.statusSantri;
    const nextTahunMasuk = input.tahunMasuk ?? existing.tahunMasuk;
    const menjadiAlumni = nextStatus === StatusSantri.ALUMNI;

    // Kelulusan satuan otomatis menerbitkan nomor syahadah bila belum ada,
    // sehingga dokumen ijazah di menu Data Alumni langsung siap dicetak.
    const nextTahunLulus =
      input.tahunLulus ??
      existing.tahunLulus ??
      (menjadiAlumni ? new Date().getUTCFullYear() : null);
    const nextSyahadah =
      input.nomorSyahadah ??
      existing.nomorSyahadah ??
      (menjadiAlumni && nextTahunLulus
        ? `SYH/${nextTahunLulus}/${existing.nis}`
        : null);

    if (
      nextStatus === StatusSantri.ALUMNI &&
      (!nextTahunLulus || !nextSyahadah)
    ) {
      throw new AppError(
        422,
        "DATA_ALUMNI_TIDAK_LENGKAP",
        "Santri ALUMNI wajib memiliki tahun lulus dan nomor syahadah.",
      );
    }

    if (
      nextTahunLulus !== null &&
      nextTahunLulus !== undefined &&
      nextTahunLulus < nextTahunMasuk
    ) {
      throw new AppError(
        422,
        "TAHUN_TIDAK_KONSISTEN",
        "Tahun lulus tidak boleh lebih kecil dari tahun masuk.",
      );
    }

    const data: Prisma.SantriUncheckedUpdateInput = {
      ...(input.nis !== undefined ? { nis: input.nis } : {}),
      ...(input.nik !== undefined ? { nik: input.nik } : {}),
      ...(input.nisn !== undefined ? { nisn: input.nisn ?? null } : {}),
      ...(input.nism !== undefined ? { nism: input.nism ?? null } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kelas !== undefined ? { kelas: input.kelas } : {}),
      ...(input.kamar !== undefined ? { kamar: input.kamar } : {}),
      ...(input.rfidUid !== undefined ? { rfidUid: input.rfidUid } : {}),
      ...(input.barcodeCode !== undefined
        ? { barcodeCode: input.barcodeCode }
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
      ...(input.alamatLengkap !== undefined
        ? { alamatLengkap: input.alamatLengkap }
        : {}),
      ...(input.rtRw !== undefined ? { rtRw: input.rtRw ?? null } : {}),
      ...(input.desaKelurahan !== undefined
        ? { desaKelurahan: input.desaKelurahan }
        : {}),
      ...(input.kecamatan !== undefined ? { kecamatan: input.kecamatan } : {}),
      ...(input.kabupatenKota !== undefined
        ? { kabupatenKota: input.kabupatenKota }
        : {}),
      ...(input.provinsi !== undefined ? { provinsi: input.provinsi } : {}),
      ...(input.nomorKK !== undefined ? { nomorKK: input.nomorKK } : {}),
      ...(input.namaAyah !== undefined ? { namaAyah: input.namaAyah } : {}),
      ...(input.nikAyah !== undefined ? { nikAyah: input.nikAyah ?? null } : {}),
      ...(input.tempatLahirAyah !== undefined
        ? { tempatLahirAyah: input.tempatLahirAyah ?? null }
        : {}),
      ...(input.tanggalLahirAyah !== undefined
        ? { tanggalLahirAyah: input.tanggalLahirAyah ?? null }
        : {}),
      ...(input.statusHidupAyah !== undefined
        ? { statusHidupAyah: input.statusHidupAyah }
        : {}),
      ...(input.pendidikanAyah !== undefined
        ? { pendidikanAyah: input.pendidikanAyah ?? null }
        : {}),
      ...(input.pekerjaanAyah !== undefined
        ? { pekerjaanAyah: input.pekerjaanAyah ?? null }
        : {}),
      ...(input.penghasilanAyah !== undefined
        ? { penghasilanAyah: input.penghasilanAyah ?? null }
        : {}),
      ...(input.noHpAyah !== undefined
        ? { noHpAyah: input.noHpAyah ?? null }
        : {}),
      ...(input.namaIbu !== undefined ? { namaIbu: input.namaIbu } : {}),
      ...(input.nikIbu !== undefined ? { nikIbu: input.nikIbu ?? null } : {}),
      ...(input.tempatLahirIbu !== undefined
        ? { tempatLahirIbu: input.tempatLahirIbu ?? null }
        : {}),
      ...(input.tanggalLahirIbu !== undefined
        ? { tanggalLahirIbu: input.tanggalLahirIbu ?? null }
        : {}),
      ...(input.statusHidupIbu !== undefined
        ? { statusHidupIbu: input.statusHidupIbu }
        : {}),
      ...(input.pendidikanIbu !== undefined
        ? { pendidikanIbu: input.pendidikanIbu ?? null }
        : {}),
      ...(input.pekerjaanIbu !== undefined
        ? { pekerjaanIbu: input.pekerjaanIbu ?? null }
        : {}),
      ...(input.penghasilanIbu !== undefined
        ? { penghasilanIbu: input.penghasilanIbu ?? null }
        : {}),
      ...(input.noHpIbu !== undefined
        ? { noHpIbu: input.noHpIbu ?? null }
        : {}),
      ...(input.namaWali !== undefined
        ? { namaWali: input.namaWali ?? null }
        : {}),
      ...(input.hubunganWali !== undefined
        ? { hubunganWali: input.hubunganWali ?? null }
        : {}),
      ...(input.tempatLahirWali !== undefined
        ? { tempatLahirWali: input.tempatLahirWali ?? null }
        : {}),
      ...(input.tanggalLahirWali !== undefined
        ? { tanggalLahirWali: input.tanggalLahirWali ?? null }
        : {}),
      ...(input.pekerjaanWali !== undefined
        ? { pekerjaanWali: input.pekerjaanWali ?? null }
        : {}),
      ...(input.penghasilanWali !== undefined
        ? { penghasilanWali: input.penghasilanWali ?? null }
        : {}),
      ...(input.noHpWali !== undefined
        ? { noHpWali: input.noHpWali ?? null }
        : {}),
      ...(input.alamatWali !== undefined
        ? { alamatWali: input.alamatWali ?? null }
        : {}),
      ...(input.fotoSantriUrl !== undefined
        ? { fotoSantriUrl: input.fotoSantriUrl ?? null }
        : {}),
      ...(input.fileKkUrl !== undefined
        ? { fileKkUrl: input.fileKkUrl ?? null }
        : {}),
      ...(input.fileAktaUrl !== undefined
        ? { fileAktaUrl: input.fileAktaUrl ?? null }
        : {}),
      ...(input.fileIjazahUrl !== undefined
        ? { fileIjazahUrl: input.fileIjazahUrl ?? null }
        : {}),
      ...(input.statusMukim !== undefined
        ? { statusMukim: input.statusMukim }
        : {}),
      ...(input.statusSantri !== undefined
        ? {
            statusSantri: input.statusSantri,
            statusAktif: input.statusSantri === StatusSantri.AKTIF,
          }
        : {}),
      ...(input.tahunMasuk !== undefined ? { tahunMasuk: input.tahunMasuk } : {}),
      ...(menjadiAlumni
        ? { tahunLulus: nextTahunLulus, nomorSyahadah: nextSyahadah }
        : {
            ...(input.tahunLulus !== undefined
              ? { tahunLulus: input.tahunLulus ?? null }
              : {}),
            ...(input.nomorSyahadah !== undefined
              ? { nomorSyahadah: input.nomorSyahadah ?? null }
              : {}),
          }),
      ...(input.waliId !== undefined ? { waliId: input.waliId } : {}),
      ...(input.isDispensasiInfaq !== undefined
        ? { isDispensasiInfaq: input.isDispensasiInfaq }
        : {}),
      ...(input.catatanDispensasi !== undefined
        ? { catatanDispensasi: input.catatanDispensasi ?? null }
        : {}),
    };

    let riwayat:
      | {
          jenisMutasi: JenisMutasiSantri;
          keterangan: string;
        }
      | null = null;

    if (input.statusSantri && input.statusSantri !== existing.statusSantri) {
      if (input.statusSantri === StatusSantri.ALUMNI) {
        riwayat = {
          jenisMutasi: JenisMutasiSantri.KELULUSAN_ALUMNI,
          keterangan: `Status diubah menjadi ALUMNI. Syahadah ${nextSyahadah ?? "-"}.`,
        };
      } else if (
        input.statusSantri === StatusSantri.PINDAH ||
        input.statusSantri === StatusSantri.DROPOUT
      ) {
        riwayat = {
          jenisMutasi: JenisMutasiSantri.MUTASI_KELUAR,
          keterangan: `Status diubah dari ${existing.statusSantri} menjadi ${input.statusSantri}.`,
        };
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.santri.update({
        where: { id: existing.id },
        data,
        select: SANTRI_SELECT,
      });

      if (riwayat) {
        await tx.riwayatMutasiSantri.create({
          data: {
            santriId: row.id,
            jenisMutasi: riwayat.jenisMutasi,
            keterangan: riwayat.keterangan,
            tanggalMutasi: new Date(),
            dicatatOleh: actor.name,
          },
        });
      }

      return row;
    });

    const tunggakan = await hitungTunggakan([updated.id]);

    return jsonData({
      item: serializeSantri(updated, tunggakan.get(updated.id) ?? 0n),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
