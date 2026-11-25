import type { Context } from "hono";

export type CsvColumn<T> = {
  key: keyof T & string;
  header: string;
};

const LINE_BREAK = "\r\n";
const BOM = "\uFEFF";
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);
const NEEDS_QUOTING = /[",\r\n]/;

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function neutralizeFormula(text: string): string {
  return text.length > 0 && FORMULA_TRIGGERS.has(text[0]!) ? `'${text}` : text;
}

function quote(text: string): string {
  return NEEDS_QUOTING.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function escapeCell(value: unknown): string {
  const text = stringify(value);
  return quote(typeof value === "string" ? neutralizeFormula(text) : text);
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((col) => escapeCell(col.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCell(row[col.key])).join(","));
  }
  return lines.join(LINE_BREAK);
}

function contentDisposition(filename: string): string {
  const name = filename.toLowerCase().endsWith(".csv") ? filename : `${filename}.csv`;
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function csvResponse(c: Context, filename: string, csv: string) {
  return c.body(BOM + csv, 200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": contentDisposition(filename),
  });
}
