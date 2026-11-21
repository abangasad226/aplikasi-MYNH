import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "email wajib diisi.")
      .max(255, "email terlalu panjang.")
      .email("Format email tidak valid."),
    password: z
      .string()
      .min(1, "password wajib diisi.")
      .max(200, "password terlalu panjang."),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    const body = await parseJson(request);
    const input = loginSchema.parse(body);
    const email = input.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        passwordHash: true,
      },
    });

    // Pesan gagal disamakan agar tidak membocorkan email mana yang terdaftar.
    const passwordValid =
      user !== null && (await bcrypt.compare(input.password, user.passwordHash));

    if (!user || !passwordValid) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Email atau password salah.",
      );
    }

    const token = createSessionToken(user.id);
    const response = jsonData({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
