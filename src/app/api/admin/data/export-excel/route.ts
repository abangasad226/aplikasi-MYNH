import { NextResponse, type NextRequest } from "next/server";

import { errorResponse } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import {
  buildGuruWorkbook,
  buildSantriWorkbook,
  buildTemplateWorkbook,
} from "@/lib/data-induk/excel";
import { GURU_SELECT, serializeGuru } from "@/lib/data-induk/guru-service";
import { buildGuruWhere, buildSantriWhere } from "@/lib/data-induk/query";
import {
  SANTRI_SELECT,
  serializeSantri,
} from "@/lib/data-induk/santri-service";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function downloadResponse(buffer: Buffer, filename: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": EXCEL_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const searchParams = request.nextUrl.searchParams;
    const jenis = searchParams.get("jenis");

    if (jenis !== "santri" && jenis !== "guru") {
      throw new AppError(
        400,
        "JENIS_TIDAK_VALID",
        "Parameter jenis harus santri atau guru.",
      );
    }

    const isTemplate = ["1", "true", "ya"].includes(
      (searchParams.get("template") ?? "").toLowerCase(),
    );
    const tanggal = new Date().toISOString().slice(0, 10);

    if (isTemplate) {
      return downloadResponse(
        buildTemplateWorkbook(jenis),
        `template-data-${jenis}.xlsx`,
      );
    }

    if (jenis === "santri") {
      const rows = await prisma.santri.findMany({
        where: buildSantriWhere(searchParams),
        select: SANTRI_SELECT,
        orderBy: [{ name: "asc" }],
        take: 10_000,
      });

      const items = rows.map((row) => serializeSantri(row, 0n));
      return downloadResponse(
        buildSantriWorkbook(items),
        `data-santri-${tanggal}.xlsx`,
      );
    }

    const rows = await prisma.guruDanTendik.findMany({
      where: buildGuruWhere(searchParams),
      select: GURU_SELECT,
      orderBy: [{ namaLengkap: "asc" }],
      take: 10_000,
    });

    const items = rows.map(serializeGuru);
    return downloadResponse(
      buildGuruWorkbook(items),
      `data-guru-${tanggal}.xlsx`,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
