import { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { pairingRfidSchema } from "@/lib/validators/data-induk";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDataIndukOperator(request);
    const parsed = pairingRfidSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "RFID tidak valid.", parsed.error.flatten());
    const item = await prisma.santri.update({ where: { id: params.id }, data: { rfidUid: parsed.data.rfidUid }, select: { id: true, rfidUid: true } });
    return jsonData({ item });
  } catch (error) { return errorResponse(error); }
}
