import type { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request);

    if (!user) {
      throw new AppError(
        401,
        "UNAUTHENTICATED",
        "Sesi login tidak valid atau sudah kedaluwarsa.",
      );
    }

    return jsonData({ user });
  } catch (error) {
    return errorResponse(error);
  }
}
