import { Role, SettingValueType } from "@prisma/client";
import type { NextRequest } from "next/server";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AUTO_REDIRECT_JAJAN_TO_INFAQ_KEY } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { updateAutoRedirectSchema } from "@/lib/validators/keuangan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_ROLES = [Role.BENDAHARA] as const;

const SETTING_SELECT = {
  key: true,
  value: true,
  valueType: true,
  description: true,
  updatedAt: true,
  updatedBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
} as const;

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, ALLOWED_ROLES);

    const setting = await prisma.systemSetting.findUnique({
      where: { key: AUTO_REDIRECT_JAJAN_TO_INFAQ_KEY },
      select: SETTING_SELECT,
    });

    return jsonData({
      key: AUTO_REDIRECT_JAJAN_TO_INFAQ_KEY,
      value: setting?.value ?? null,
      enabled: setting?.value.trim().toLowerCase() === "true",
      valueType: setting?.valueType ?? null,
      description: setting?.description ?? null,
      updatedAt: setting?.updatedAt.toISOString() ?? null,
      updatedBy: setting?.updatedBy ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireRoles(request, ALLOWED_ROLES);
    const body = await parseJson(request);
    const { value } = updateAutoRedirectSchema.parse(body);
    const normalizedValue = value ? "true" : "false";

    // Upsert membuat nilai default tetap tersedia jika seed belum dijalankan.
    // updatedById + updatedAt menjadi jejak audit perubahan kebijakan terakhir.
    const setting = await prisma.systemSetting.upsert({
      where: { key: AUTO_REDIRECT_JAJAN_TO_INFAQ_KEY },
      update: {
        value: normalizedValue,
        valueType: SettingValueType.BOOLEAN,
        updatedById: actor.id,
      },
      create: {
        key: AUTO_REDIRECT_JAJAN_TO_INFAQ_KEY,
        value: normalizedValue,
        valueType: SettingValueType.BOOLEAN,
        description:
          "Otomatis mengalihkan setoran uang jajan wali ke pelunasan tunggakan Infaq Makan.",
        updatedById: actor.id,
      },
      select: SETTING_SELECT,
    });

    return jsonData({
      key: setting.key,
      value: setting.value,
      enabled: setting.value.trim().toLowerCase() === "true",
      valueType: setting.valueType,
      description: setting.description,
      updatedAt: setting.updatedAt.toISOString(),
      updatedBy: setting.updatedBy,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
