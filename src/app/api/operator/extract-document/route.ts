import { NextRequest } from "next/server";
import { z } from "zod";
import { errorResponse, jsonData } from "@/lib/api";
import { requireDataIndukOperator } from "@/lib/data-induk/access";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
const outputSchema = z.object({
  jenis: z.enum(["KK", "AKTA", "IJAZAH"]).optional(),
  nomorKK: z.string().optional(), name: z.string().optional(), nama: z.string().optional(), nis: z.string().optional(), nik: z.string().optional(),
  tempatLahir: z.string().optional(), tanggalLahir: z.string().optional(), alamatLengkap: z.string().optional(),
  namaAyah: z.string().optional(), nikAyah: z.string().optional(), namaIbu: z.string().optional(), nikIbu: z.string().optional(),
  kelas: z.string().optional(), tahunLulus: z.number().int().optional(),
}).passthrough();
export async function POST(request: NextRequest) {
  try {
    await requireDataIndukOperator(request);
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new AppError(503, "GEMINI_NOT_CONFIGURED", "GEMINI_API_KEY belum dikonfigurasi di server.");
    const form = await request.formData();
    const file = form.get("file");
    const jenis = form.get("jenis");
    if (!(file instanceof File)) throw new AppError(400, "FILE_REQUIRED", "Unggah dokumen terlebih dahulu.");
    if (!["KK", "AKTA", "IJAZAH"].includes(String(jenis))) throw new AppError(400, "DOCUMENT_TYPE_INVALID", "Jenis dokumen tidak didukung.");
    if (!new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]).has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) throw new AppError(415, "DOCUMENT_INVALID", "Dokumen harus JPG, PNG, WebP atau PDF dan maksimal 10 MB.");
    const prompt = `Baca dokumen ${jenis} berbahasa Indonesia. Ekstrak hanya data yang benar-benar terlihat. Balas JSON object valid tanpa markdown. Properti yang boleh dipakai: nomorKK,name,nama,nik,nis,tempatLahir,tanggalLahir (YYYY-MM-DD jika jelas),alamatLengkap,namaAyah,nikAyah,namaIbu,nikIbu,kelas,tahunLulus.`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data: Buffer.from(await file.arrayBuffer()).toString("base64") } }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new AppError(502, "GEMINI_REQUEST_FAILED", "Layanan ekstraksi dokumen gagal memproses berkas.");
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new AppError(502, "GEMINI_EMPTY_RESPONSE", "Tidak ada data yang dapat diekstrak dari dokumen.");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { throw new AppError(502, "GEMINI_INVALID_JSON", "Hasil ekstraksi dokumen tidak valid."); }
    const data = outputSchema.safeParse(parsed);
    if (!data.success) throw new AppError(502, "GEMINI_INVALID_DATA", "Struktur hasil ekstraksi tidak sesuai.");
    return jsonData({ extracted: data.data });
  } catch (error) { return errorResponse(error); }
}
