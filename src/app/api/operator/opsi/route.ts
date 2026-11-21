import { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { errorResponse, jsonData } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.OPERATOR, Role.BENDAHARA]);
    const [wali, kelasRows, kamarRows, tahunRows] = await Promise.all([
      prisma.user.findMany({ where: { role: "WALI_SANTRI" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
      prisma.santri.findMany({ distinct: ["kelas"], select: { kelas: true }, orderBy: { kelas: "asc" } }),
      prisma.santri.findMany({ distinct: ["kamar"], select: { kamar: true }, orderBy: { kamar: "asc" } }),
      prisma.santri.findMany({ where: { tahunLulus: { not: null } }, distinct: ["tahunLulus"], select: { tahunLulus: true }, orderBy: { tahunLulus: "desc" } }),
    ]);
    return jsonData({ wali, kelas: kelasRows.map((x) => x.kelas), kamar: kamarRows.map((x) => x.kamar), tahunLulus: tahunRows.flatMap((x) => x.tahunLulus === null ? [] : [x.tahunLulus]) });
  } catch (error) { return errorResponse(error); }
}
