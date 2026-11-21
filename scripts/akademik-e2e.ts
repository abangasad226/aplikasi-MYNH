#!/usr/bin/env -S npx tsx
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import { Prisma, PrismaClient, Role, type JenisKegiatan, type StatusKehadiran } from "@prisma/client";
import bcrypt from "bcryptjs";
import type {
  AkademikOptions,
  MapelItem,
  NilaiInput,
  NilaiRow,
  PeriodeAkademik,
  RaporDetail,
  RaporRosterItem,
  RaporSummary,
} from "../src/lib/akademik-types";

type Reply = { status: number; body: unknown; headers: Headers };
type Session = { cookie: string; id: string; role: Role };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
class SafeFailure extends Error {}

const runId = randomBytes(10).toString("hex");
const label = `E2E AKADEMIK ${runId}`;
const admin = "/api/admin/akademik";
const ganjil: PeriodeAkademik = { semester: "GANJIL", tahunAjaran: "2026/2027" };
const genap: PeriodeAkademik = { semester: "GENAP", tahunAjaran: "2026/2027" };
let stage = "configuration";
let passedGroups = 0;
let httpChecks = 0;

// Every delete is constrained to exact IDs belonging to this invocation.
const owned = {
  users: new Set<string>(),
  guru: new Set<string>(),
  santri: new Set<string>(),
  mapels: new Set<string>(),
  mapelCodes: new Set<string>(),
  grades: new Set<string>(),
  reports: new Set<string>(),
  attendance: new Set<string>(),
  discipline: new Set<string>(),
};
const ids = (set: Set<string>) => [...set];
const query = (path: string, values: Record<string, string>) => `${path}?${new URLSearchParams(values)}`;
const digits = (length: number) => "9" + Array.from({ length: length - 1 }, () => randomInt(10)).join("");

function pass(name: string) {
  passedGroups += 1;
  console.log(`PASS ${name}`);
}

function object(value: unknown): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function status(reply: Reply, expected: number) {
  if (reply.status !== expected) {
    throw new SafeFailure(`Expected HTTP ${expected}, received HTTP ${reply.status}; response details withheld.`);
  }
  httpChecks += 1;
  if (expected >= 400) assert.equal(typeof object(object(reply.body).error).code, "string");
}

function data<T>(reply: Reply, expected = 200): T {
  status(reply, expected);
  const envelope = object(reply.body);
  assert.ok("data" in envelope && !("error" in envelope));
  return envelope.data as T;
}

function rejected(reply: Reply, expected: number, code?: string) {
  status(reply, expected);
  if (code) assert.equal(object(object(reply.body).error).code, code);
}

function configuration() {
  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password?.trim()) {
    throw new SafeFailure("Set SEED_DEFAULT_PASSWORD to the existing seeded accounts' password before running; credentials will not be changed.");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new SafeFailure("Set DATABASE_URL to the same migrated database used by the running application.");
  }
  let url: URL;
  try {
    url = new URL(process.env.TEST_BASE_URL ?? "http://localhost:3000");
  } catch {
    throw new SafeFailure("TEST_BASE_URL must be an HTTP(S) origin, for example http://localhost:3000.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new SafeFailure("TEST_BASE_URL must be an HTTP(S) origin without credentials, a path, query, or fragment.");
  }
  return { base: url.origin, password };
}

