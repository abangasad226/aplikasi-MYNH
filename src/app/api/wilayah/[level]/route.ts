import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400;

const LEVELS = new Set(["provinces", "regencies", "districts", "villages"]);
const CODE_PATTERN = /^\d{2}(?:\.\d{2}){0,2}(?:\.\d{4})?$/;

export async function GET(
  request: NextRequest,
  { params }: { params: { level: string } },
) {
  const { level } = params;
  const parent = request.nextUrl.searchParams.get("parent");

  if (!LEVELS.has(level)) {
    return NextResponse.json({ error: "Tingkatan wilayah tidak valid." }, { status: 400 });
  }

  if (level === "provinces" ? parent !== null : !parent || !CODE_PATTERN.test(parent)) {
    return NextResponse.json({ error: "Kode wilayah induk tidak valid." }, { status: 400 });
  }

  const path = level === "provinces" ? "provinces.json" : `${level}/${parent}.json`;

  try {
    const response = await fetch(`https://wilayah.id/api/${path}`, {
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Daftar wilayah belum dapat dimuat." }, { status: 502 });
    }

    const data: unknown = await response.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return NextResponse.json({ error: "Layanan daftar wilayah sedang tidak tersedia." }, { status: 502 });
  }
}
