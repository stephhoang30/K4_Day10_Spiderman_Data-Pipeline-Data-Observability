/**
 * Deterministic formatters. Everything is UTC / en-US so the string never
 * depends on the viewer's locale or timezone.
 *
 * These functions only reshape values that already came from an artifact —
 * they never supply a value of their own.
 */

const NUMBER = new Intl.NumberFormat("en-US");

export function formatInt(value: number): string {
  return Number.isFinite(value) ? NUMBER.format(value) : "—";
}

/** Fixed-decimal rendering for metric values. No rounding to a "nice" number. */
export function formatMetric(value: unknown, digits = 4): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

/** Signed delta, e.g. `-0.2500`. Returns null when either side is unavailable. */
export function formatDelta(
  current: unknown,
  reference: unknown,
  digits = 4,
): string | null {
  if (typeof current !== "number" || !Number.isFinite(current)) return null;
  if (typeof reference !== "number" || !Number.isFinite(reference)) return null;
  const delta = current - reference;
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return `${sign}${Math.abs(delta).toFixed(digits)}`;
}

/** ISO timestamp -> `YYYY-MM-DD HH:MM:SS UTC`. Falls back to the raw string. */
export function formatTimestamp(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/** `0.15` -> `15%`. Only for spec fractions, which are declared as fractions. */
export function formatFraction(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const percent = value * 100;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