async function request(base: string, method: Method, path: string, session?: Session, body?: unknown): Promise<Reply> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(session ? { Cookie: session.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error", // Never forward authentication through redirects.
      cache: "no-store",
      signal: AbortSignal.timeout(180_000), // Longer than the API's transaction timeout.
    });
  } catch {
    throw new SafeFailure("HTTP request failed. Start the server and verify TEST_BASE_URL and its database connection.");
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new SafeFailure(`HTTP ${response.status} did not return JSON; check the server and academic migrations.`);
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function login(base: string, email: string, password: string, expected: { id: string; role: Role }): Promise<Session> {
  const reply = await request(base, "POST", "/api/auth/login", undefined, { email, password });
  if (reply.status !== 200) {
    throw new SafeFailure(`Login returned HTTP ${reply.status}. Verify the existing seeded password, server AUTH_SECRET, and matching DATABASE_URL; do not reset accounts.`);
  }
  const result = data<{ user: { id: string; role: Role } }>(reply);
  if (result.user.id !== expected.id || result.user.role !== expected.role) {
    throw new SafeFailure("Authenticated identity does not match the fixture database; verify the server and script use the same DATABASE_URL.");
  }
  const cookie = reply.headers.getSetCookie()
    .map((header) => header.split(";", 1)[0])
    .find((pair) => pair.startsWith("pesantren_session="));
  if (!cookie || cookie === "pesantren_session=") throw new SafeFailure("Login did not issue the expected session cookie.");
  return { cookie, id: result.user.id, role: result.user.role };
}

// Recover committed fixture IDs even if the HTTP response failed.
async function collectAcademicIds(db: PrismaClient) {
  if (owned.guru.size && owned.mapelCodes.size) {
    const rows = await db.mataPelajaran.findMany({
      where: { pengampuId: { in: ids(owned.guru) }, kodeMapel: { in: ids(owned.mapelCodes) } },
      select: { id: true },
    });
    rows.forEach((row) => owned.mapels.add(row.id));
  }
  if (!owned.santri.size) return;
  const reports = await db.raporSantri.findMany({ where: { santriId: { in: ids(owned.santri) } }, select: { id: true } });
  reports.forEach((row) => owned.reports.add(row.id));
  if (owned.mapels.size) {
    const grades = await db.nilaiUlangan.findMany({
      where: { santriId: { in: ids(owned.santri) }, mapelId: { in: ids(owned.mapels) } },
      select: { id: true },
    });
    grades.forEach((row) => owned.grades.add(row.id));
  }
}

async function cleanup(db: PrismaClient) {
  await collectAcademicIds(db);
  await db.$transaction(async (tx) => {
    await tx.raporSantri.deleteMany({ where: { id: { in: ids(owned.reports) }, santriId: { in: ids(owned.santri) } } });
    await tx.nilaiUlangan.deleteMany({ where: { id: { in: ids(owned.grades) }, santriId: { in: ids(owned.santri) }, mapelId: { in: ids(owned.mapels) } } });
    await tx.mataPelajaran.deleteMany({ where: { id: { in: ids(owned.mapels) }, pengampuId: { in: ids(owned.guru) }, kodeMapel: { in: ids(owned.mapelCodes) } } });
    await tx.logAkademikDanNgaji.deleteMany({ where: { id: { in: ids(owned.attendance) }, santriId: { in: ids(owned.santri) } } });
    await tx.logPelanggaran.deleteMany({ where: { id: { in: ids(owned.discipline) }, santriId: { in: ids(owned.santri) } } });
    await tx.santri.deleteMany({ where: { id: { in: ids(owned.santri) } } });
    await tx.guruDanTendik.deleteMany({ where: { id: { in: ids(owned.guru) } } });
    await tx.user.deleteMany({ where: { id: { in: ids(owned.users) }, role: Role.WALI_SANTRI } });

    // Verify removal inside the transaction; never cascade into unrelated data.
    const remaining = await Promise.all([
      tx.raporSantri.count({ where: { id: { in: ids(owned.reports) } } }),
      tx.nilaiUlangan.count({ where: { id: { in: ids(owned.grades) } } }),
      tx.mataPelajaran.count({ where: { id: { in: ids(owned.mapels) } } }),
      tx.logAkademikDanNgaji.count({ where: { id: { in: ids(owned.attendance) } } }),
      tx.logPelanggaran.count({ where: { id: { in: ids(owned.discipline) } } }),
      tx.santri.count({ where: { id: { in: ids(owned.santri) } } }),
      tx.guruDanTendik.count({ where: { id: { in: ids(owned.guru) } } }),
      tx.user.count({ where: { id: { in: ids(owned.users) } } }),
    ]);
    assert.ok(remaining.every((count) => count === 0));
  }, { timeout: 30_000, maxWait: 15_000 });
}

async function integration(db: PrismaClient, config: ReturnType<typeof configuration>) {
  stage = "seeded authentication";
  const seeded = [
    ["bendahara@pesantren.test", Role.BENDAHARA],
    ["ustadz@pesantren.test", Role.USTADZ_PENGURUS],
    ["wali@pesantren.test", Role.WALI_SANTRI],
    ["kasir@pesantren.test", Role.KASIR_KANTIN],
  ] as const;
  const sessions: Session[] = [];
  for (const [email, role] of seeded) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, role: true } });
    if (!user || user.role !== role) throw new SafeFailure("Required seeded accounts/roles are missing. Prepare the development database separately; this script never seeds or updates credentials.");
    sessions.push(await login(config.base, email, config.password, user));
  }
  const [bendahara, ustadz, wali, kasir] = sessions;
  pass("four seeded roles authenticated via login API");

  stage = "isolated fixture setup";
  const outsiderPassword = randomBytes(32).toString("base64url");
  const outsiderUser = await db.user.create({ data: {
    email: `akademik-e2e-${runId}@example.invalid`,
    passwordHash: await bcrypt.hash(outsiderPassword, 12),
    name: `${label} outsider wali (fixture)`,
    role: Role.WALI_SANTRI,
  } });
  owned.users.add(outsiderUser.id);
  const outsider = await login(config.base, outsiderUser.email, outsiderPassword, outsiderUser);
  const guru = await db.guruDanTendik.create({ data: {
    nik: digits(16), namaLengkap: `${label} Guru (fixture)`,
    tempatLahir: "Fixture", tanggalLahir: new Date("1990-01-01T00:00:00Z"),
    jenisKelamin: "LAKI_LAKI", pendidikanTerakhir: "S1", jabatan: "GURU_MAPEL",
    statusKepegawaian: "GTT", noHp: "080000000000", alamat: "Alamat fixture E2E",
    statusAktif: true, tanggalMulaiTugas: new Date("2026-07-01T00:00:00Z"),
  } });
  owned.guru.add(guru.id);
  const kelas = `E2E-AKAD-${runId}-A`;
  const otherKelas = `E2E-AKAD-${runId}-B`;
  assert.equal(await db.santri.count({ where: { kelas: { in: [kelas, otherKelas] } } }), 0);

  async function createSantri(suffix: string, studentClass: string) {
    // Allocate fixture-only indices without changing an existing wallet.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const row = await db.santri.create({ data: {
          nis: `E2E-${randomBytes(12).toString("hex")}`,
          nik: digits(16), barcodeCode: `E2E-${randomBytes(16).toString("hex")}`,
          walletIndex: randomInt(10_000, 1_000_000),
          walletAddress: `0x${randomBytes(20).toString("hex")}`,
          name: `${label} Santri ${suffix} (fixture)`, kelas: studentClass, kamar: "E2E fixture only",
          waliId: wali.id, namaWali: "Wali fixture akademik", statusAktif: true,
          statusSantri: "AKTIF", statusMukim: "MUKIM", tahunMasuk: 2026,
          saldoJajan: 0n, limitJajanHarian: 0n, isDispensasiInfaq: true,
          tempatLahir: "Fixture", tanggalLahir: new Date("2012-01-01T00:00:00Z"),
          jenisKelamin: "LAKI_LAKI", alamatLengkap: "Alamat fixture E2E",
          desaKelurahan: "Fixture", kecamatan: "Fixture", kabupatenKota: "Fixture", provinsi: "Fixture",
          nomorKK: digits(16), namaAyah: "Ayah fixture", namaIbu: "Ibu fixture",
        } });
        owned.santri.add(row.id);
        return row;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      }
    }
    throw new SafeFailure("Could not allocate unique fixture identifiers; no existing identifiers were changed.");
  }
  const a = await createSantri("A", kelas);
  const b = await createSantri("B", kelas);
  const c = await createSantri("C", otherKelas);
  assert.equal(new Set([a.walletIndex, b.walletIndex, c.walletIndex]).size, 3);

  const activities: JenisKegiatan[] = ["SHOLAT_JEMAAH", "NGAJI_KITAB", "TAHFIDZ", "SEKOLAH_FORMAL"];
  const boundaries: { date: string; status: StatusKehadiran; points: number }[] = [
    { date: "2026-06-30", status: "ALPA", points: 101 }, // Excluded from both semesters.
    { date: "2026-07-01", status: "HADIR", points: 2 },
    { date: "2026-12-31", status: "SAKIT", points: 3 },
    { date: "2027-01-01", status: "IZIN", points: 5 },
    { date: "2027-06-30", status: "ALPA", points: 7 },
    { date: "2027-07-01", status: "HADIR", points: 103 }, // Exclusive end of GENAP.
  ];
  let attendanceToEdit = "";
  let disciplineToEdit = "";
  for (const boundary of boundaries) {
    for (const activity of activities) {
      const log = await db.logAkademikDanNgaji.create({ data: {
        santriId: a.id, tanggal: new Date(`${boundary.date}T00:00:00Z`),
        jenisKegiatan: activity, statusKehadiran: boundary.status, catatanUstadz: `${label} attendance`,
      } });
      owned.attendance.add(log.id);
      if (boundary.date === "2026-07-01" && activity === "SHOLAT_JEMAAH") attendanceToEdit = log.id;
    }
    const log = await db.logPelanggaran.create({ data: {
      santriId: a.id, tanggal: new Date(`${boundary.date}T00:00:00Z`), kategori: "RINGAN",
      deskripsiPelanggaran: `${label} discipline ${boundary.date}`, poin: boundary.points,
      tindakanPembinaan: "Pembinaan fixture", dicatatOlehId: ustadz.id,
    } });
    owned.discipline.add(log.id);
    if (boundary.date === "2026-07-01") disciplineToEdit = log.id;
  }
  // Same-period distractors prove that aggregation is per student, not per class.
  for (const student of [b, c]) {
    const log = await db.logAkademikDanNgaji.create({ data: {
      santriId: student.id, tanggal: new Date("2026-12-31T00:00:00Z"),
      jenisKegiatan: "SEKOLAH_FORMAL", statusKehadiran: "ALPA", catatanUstadz: `${label} distractor`,
    } });
    owned.attendance.add(log.id);
    const discipline = await db.logPelanggaran.create({ data: {
      santriId: student.id, tanggal: new Date("2026-12-31T00:00:00Z"), kategori: "BERAT",
      deskripsiPelanggaran: `${label} distractor`, poin: 99,
      tindakanPembinaan: "Pembinaan fixture", dicatatOlehId: ustadz.id,
    } });
    owned.discipline.add(discipline.id);
  }
  pass("isolated students, outsider wali, guru, attendance and discipline fixtures");

  async function api(method: Method, path: string, actor?: Session, body?: unknown) {
    try {
      return await request(config.base, method, path, actor, body);
    } finally {
      if (method !== "GET") await collectAcademicIds(db);
    }
  }
  function mapelBody(suffix: string, kategori: MapelItem["kategori"] = "SEKOLAH_FORMAL") {
    const kodeMapel = `E2E_${runId}_${suffix}`.toUpperCase();
    owned.mapelCodes.add(kodeMapel);
    return { kodeMapel, namaMapel: `${label} ${suffix}`, kategori, pengampuId: guru.id };
  }
  async function createMapel(body: ReturnType<typeof mapelBody>, actor: Session) {
    const item = data<{ item: MapelItem }>(await api("POST", `${admin}/mapel`, actor, body), 201).item;
    assert.ok(owned.mapels.has(item.id));
    assert.equal(item.kkm, 75);
    assert.equal(item.pengampu.id, guru.id);
    assert.equal(item.kodeMapel, body.kodeMapel);
    return item;
  }
  const grade = (santriId: string, scores: [number, number, number], note: string | null = "Fixture grade"): NilaiInput => ({
    santriId, nilaiHarian: scores[0], nilaiUTS: scores[1], nilaiUAS: scores[2], catatanGuru: note,
  });
  const gradeBody = (mapelId: string, items: NilaiInput[], periode = ganjil) => ({ kelas, mapelId, ...periode, items });
  const reportBody = (santriId: string, statusRapor: "DRAFT" | "DITERBITKAN" = "DRAFT", periode = ganjil) => ({
    santriId, ...periode, statusRapor, catatanWaliKelas: "Catatan fixture", keputusanKenaikan: "Naik kelas (fixture)",
  });
  const previewPath = (santriId: string, periode = ganjil) => query(`${admin}/rapor/preview`, { santriId, ...periode });
  const listPath = (santriId: string) => query("/api/wali/rapor", { santriId });
  const gradePath = (mapelId: string, periode = ganjil) => query(`${admin}/nilai`, { kelas, mapelId, ...periode });
  const getReport = async (id: string, actor: Session) => data<{ item: RaporDetail }>(await api("GET", `/api/rapor/${id}`, actor)).item;
  const preview = async (santriId: string, periode = ganjil, actor = bendahara) => data<{ item: RaporDetail }>(await api("GET", previewPath(santriId, periode), actor)).item;
  const list = async (santriId: string, actor = wali) => data<{ items: RaporSummary[] }>(await api("GET", listPath(santriId), actor)).items;
  const saveReport = async (body: ReturnType<typeof reportBody>, actor = bendahara) => data<{ item: RaporDetail }>(await api("PUT", `${admin}/rapor`, actor, body)).item;
  const saveGrades = async (body: ReturnType<typeof gradeBody>, actor = bendahara) => {
    assert.equal(data<{ tersimpan: number }>(await api("PUT", `${admin}/nilai`, actor, body)).tersimpan, body.items.length);
  };
  const fixtureGrades = () => db.nilaiUlangan.findMany({
    where: { santriId: { in: ids(owned.santri) }, mapelId: { in: ids(owned.mapels) } }, orderBy: { id: "asc" },
  });

  stage = "mapel creation and default KKM";
  const schoolInput = mapelBody("S");
  const ngajiInput = mapelBody("N", "NGAJI_DINIYAH");
  const tahfidzInput = mapelBody("T", "TAHFIDZ");
  const unusedInput = mapelBody("U");
  const school = await createMapel(schoolInput, bendahara);
  const ngaji = await createMapel(ngajiInput, ustadz);
  const tahfidz = await createMapel(tahfidzInput, ustadz);
  const unused = await createMapel(unusedInput, bendahara);
  const draftPayload = { ...reportBody(a.id), keputusanKenaikan: "" };
  const draft = await saveReport(draftPayload);
  assert.ok(draft.id && owned.reports.has(draft.id));
  const reportId = draft.id;

  const authorizedReads = [
    `${admin}/opsi`, `${admin}/mapel`, gradePath(school.id),
    query(`${admin}/rapor`, { kelas, ...ganjil }), previewPath(a.id),
  ];
  for (const actor of [bendahara, ustadz]) {
    for (const path of authorizedReads) data<unknown>(await api("GET", path, actor));
    assert.equal((await getReport(reportId, actor)).statusRapor, "DRAFT");
  }
  const options = data<AkademikOptions>(await api("GET", `${admin}/opsi`, ustadz));
  assert.equal(options.actor.id, ustadz.id);
  assert.ok(options.kelas.includes(kelas) && options.kelas.includes(otherKelas));
  assert.ok(options.guru.some((item) => item.id === guru.id));
  const mapels = data<{ items: MapelItem[] }>(await api("GET", `${admin}/mapel`, bendahara)).items;
  for (const item of [school, ngaji, tahfidz, unused]) assert.ok(mapels.some((row) => row.id === item.id));

  const unauthorizedCreate = mapelBody("X");
  const forbiddenRoutes: { method: Method; path: string; body?: unknown }[] = [
    ...authorizedReads.map((path) => ({ method: "GET" as const, path })),
    { method: "POST", path: `${admin}/mapel`, body: unauthorizedCreate },
    { method: "PATCH", path: `${admin}/mapel/${unused.id}`, body: { ...unusedInput, kkm: 80 } },
    { method: "DELETE", path: `${admin}/mapel/${unused.id}` },
    { method: "PUT", path: `${admin}/nilai`, body: gradeBody(school.id, [grade(a.id, [10, 20, 30])]) },
    { method: "PUT", path: `${admin}/rapor`, body: draftPayload },
  ];
  for (const actor of [undefined, wali, kasir]) {
    for (const route of forbiddenRoutes) {
      stage = `authorization ${actor?.role ?? "anonymous"} ${route.method} ${route.path.split("?")[0]}`;
      rejected(await api(route.method, route.path, actor, route.body), actor ? 403 : 401, actor ? "FORBIDDEN" : "UNAUTHENTICATED");
    }
  }
  stage = "report read authorization and draft visibility";
  rejected(await api("GET", `/api/rapor/${reportId}`), 401, "UNAUTHENTICATED");
  rejected(await api("GET", listPath(a.id)), 401, "UNAUTHENTICATED");
  rejected(await api("GET", `/api/rapor/${reportId}`, kasir), 403, "FORBIDDEN");
  rejected(await api("GET", listPath(a.id), kasir), 403, "FORBIDDEN");
  assert.deepEqual(await list(a.id), []);
  rejected(await api("GET", `/api/rapor/${reportId}`, wali), 404, "RAPOR_NOT_FOUND");
  rejected(await api("GET", `/api/rapor/${reportId}`, outsider), 404, "RAPOR_NOT_FOUND");
  rejected(await api("GET", listPath(a.id), outsider), 403, "FORBIDDEN");
  pass("admin role matrix, anonymous 401, forbidden 403 and private drafts");

  stage = "mapel update and unused deletion";
  for (const [kkm, actor] of [[0, ustadz], [100, bendahara]] as const) {
    const updated = data<{ item: MapelItem }>(await api("PATCH", `${admin}/mapel/${unused.id}`, actor, {
      ...unusedInput, namaMapel: `${label} updated unused`, kkm,
    })).item;
    assert.equal(updated.id, unused.id);
    assert.equal(updated.kkm, kkm);
    assert.equal(updated.namaMapel, `${label} updated unused`);
  }
  assert.equal(data<{ deleted: boolean }>(await api("DELETE", `${admin}/mapel/${unused.id}`, ustadz)).deleted, true);
  assert.equal(await db.mataPelajaran.findUnique({ where: { id: unused.id } }), null);
  pass("mapel CRUD, default KKM 75 and inclusive KKM endpoints");

  const schoolItems = [grade(a.id, [79, 80, 82], "School fixture"), grade(b.id, [0, 0, 0], "")];
  const schoolBatch = gradeBody(school.id, schoolItems);
  stage = "validation KKM bounds and integer types";
  const invalidMapel = mapelBody("V");
  for (const value of [-1, 101, 0.5, "75", null]) {
    rejected(await api("POST", `${admin}/mapel`, bendahara, { ...invalidMapel, kkm: value }), 400, "VALIDATION_ERROR");
  }
  rejected(await api("PATCH", `${admin}/mapel/${school.id}`, ustadz, { ...schoolInput, kkm: 75.5 }), 400, "VALIDATION_ERROR");
  for (const field of ["nilaiHarian", "nilaiUTS", "nilaiUAS"] as const) {
    for (const value of [-1, 101, 0.5, "80", null]) {
      stage = `validation ${field} bounds and integer types`;
      rejected(await api("PUT", `${admin}/nilai`, bendahara, {
        ...schoolBatch, items: [{ ...schoolItems[0], [field]: value }],
      }), 400, "VALIDATION_ERROR");
    }
  }
  stage = "validation duplicate students and missing values";
  rejected(await api("PUT", `${admin}/nilai`, ustadz, { ...schoolBatch, items: [schoolItems[0], schoolItems[0]] }), 400, "VALIDATION_ERROR");
  rejected(await api("PUT", `${admin}/nilai`, ustadz, { ...schoolBatch, items: [] }), 400, "VALIDATION_ERROR");
  const { nilaiUAS: omitted, ...incomplete } = schoolItems[0];
  void omitted;
  rejected(await api("PUT", `${admin}/nilai`, ustadz, { ...schoolBatch, items: [incomplete] }), 400, "VALIDATION_ERROR");
  for (const tahunAjaran of ["2026/2028", "2026/2026", "2027/2026", "2026-2027"]) {
    stage = "validation consecutive academic years on all period endpoints";
    for (const path of [
      query(`${admin}/nilai`, { kelas, mapelId: school.id, semester: "GANJIL", tahunAjaran }),
      query(`${admin}/rapor`, { kelas, semester: "GANJIL", tahunAjaran }),
      query(`${admin}/rapor/preview`, { santriId: a.id, semester: "GANJIL", tahunAjaran }),
    ]) rejected(await api("GET", path, bendahara), 400, "VALIDATION_ERROR");
    rejected(await api("PUT", `${admin}/nilai`, bendahara, { ...schoolBatch, tahunAjaran }), 400, "VALIDATION_ERROR");
    rejected(await api("PUT", `${admin}/rapor`, ustadz, { ...draftPayload, tahunAjaran }), 400, "VALIDATION_ERROR");
  }
  assert.deepEqual(await fixtureGrades(), []);
  assert.equal(await db.mataPelajaran.count({ where: { kodeMapel: invalidMapel.kodeMapel, pengampuId: guru.id } }), 0);
  pass("400 validation: score/KKM bounds, integers, years, duplicate IDs and incomplete grades");

  stage = "mass upsert arithmetic, predicates and zero scores";
  await saveGrades(schoolBatch, ustadz);
  await saveGrades(gradeBody(ngaji.id, [grade(a.id, [90, 90, 90])]), bendahara);
  await saveGrades(gradeBody(tahfidz.id, [grade(a.id, [70, 70, 70])]), ustadz);
  const firstGrades = await fixtureGrades();
  assert.equal(firstGrades.length, 4);
  assert.equal(firstGrades.find((row) => row.mapelId === ngaji.id)?.nilaiAkhir, 90);
  assert.equal(firstGrades.find((row) => row.mapelId === ngaji.id)?.predikat, "A");
  assert.equal(firstGrades.find((row) => row.mapelId === tahfidz.id)?.nilaiAkhir, 70);
  assert.equal(firstGrades.find((row) => row.mapelId === tahfidz.id)?.predikat, "C");
  const firstSchool = firstGrades.find((row) => row.santriId === a.id && row.mapelId === school.id)!;
  const zeroSchool = firstGrades.find((row) => row.santriId === b.id && row.mapelId === school.id)!;
  assert.ok(firstSchool && zeroSchool);
  assert.equal(firstSchool.nilaiAkhir, 80.33);
  assert.equal(firstSchool.predikat, "B");
  assert.deepEqual([zeroSchool.nilaiHarian, zeroSchool.nilaiUTS, zeroSchool.nilaiUAS, zeroSchool.nilaiAkhir], [0, 0, 0, 0]);
  assert.equal(zeroSchool.predikat, "D");
  assert.equal(zeroSchool.catatanGuru, null);
  const repeatedBatch = { ...schoolBatch, items: [{ ...schoolItems[0], catatanGuru: "Repeated upsert fixture" }, schoolItems[1]] };
  await saveGrades(repeatedBatch, bendahara);
  const repeatedGrades = await fixtureGrades();
  assert.equal(repeatedGrades.length, firstGrades.length);
  assert.deepEqual(repeatedGrades.map((row) => row.id), firstGrades.map((row) => row.id));
  assert.equal(repeatedGrades.find((row) => row.id === firstSchool.id)?.catatanGuru, "Repeated upsert fixture");
  const gradeRoster = data<{ items: NilaiRow[] }>(await api("GET", gradePath(school.id), ustadz)).items;
  assert.deepEqual(gradeRoster.map((row) => row.santri.id).sort(), [a.id, b.id].sort());
  assert.equal(gradeRoster.find((row) => row.santri.id === a.id)?.nilai?.nilaiAkhir, 80.33);
  assert.ok(gradeRoster.every((row) => !row.diterbitkan));
  rejected(await api("DELETE", `${admin}/mapel/${school.id}`, bendahara), 409, "RELATION_CONFLICT");
  assert.ok(await db.mataPelajaran.findUnique({ where: { id: school.id } }));

  stage = "cross-class batch atomic rejection";
  const beforeCrossClass = await fixtureGrades();
  rejected(await api("PUT", `${admin}/nilai`, ustadz, gradeBody(school.id, [
    grade(a.id, [11, 11, 11]), grade(c.id, [22, 22, 22]),
  ])), 422, "KELAS_TIDAK_SESUAI");
  assert.deepEqual(await fixtureGrades(), beforeCrossClass); // Includes valid row timestamps.
  assert.equal(await db.nilaiUlangan.count({ where: { santriId: c.id } }), 0);
  pass("mass upsert, rounding, A/B/C/D, zero scores, unique IDs and atomic cross-class rejection");

  stage = "semester preview boundaries and academic categories";
  await saveGrades(gradeBody(school.id, [grade(a.id, [75, 75, 75])], genap), ustadz);
  const oddPreview = await preview(a.id);
  const evenPreview = await preview(a.id, genap, ustadz);
  assert.equal(oddPreview.id, reportId);
  assert.equal(evenPreview.id, null);
  for (const [item, period, start, end, present, sick, permitted, absent, totalPoints, selectedBoundaries] of [
    [oddPreview, ganjil, "2026-07-01", "2026-12-31", 1, 1, 0, 0, 5, boundaries.slice(1, 3)],
    [evenPreview, genap, "2027-01-01", "2027-06-30", 0, 0, 1, 1, 12, boundaries.slice(3, 5)],
  ] as const) {
    assert.deepEqual(item.isi.periode, { ...period, mulai: start, selesai: end });
    assert.equal(item.isi.santri.id, a.id);
    assert.equal(item.isi.santri.namaWali, "Wali fixture akademik");
    for (const activity of activities) {
      assert.deepEqual(item.isi.absensi[activity], { HADIR: present, SAKIT: sick, IZIN: permitted, ALPA: absent, total: 2 });
    }
    assert.deepEqual(item.isi.totalAbsensi, { HADIR: present * 4, SAKIT: sick * 4, IZIN: permitted * 4, ALPA: absent * 4, total: 8 });
    assert.equal(item.isi.totalPoin, totalPoints);
    assert.deepEqual(item.isi.pelanggaran, selectedBoundaries.map((boundary) => ({
      tanggal: boundary.date, kategori: "RINGAN", deskripsi: `${label} discipline ${boundary.date}`,
      poin: boundary.points, tindakan: "Pembinaan fixture",
    })));
  }
  assert.equal(oddPreview.isi.nilai.length, 3);
  for (const [mapel, score, predicate, complete] of [
    [school, 80.33, "B", true], [ngaji, 90, "A", true], [tahfidz, 70, "C", false],
  ] as const) {
    const row = oddPreview.isi.nilai.find((item) => item.mapel.id === mapel.id);
    assert.ok(row);
    assert.equal(row.nilaiAkhir, score);
    assert.equal(row.predikat, predicate);
    assert.equal(row.tuntas, complete);
    assert.equal(row.mapel.kategori, mapel.kategori);
    assert.equal(row.mapel.pengampu.id, guru.id);
    assert.equal(row.mapel.kkm, 75);
  }
  assert.equal(evenPreview.isi.nilai.length, 1);
  assert.equal(evenPreview.isi.nilai[0].nilaiAkhir, 75);
  assert.equal(evenPreview.isi.nilai[0].tuntas, true);
  pass("GANJIL/GENAP inclusive boundaries, four activities, discipline and school/ngaji/tahfidz grades");

  stage = "publication prerequisites and report upsert identity";
  rejected(await api("PUT", `${admin}/rapor`, bendahara, reportBody(c.id, "DITERBITKAN")), 422, "NILAI_KOSONG");
  assert.equal(await db.raporSantri.count({ where: { santriId: c.id } }), 0);
  for (const keputusanKenaikan of ["", "   "]) {
    rejected(await api("PUT", `${admin}/rapor`, ustadz, { ...reportBody(a.id, "DITERBITKAN"), keputusanKenaikan }), 400, "VALIDATION_ERROR");
  }
  const repeatedDraft = await saveReport({ ...draftPayload, catatanWaliKelas: "Updated draft fixture" }, ustadz);
  assert.equal(repeatedDraft.id, reportId);
  assert.equal(repeatedDraft.catatanWaliKelas, "Updated draft fixture");
  assert.equal(await db.raporSantri.count({ where: { santriId: a.id, ...ganjil } }), 1);
  assert.deepEqual(await list(a.id), []);
  const published = await saveReport(reportBody(a.id, "DITERBITKAN"), bendahara);
  assert.equal(published.id, reportId);
  assert.equal(published.statusRapor, "DITERBITKAN");
  assert.equal(published.keputusanKenaikan, "Naik kelas (fixture)");
  assert.equal(published.catatanWaliKelas, "Catatan fixture");
  assert.ok(published.tanggalTerbit && Number.isFinite(Date.parse(published.tanggalTerbit)));
  assert.deepEqual(published.isi, oddPreview.isi);
  for (const actor of [wali, bendahara, ustadz]) assert.deepEqual(await getReport(reportId, actor), published);
  assert.deepEqual((await list(a.id)).map((row) => row.id), [reportId]);
  rejected(await api("GET", `/api/rapor/${reportId}`, outsider), 404, "RAPOR_NOT_FOUND");
  rejected(await api("GET", listPath(a.id), outsider), 403, "FORBIDDEN");
  rejected(await api("GET", `/api/rapor/${reportId}`, kasir), 403, "FORBIDDEN");
  const roster = data<{ items: RaporRosterItem[] }>(await api("GET", query(`${admin}/rapor`, { kelas, ...ganjil }), ustadz)).items;
  assert.deepEqual(roster.map((row) => row.santri.id).sort(), [a.id, b.id].sort());
  assert.equal(roster.find((row) => row.santri.id === a.id)?.rapor?.statusRapor, "DITERBITKAN");
  pass("publication prerequisites, report upsert and published owner-only access");

  stage = "published metadata and grade freeze";
  const storedPublished = await db.raporSantri.findUniqueOrThrow({ where: { id: reportId } });
  assert.deepEqual(storedPublished.snapshot, published.isi);
  const gradesBeforeFreeze = await fixtureGrades();
  rejected(await api("PUT", `${admin}/rapor`, ustadz, {
    ...reportBody(a.id, "DITERBITKAN"), catatanWaliKelas: "Must not persist", keputusanKenaikan: "Must not persist",
  }), 409, "RAPOR_TERBIT");
  rejected(await api("PUT", `${admin}/nilai`, bendahara, gradeBody(school.id, [
    grade(b.id, [88, 88, 88]), grade(a.id, [99, 99, 99]),
  ])), 409, "RAPOR_TERBIT");
  assert.deepEqual(await fixtureGrades(), gradesBeforeFreeze);
  assert.deepEqual(await db.raporSantri.findUniqueOrThrow({ where: { id: reportId } }), storedPublished);
  const frozenRoster = data<{ items: NilaiRow[] }>(await api("GET", gradePath(school.id), ustadz)).items;
  assert.equal(frozenRoster.find((row) => row.santri.id === a.id)?.diterbitkan, true);
  assert.equal(frozenRoster.find((row) => row.santri.id === b.id)?.diterbitkan, false);
  pass("409 published metadata/grade freeze without partial batch writes");

  stage = "immutable published snapshot after fixture source edits";
  assert.ok(owned.attendance.has(attendanceToEdit) && owned.discipline.has(disciplineToEdit));
  await db.logAkademikDanNgaji.update({ where: { id: attendanceToEdit, santriId: a.id }, data: { statusKehadiran: "ALPA" } });
  await db.logPelanggaran.update({ where: { id: disciplineToEdit, santriId: a.id }, data: { poin: 12, tindakanPembinaan: "Updated fixture treatment" } });
  const changedSchool = { ...schoolInput, namaMapel: `${label} school renamed`, kkm: 95 };
  const editedMapel = data<{ item: MapelItem }>(await api("PATCH", `${admin}/mapel/${school.id}`, ustadz, changedSchool)).item;
  assert.equal(editedMapel.kkm, 95);
  assert.equal(editedMapel.namaMapel, changedSchool.namaMapel);
  for (const actor of [wali, bendahara, ustadz]) assert.deepEqual(await getReport(reportId, actor), published);
  assert.deepEqual(await preview(a.id), published);
  assert.deepEqual(await db.raporSantri.findUniqueOrThrow({ where: { id: reportId } }), storedPublished);
  assert.deepEqual(await fixtureGrades(), gradesBeforeFreeze);
  pass("published snapshot unchanged after fixture-only attendance, discipline and mapel edits");

  stage = "withdrawal revokes access and enables editing and republication";
  const withdrawn = await saveReport(reportBody(a.id), ustadz);
  assert.equal(withdrawn.id, reportId);
  assert.equal(withdrawn.statusRapor, "DRAFT");
  assert.equal(withdrawn.tanggalTerbit, null);
  assert.equal((await db.raporSantri.findUniqueOrThrow({ where: { id: reportId } })).snapshot, null);
  assert.equal(withdrawn.isi.totalPoin, 15);
  assert.deepEqual(withdrawn.isi.totalAbsensi, { HADIR: 3, SAKIT: 4, IZIN: 0, ALPA: 1, total: 8 });
  const changedPreviewGrade = withdrawn.isi.nilai.find((row) => row.mapel.id === school.id)!;
  assert.equal(changedPreviewGrade.mapel.namaMapel, changedSchool.namaMapel);
  assert.equal(changedPreviewGrade.mapel.kkm, 95);
  assert.equal(changedPreviewGrade.tuntas, false);
  assert.deepEqual(await list(a.id), []);
  rejected(await api("GET", `/api/rapor/${reportId}`, wali), 404, "RAPOR_NOT_FOUND");
  rejected(await api("GET", `/api/rapor/${reportId}`, outsider), 404, "RAPOR_NOT_FOUND");
  await saveGrades(gradeBody(school.id, [grade(a.id, [100, 100, 100], "After withdrawal")]), ustadz);
  const republished = await saveReport(reportBody(a.id, "DITERBITKAN"), bendahara);
  assert.equal(republished.id, reportId);
  const republishedGrade = republished.isi.nilai.find((row) => row.mapel.id === school.id)!;
  assert.equal(republishedGrade.id, firstSchool.id);
  assert.equal(republishedGrade.nilaiAkhir, 100);
  assert.equal(republishedGrade.predikat, "A");
  assert.equal(republishedGrade.tuntas, true);
  assert.equal(republished.isi.totalPoin, 15);
  assert.notDeepEqual(republished.isi, published.isi);
  assert.deepEqual(await getReport(reportId, wali), republished);
  assert.deepEqual((await list(a.id)).map((row) => row.id), [reportId]);
  assert.deepEqual((await db.raporSantri.findUniqueOrThrow({ where: { id: reportId } })).snapshot, republished.isi);
  assert.equal(await db.raporSantri.count({ where: { santriId: a.id, ...ganjil } }), 1);
  pass("withdrawal hides report, permits grade editing and republishes refreshed snapshot");

  stage = "concurrent publication and grade save";
  const raceDraft = await saveReport(reportBody(b.id), ustadz);
  assert.ok(raceDraft.id);
  const raceReportId = raceDraft.id;
  const beforeRaceGrade = await db.nilaiUlangan.findUniqueOrThrow({ where: { id: zeroSchool.id } });
  const candidate = grade(b.id, [90, 91, 92], "Concurrent edit fixture");
  // Complete both writes before cleanup, including when either request fails.
  const attempts = await Promise.allSettled([
    api("PUT", `${admin}/rapor`, bendahara, reportBody(b.id, "DITERBITKAN")),
    api("PUT", `${admin}/nilai`, ustadz, gradeBody(school.id, [candidate])),
  ]);
  const failed = attempts.find((attempt) => attempt.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  const [publishReply, gradeReply] = attempts.map((attempt) => {
    assert.equal(attempt.status, "fulfilled");
    return (attempt as PromiseFulfilledResult<Reply>).value;
  });
  const concurrentPublished = data<{ item: RaporDetail }>(publishReply).item;
  assert.equal(concurrentPublished.id, raceReportId);
  assert.equal(concurrentPublished.statusRapor, "DITERBITKAN");
  const liveGrade = await db.nilaiUlangan.findUniqueOrThrow({ where: { id: zeroSchool.id } });
  let raceOutcome: string;
  if (gradeReply.status === 409) {
    rejected(gradeReply, 409, "RAPOR_TERBIT");
    assert.deepEqual(liveGrade, beforeRaceGrade);
    raceOutcome = "publish-first: edit rejected 409";
  } else {
    assert.equal(data<{ tersimpan: number }>(gradeReply).tersimpan, 1);
    assert.deepEqual([liveGrade.nilaiHarian, liveGrade.nilaiUTS, liveGrade.nilaiUAS, liveGrade.nilaiAkhir], [90, 91, 92, 91]);
    assert.equal(liveGrade.predikat, "A");
    assert.equal(liveGrade.catatanGuru, candidate.catatanGuru);
    raceOutcome = "edit-first: saved grade included";
  }
  const snapshotGrade = concurrentPublished.isi.nilai.find((row) => row.mapel.id === school.id)!;
  assert.ok(snapshotGrade);
  for (const field of ["id", "santriId", "nilaiHarian", "nilaiUTS", "nilaiUAS", "nilaiAkhir", "predikat", "catatanGuru"] as const) {
    assert.equal(snapshotGrade[field], liveGrade[field]);
  }
  const raceStored = await db.raporSantri.findUniqueOrThrow({ where: { id: raceReportId } });
  assert.equal(raceStored.statusRapor, "DITERBITKAN");
  assert.deepEqual(raceStored.snapshot, concurrentPublished.isi);
  assert.deepEqual(await getReport(raceReportId, wali), concurrentPublished);
  assert.deepEqual((await list(b.id)).map((row) => row.id), [raceReportId]);
  rejected(await api("PUT", `${admin}/nilai`, ustadz, gradeBody(school.id, [grade(b.id, [1, 1, 1])])), 409, "RAPOR_TERBIT");
  assert.deepEqual(await db.nilaiUlangan.findUniqueOrThrow({ where: { id: zeroSchool.id } }), liveGrade);
  assert.equal(await db.raporSantri.count({ where: { santriId: b.id, ...ganjil } }), 1);
  pass(`concurrent publish/save consistency (${raceOutcome})`);

  stage = "same-student repeat semester uniqueness and separation";
  const evenGradeBefore = await db.nilaiUlangan.findUniqueOrThrow({ where: {
    santriId_mapelId_semester_tahunAjaran: { santriId: a.id, mapelId: school.id, ...genap },
  } });
  await saveGrades(gradeBody(school.id, [grade(a.id, [80, 80, 80])], genap), bendahara);
  const evenDraft = await saveReport(reportBody(a.id, "DRAFT", genap), ustadz);
  const evenDraftAgain = await saveReport({ ...reportBody(a.id, "DRAFT", genap), catatanWaliKelas: "Repeat semester fixture" });
  assert.ok(evenDraft.id && evenDraft.id !== reportId);
  assert.equal(evenDraftAgain.id, evenDraft.id);
  assert.equal(evenDraftAgain.catatanWaliKelas, "Repeat semester fixture");
  assert.equal(evenDraftAgain.isi.nilai[0].id, evenGradeBefore.id);
  assert.equal(evenDraftAgain.isi.nilai[0].nilaiAkhir, 80);
  assert.equal(await db.nilaiUlangan.count({ where: { santriId: a.id, mapelId: school.id, ...genap } }), 1);
  assert.equal(await db.raporSantri.count({ where: { santriId: a.id, ...genap } }), 1);
  assert.equal(await db.raporSantri.count({ where: { santriId: a.id } }), 2);
  assert.deepEqual(await getReport(reportId, wali), republished);
  assert.deepEqual((await list(a.id)).map((row) => row.id), [reportId]);
  rejected(await api("GET", `/api/rapor/${evenDraft.id}`, wali), 404, "RAPOR_NOT_FOUND");
  pass("repeat upserts preserve IDs, separate semesters and leave published semester unchanged");
}

