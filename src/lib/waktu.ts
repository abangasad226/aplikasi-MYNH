// WIB adalah UTC+7 dan tidak memakai daylight saving time.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface WibParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

function getWibParts(now: Date): WibParts {
  const shifted = new Date(now.getTime() + WIB_OFFSET_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

export interface WibDayRange {
  start: Date;
  end: Date;
  // Nilai untuk kolom @db.Date: tanggal kalender WIB di UTC midnight.
  tanggal: Date;
}

export function getWibDayRange(now = new Date()): WibDayRange {
  const { year, month, day } = getWibParts(now);
  const startMs = Date.UTC(year, month, day) - WIB_OFFSET_MS;

  return {
    start: new Date(startMs),
    end: new Date(startMs + DAY_MS),
    tanggal: new Date(Date.UTC(year, month, day)),
  };
}

export interface WibHourRange {
  start: Date;
  end: Date;
}

export function getWibHourRange(now = new Date()): WibHourRange {
  const { year, month, day, hour } = getWibParts(now);
  const startMs = Date.UTC(year, month, day, hour) - WIB_OFFSET_MS;

  return {
    start: new Date(startMs),
    end: new Date(startMs + HOUR_MS),
  };
}

export interface WibMonthRange {
  start: Date;
  end: Date;
  startTanggal: Date;
  endTanggal: Date;
}

export function getWibYearMonth(
  now = new Date(),
): { bulan: number; tahun: number } {
  const { year, month } = getWibParts(now);

  return { bulan: month + 1, tahun: year };
}

export function getWibMonthRange(now = new Date()): WibMonthRange {
  const { year, month } = getWibParts(now);

  return {
    start: new Date(Date.UTC(year, month, 1) - WIB_OFFSET_MS),
    end: new Date(Date.UTC(year, month + 1, 1) - WIB_OFFSET_MS),
    startTanggal: new Date(Date.UTC(year, month, 1)),
    endTanggal: new Date(Date.UTC(year, month + 1, 1)),
  };
}

// Input tanggal dari API berupa YYYY-MM-DD; anchor UTC mencegah pergeseran
// tanggal saat Prisma menulis kolom @db.Date.
export function parseTanggal(value?: string, now = new Date()): Date {
  return value ? new Date(`${value}T00:00:00.000Z`) : getWibDayRange(now).tanggal;
}

export function formatTanggal(value: Date): string {
  return value.toISOString().slice(0, 10);
}
