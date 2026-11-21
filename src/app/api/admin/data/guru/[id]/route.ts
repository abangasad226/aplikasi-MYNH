import type { NextRequest } from "next/server";

import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { DATA_INDUK_ROLES } from "@/lib/data-induk/access";
import { serializeGuru, updateGuru } from "@/lib/data-induk/guru-service";
import { guruUpdateSchema } from "@/lib/validators/data-induk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    await requireRoles(request, DATA_INDUK_ROLES);

    const body = await parseJson(request);
    const input = guruUpdateSchema.parse(body);
    const { guru, akunDibuat } = await updateGuru(params.id, input);

    return jsonData({ item: serializeGuru(guru), akunDibuat });
  } catch (error) {
    return errorResponse(error);
  }
}
