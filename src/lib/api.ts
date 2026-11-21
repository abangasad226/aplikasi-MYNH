import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export function jsonData<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(
    { data },
    { status, headers: NO_STORE_HEADERS },
  );
}

export async function parseJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(
      400,
      "INVALID_JSON",
      "Body request harus berupa JSON yang valid.",
    );
  }
}

function jsonError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status, headers: NO_STORE_HEADERS },
  );
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return jsonError(error.status, error.code, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return jsonError(
      400,
      "VALIDATION_ERROR",
      "Input tidak valid.",
      error.flatten().fieldErrors,
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("[API] Prisma error:", error.code, error.meta);

    if (error.code === "P2002") {
      return jsonError(409, "CONFLICT", "Data yang sama sudah ada.");
    }

    if (error.code === "P2003") {
      return jsonError(
        409,
        "RELATION_CONFLICT",
        "Data terkait tidak valid atau masih digunakan.",
      );
    }

    if (error.code === "P2025") {
      return jsonError(404, "NOT_FOUND", "Data tidak ditemukan.");
    }

    if (error.code === "P2034") {
      return jsonError(
        409,
        "TRANSACTION_CONFLICT",
        "Terjadi konflik transaksi. Silakan coba lagi.",
      );
    }
  }

  console.error("[API] Kesalahan tak terduga:", error);
  return jsonError(500, "INTERNAL_ERROR", "Terjadi kesalahan pada server.");
}