function sanitized(error: unknown): string {
  if (error instanceof SafeFailure) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(error.code)) {
    return `Database operation failed (${error.code}); verify migrations and fixture constraints. Database details withheld.`;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "Database connection failed; verify DATABASE_URL and the generated Prisma client. Connection details withheld.";
  }
  if (error instanceof assert.AssertionError) return "Assertion failed; response/record details withheld.";
  return "Unexpected failure; authentication, environment and database details withheld.";
}

async function main() {
  const config = configuration();
  const db = new PrismaClient({ log: [] });
  let failure: { stage: string; error: unknown } | undefined;
  let cleanupFailed = false;
  try {
    await integration(db, config);
  } catch (error) {
    failure = { stage, error };
  } finally {
    try {
      await cleanup(db);
      pass("fixture cleanup verified");
    } catch {
      cleanupFailed = true;
      console.error(`FAIL cleanup: could not verify removal of fixture run ${runId}; inspect its explicitly named rows. No broad cleanup attempted.`);
    } finally {
      try {
        await db.$disconnect();
      } catch {
        failure ??= { stage: "database disconnect", error: new SafeFailure("Could not close the database client cleanly.") };
      }
    }
  }
  if (failure) console.error(`FAIL ${failure.stage}: ${sanitized(failure.error)}`);
  if (failure || cleanupFailed) {
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${passedGroups} groups; ${httpChecks} HTTP checks; all fixtures removed.`);
}

void main().catch((error: unknown) => {
  console.error(`FAIL ${stage}: ${sanitized(error)}`);
  process.exitCode = 1;
});
