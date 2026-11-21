import { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { prisma } from "@/lib/prisma";
import { updateGuru, serializeGuru } from "@/lib/data-induk/guru-service";
import { guruUpdateSchema } from "@/lib/validators/data-induk";
import { AppError } from "@/lib/errors";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDataIndukOperator(request);
    const parsed = guruUpdateSchema.safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Data guru tidak valid.", parsed.error.flatten());
    const result = await updateGuru(params.id, parsed.data);
    return jsonData({ item: serializeGuru(result.guru), akunDibuat: result.akunDibuat });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireDataIndukOperator(request);
    await prisma.guruDanTendik.delete({ where: { id: params.id } });
    return jsonData({ deleted: true });
  } catch (error) { return errorResponse(error); }
}
