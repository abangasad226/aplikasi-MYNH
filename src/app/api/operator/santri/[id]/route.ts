import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { assertWaliUser, hitungTunggakan, SANTRI_SELECT, serializeSantri } from "@/lib/data-induk/santri-service";
import { prisma } from "@/lib/prisma";
import { santriUpdateSchema } from "@/lib/validators/data-induk";
import { AppError } from "@/lib/errors";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDataIndukOperator(request);
    const parsed = santriUpdateSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Data santri tidak valid.", parsed.error.flatten());
    const input = parsed.data;
    const existing = await prisma.santri.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!existing) throw new AppError(404, "SANTRI_NOT_FOUND", "Santri tidak ditemukan.");
    if (input.waliId) await assertWaliUser(prisma, input.waliId);
    const data: Prisma.SantriUncheckedUpdateInput = {
      ...input,
      ...(input.statusSantri ? { statusAktif: input.statusSantri === "AKTIF" } : {}),
    };
    const row = await prisma.santri.update({ where: { id: params.id }, data, select: SANTRI_SELECT });
    const debt = await hitungTunggakan([row.id]);
    return jsonData({ item: serializeSantri(row, debt.get(row.id) ?? 0n) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDataIndukOperator(request);
    await prisma.santri.delete({ where: { id: params.id } });
    return jsonData({ deleted: true });
  } catch (error) { return errorResponse(error); }
}
