const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

const dateOnlyFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
  timeZoneName: "short",
});

const timeFormatter = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Asia/Jakarta",
});

const periodeFormatter = new Intl.DateTimeFormat("id-ID", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function parseDate(value: string | Date): Date | null {
  const parsed =
    typeof value === "string"
      ? new Date(
          /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? `${value}T00:00:00.000Z`
            : value,
        )
      : value;

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatRupiah(value: string | number | bigint): string {
  try {
    if (typeof value === "string") {
      const normalized = value.trim();

      if (!/^-?\d+$/.test(normalized)) {
        return rupiahFormatter.format(0);
      }

      return rupiahFormatter.format(BigInt(normalized));
    }

    if (typeof value === "number" && !Number.isFinite(value)) {
      return rupiahFormatter.format(0);
    }

    return rupiahFormatter.format(value);
  } catch {
    return rupiahFormatter.format(0);
  }
}

export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatTanggal(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const dateOnly = parseDate(value);
    return dateOnly ? dateOnlyFormatter.format(dateOnly) : "—";
  }

  const parsed = parseDate(value);
  return parsed ? dateFormatter.format(parsed) : "—";
}

export function formatDateTime(value: string | Date): string {
  const parsed = parseDate(value);
  return parsed ? dateTimeFormatter.format(parsed) : "—";
}

export function formatTime(value: string | Date): string {
  const parsed = parseDate(value);
  return parsed ? timeFormatter.format(parsed) : "--:--:--";
}

export function formatPeriode(bulan: number, tahun: number): string {
  if (
    !Number.isInteger(bulan) ||
    bulan < 1 ||
    bulan > 12 ||
    !Number.isInteger(tahun)
  ) {
    return "—";
  }

  return periodeFormatter.format(new Date(Date.UTC(tahun, bulan - 1, 1)));
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function cleanKeterangan(keterangan: string | null): string {
  if (!keterangan) {
    return "—";
  }

  return keterangan
    .replace(/\s*\(ref:[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
