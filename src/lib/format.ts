/**
 * Kosovo time. Some runtimes (edge/workers) don't ship the "Europe/Pristina"
 * zone, so we fall back to an identical-offset zone when it's unavailable.
 */
function resolveTz(): string {
  for (const tz of ["Europe/Pristina", "Europe/Belgrade", "Europe/Berlin", "UTC"]) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
      return tz;
    } catch {
      continue;
    }
  }
  return "UTC";
}

const TZ = resolveTz();

export const CURRENCY = "EUR";

export function formatPrice(value: number | string, currency = CURRENCY): string {
  const n = typeof value === "string" ? Number(value) : value;
  const symbol = currency === "EUR" ? "€" : currency;
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return `${fixed} ${symbol}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minuta`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} orë` : `${h} orë e ${m} min`;
}

export function formatTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("sq-AL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TZ,
  }).format(d);
}

export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("sq-AL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

export function formatLongDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("sq-AL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(d);
}

export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} në ${formatTime(value)}`;
}

/** YYYY-MM-DD for a Date, in Kosovo time. */
export function toDateKey(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(d);
  return parts;
}

export const DAYS_SQ = [
  "E diel",
  "E hënë",
  "E martë",
  "E mërkurë",
  "E enjte",
  "E premte",
  "E shtunë",
];

export const DAYS_SQ_SHORT = ["Die", "Hën", "Mar", "Mër", "Enj", "Pre", "Sht"];

export const MONTHS_SQ = [
  "Janar",
  "Shkurt",
  "Mars",
  "Prill",
  "Maj",
  "Qershor",
  "Korrik",
  "Gusht",
  "Shtator",
  "Tetor",
  "Nëntor",
  "Dhjetor",
];