import { createHmac, timingSafeEqual } from "node:crypto";
import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

// Sesi ditandatangani HMAC-SHA256 lalu disimpan pada cookie httpOnly oleh
// route /api/auth/login.
export const SESSION_COOKIE = "pesantren_session";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MIN_AUTH_SECRET_LENGTH = 32;

type SessionPayload = {
  sub: string;
  exp: number;
};

export interface SessionUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();

  if (!secret || secret.length < MIN_AUTH_SECRET_LENGTH) {
    throw new AppError(
      500,
      "AUTH_NOT_CONFIGURED",
      `AUTH_SECRET belum dikonfigurasi (minimal ${MIN_AUTH_SECRET_LENGTH} karakter).`,
    );
  }

  return secret;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.sub === "string" &&
    payload.sub.length > 0 &&
    typeof payload.exp === "number" &&
    Number.isFinite(payload.exp)
  );
}

export function createSessionToken(
  userId: string,
  ttlSeconds = SESSION_TTL_SECONDS,
): string {
  const subject = userId.trim();

  if (!subject) {
    throw new AppError(
      400,
      "INVALID_SESSION_SUBJECT",
      "userId sesi tidak valid.",
    );
  }

  const ttl = Math.max(60, Math.trunc(ttlSeconds));
  const payload: SessionPayload = {
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + ttl,
  };
  const encodedPayload = Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token: string): SessionPayload | null {
  const [encodedPayload, providedSignature] = token.split(".");

  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", getAuthSecret())
    .update(encodedPayload)
    .digest();
  const providedSignatureBuffer = Buffer.from(providedSignature, "base64url");

  if (
    providedSignatureBuffer.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignatureBuffer, expectedSignature)
  ) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }

  if (!isSessionPayload(parsed)) {
    return null;
  }

  if (parsed.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return parsed;
}

function readSessionToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");

  if (authorization?.startsWith("Bearer ")) {
    const bearerToken = authorization.slice("Bearer ".length).trim();

    if (bearerToken) {
      return bearerToken;
    }
  }

  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value?.trim();
  return cookieToken || null;
}

export async function getSessionUser(
  request: NextRequest,
): Promise<SessionUser | null> {
  const token = readSessionToken(request);

  if (!token) {
    return null;
  }

  const payload = verifySessionToken(token);

  if (!payload) {
    return null;
  }

  // Role selalu dibaca dari database, bukan dari klaim token, agar perubahan
  // atau pencabutan role langsung berlaku.
  return prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
    },
  });
}

export async function requireRoles(
  request: NextRequest,
  allowedRoles: readonly Role[],
): Promise<SessionUser> {
  const user = await getSessionUser(request);

  if (!user) {
    throw new AppError(
      401,
      "UNAUTHENTICATED",
      "Sesi login tidak valid atau sudah kedaluwarsa.",
    );
  }

  if (!allowedRoles.includes(user.role)) {
    throw new AppError(
      403,
      "FORBIDDEN",
      "Anda tidak memiliki akses ke endpoint ini.",
    );
  }

  return user;
}
