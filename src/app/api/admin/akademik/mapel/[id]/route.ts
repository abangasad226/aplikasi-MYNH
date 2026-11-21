import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { mapelSchema } from "@/lib/validators/akademik";
import { AKADEMIK_ROLES, simpanMapel } from "@/services/akademikService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    const id = z.string().cuid().parse(params.id);
    const input = mapelSchema.parse(await parseJson(request));
    return jsonData({ item: await simpanMapel(input, id) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    await requireRoles(request, AKADEMIK_ROLES);
    const id = z.string().cuid().parse(params.id);
    await prisma.mataPelajaran.delete({ where: { id } });
    return jsonData({ deleted: true });
  } catch (error) { return errorResponse(error); }
}
