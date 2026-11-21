import { NextRequest } from "next/server";
import { Role, StatusTagihan } from "@prisma/client";
import { z } from "zod";
import { errorResponse, jsonData, parseJson } from "@/lib/api";
import { requireRoles } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    await requireRoles(request, [Role.BENDAHARA]);
    const students = await prisma.santri.findMany({ where: { statusAktif: true, tagihan: { some: { status: { in: [StatusTagihan.BELUM_LUNAS, StatusTagihan.CICILAN] } } } }, select: { id: true, name: true, nis: true, kelas: true, noHpWali: true, noHpAyah: true, noHpIbu: true, tagihan: { where: { status: { in: [StatusTagihan.BELUM_LUNAS, StatusTagihan.CICILAN] } }, select: { id: true, jenisTagihan: true, nominalTagihan: true, nominalTerbayar: true, bulan: true, tahun: true, jenisPembayaranKustom: { select: { nama: true } } }, orderBy: [{ tahun: "asc" }, { bulan: "asc" }] } }, orderBy: { name: "asc" } });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const reminders = await prisma.pengingatTagihanWA.findMany({ where: { createdAt: { gte: today } }, select: { santriId: true } });
    const sentToday = new Set(reminders.map((row) => row.santriId));
    return jsonData({ items: students.map((student) => ({ id: student.id, name: student.name, nis: student.nis, kelas: student.kelas, phone: student.noHpWali || student.noHpAyah || student.noHpIbu || null, sentToday: sentToday.has(student.id), bills: student.tagihan.map((bill) => ({ name: bill.jenisPembayaranKustom?.nama || bill.jenisTagihan.replaceAll("_", " "), bulan: bill.bulan, tahun: bill.tahun, sisa: (bill.nominalTagihan - bill.nominalTerbayar).toString() })) })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRoles(request, [Role.BENDAHARA]);
    const parsed = z.object({ santriId: z.string().min(1) }).safeParse(await parseJson(request));
    if (!parsed.success) throw new AppError(400, "VALIDATION_ERROR", "Santri tidak valid.");
    const hasDebt = await prisma.tagihan.count({ where: { santriId: parsed.data.santriId, status: { in: [StatusTagihan.BELUM_LUNAS, StatusTagihan.CICILAN] } } });
    if (!hasDebt) throw new AppError(404, "TUNGGAKAN_NOT_FOUND", "Santri tidak memiliki tunggakan aktif.");
    const reminder = await prisma.pengingatTagihanWA.create({ data: { santriId: parsed.data.santriId, userId: actor.id } });
    return jsonData({ item: reminder }, 201);
  } catch (error) { return errorResponse(error); }
}
