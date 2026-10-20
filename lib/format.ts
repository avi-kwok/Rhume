// Formatters for every number, date and list shown in the UI and in rendered briefs (DESIGN.md §9.2).
// Pure and deterministic: no Intl, no locale or time-zone dependence, so server and client render identically.

import type { Field } from "./engine/evidence";

const MINUS = "−"; // "−", typographic minus
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Group thousands with commas: 1840 → "1,840". Expects a non-negative integer string. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function sign(n: number): string {
  return n < 0 ? MINUS : "";
}

/** Integer, or one decimal when |n| < 10 and the one-decimal value is not whole (3.14 → "3.1", 12.4 → "12"). */
function compact(n: number): string {
  const abs = Math.abs(n);
  const oneDp = Math.round(abs * 10) / 10;
  if (abs < 10 && !Number.isInteger(oneDp)) return oneDp.toFixed(1);
  return group(String(Math.round(abs)));
}

function isZeroAfterRounding(text: string): boolean {
  return /^0(\.0)?$/.test(text);
}

/** 1840 → "1,840" (rounded to a whole number). */
export function formatInt(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const r = Math.round(n);
  return `${r < 0 ? MINUS : ""}${group(String(Math.abs(r)))}`;
}

/** n is already a percentage: 12.4 → "12%", 3.14 → "3.1%", 3 → "3%". */
export function formatPct(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const body = compact(n);
  return `${isZeroAfterRounding(body) ? "" : sign(n)}${body}%`;
}

/** Whole Canadian dollars: 6200 → "C$6,200", −2500 → "−C$2,500". */
export function formatCad(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const r = Math.round(n);
  return `${r < 0 ? MINUS : ""}C$${group(String(Math.abs(r)))}`;
}

/** "2024-01-08" → "Jan 8, 2024". */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

/** 9 → "9 days", 1 → "1 day", 9.34 → "9.3 days". */
export function formatDays(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const body = compact(n);
  const s = `${isZeroAfterRounding(body) ? "" : sign(n)}${body}`;
  return body === "1" ? `${s} day` : `${s} days`;
}

/** ["Alberta", "Ontario"] → "Alberta and Ontario"; ["A", "B", "C"] → "A, B and C"; [] → "none". */
export function formatList(arr: readonly string[]): string {
  if (arr.length === 0) return "none";
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join(", ")} and ${arr[arr.length - 1]}`;
}

export function formatBool(b: boolean): string {
  return b ? "yes" : "no";
}

/** "2023-11-06" → "Week of Nov 6, 2023". */
export function formatWeekOf(iso: string): string {
  return `Week of ${formatDate(iso)}`;
}

/** Format an evidence-pack field by its declared type. A value that does not match its type falls back to text. */
export function formatField(field: Field): string {
  const v = field.value;
  switch (field.type) {
    case "int":
      return typeof v === "number" ? formatInt(v) : String(v);
    case "pct":
      return typeof v === "number" ? formatPct(v) : String(v);
    case "cad":
      return typeof v === "number" ? formatCad(v) : String(v);
    case "days":
      return typeof v === "number" ? formatDays(v) : String(v);
    case "date":
      return typeof v === "string" ? formatDate(v) : String(v);
    case "list":
      return Array.isArray(v) ? formatList(v) : String(v);
    case "bool":
      return typeof v === "boolean" ? formatBool(v) : String(v);
    case "text":
    default:
      return Array.isArray(v) ? formatList(v) : typeof v === "boolean" ? formatBool(v) : String(v);
  }
}
