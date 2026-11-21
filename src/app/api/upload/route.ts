import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { errorResponse, jsonData } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
const mimeExt: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
export async function POST(request: NextRequest) {
  try {
    await requireDataIndukOperator(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError(400, "FILE_REQUIRED", "Pilih file yang akan diunggah.");
    if (!mimeExt[file.type]) throw new AppError(415, "FILE_TYPE_INVALID", "Format yang didukung: JPG, PNG, WebP, atau PDF.");
    if (file.size < 1 || file.size > 5 * 1024 * 1024) throw new AppError(413, "FILE_SIZE_INVALID", "Ukuran file maksimal 5 MB.");
    const directory = path.join(process.cwd(), "public", "uploads", "santri");
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}${mimeExt[file.type]}`;
    await writeFile(path.join(directory, filename), Buffer.from(await file.arrayBuffer()), { flag: "wx" });
    return jsonData({ url: `/uploads/santri/${filename}`, filename }, 201);
  } catch (error) { return errorResponse(error); }
}
