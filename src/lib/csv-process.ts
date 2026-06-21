import Papa from "papaparse";
import * as XLSX from "xlsx";
import { METRICS, REQUIRED_CSV_COLUMNS } from "./metrics";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedRow {
  restaurant_name: string;
  date: string;
  metrics: Record<string, number>;
  _raw: Record<string, unknown>;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
  errors: string[];
  missingColumns: string[];
  totalRows: number;
  uniqueRestaurants: string[];
}

function toNumber(v: unknown): number {
  if (v == null || v === "") return 0;
  let s = String(v).trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[₹$€£,\s%]/g, "");
  const n = parseFloat(s);
  if (!isFinite(n)) return 0;
  return negative ? -n : n;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

function excelSerialToISO(v: number): string | null {
  const ms = Math.round((v - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function toISODate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  if (typeof v === "number") return excelSerialToISO(v);
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const mdy = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (mdy) {
    const mo = MONTHS[mdy[1].toLowerCase()];
    if (mo) return `${mdy[3]}-${pad(mo)}-${pad(Number(mdy[2]))}`;
  }
  const dmonY = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(s);
  if (dmonY) {
    const mo = MONTHS[dmonY[2].toLowerCase()];
    if (mo) return `${dmonY[3]}-${pad(mo)}-${pad(Number(dmonY[1]))}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

const trimCell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

export function normalizeName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, dp[j], dp[j - 1]) + 1;
      prev = tmp;
    }
  }
  return dp[n];
}

function normalizeRows(rawRows: Array<Record<string, unknown>>, headers: string[]): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const missingColumns = REQUIRED_CSV_COLUMNS.filter((c) => !headers.includes(c));
  const rows: ParsedRow[] = [];
  const seen = new Set<string>();
  const restaurants = new Set<string>();

  for (const row of rawRows) {
    const hasAnyValue = Object.values(row).some((v) => v != null && String(v).trim() !== "");
    if (!hasAnyValue) continue;

    const restaurant_name = trimCell(row["Restaurant"]);
    const date = toISODate(row["Date"]);
    if (!restaurant_name) {
      warnings.push(`Skipped row with empty restaurant`);
      continue;
    }
    if (!date) {
      warnings.push(`Skipped row with invalid date for ${restaurant_name}`);
      continue;
    }
    const key = `${restaurant_name}__${date}`;
    if (seen.has(key)) {
      warnings.push(`Duplicate row for ${restaurant_name} on ${date} — kept first`);
      continue;
    }
    seen.add(key);
    restaurants.add(restaurant_name);

    const metrics: Record<string, number> = {};
    let anyMetric = false;
    METRICS.forEach((m) => {
      const v = toNumber(row[m.csvColumn]);
      metrics[m.key] = v;
      if (v !== 0) anyMetric = true;
    });
    if (!anyMetric) warnings.push(`No metric values for ${restaurant_name} on ${date}`);
    rows.push({ restaurant_name, date, metrics, _raw: row });
  }

  return {
    rows,
    warnings,
    errors,
    missingColumns,
    totalRows: rawRows.length,
    uniqueRestaurants: Array.from(restaurants),
  };
}

export async function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = (results.meta.fields ?? []).map((h) => h.trim());
        resolve(normalizeRows(results.data as Array<Record<string, unknown>>, headers));
      },
      error: (err) => {
        resolve({
          rows: [], warnings: [], errors: [err.message],
          missingColumns: [], totalRows: 0, uniqueRestaurants: [],
        });
      },
    });
  });
}

async function parseXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], warnings: [], errors: ["Workbook has no sheets"], missingColumns: [], totalRows: 0, uniqueRestaurants: [] };
  }
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  const trimmed = json.map((row) => {
    const out: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => { out[k.trim()] = v; });
    return out;
  });
  const headers = Object.keys(trimmed[0] ?? {});
  return normalizeRows(trimmed, headers);
}

async function parsePdf(file: File): Promise<ParseResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;

  const allRowsRaw: Array<Record<string, unknown>> = [];
  let headers: string[] = [];
  let anchors: number[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    type Item = { str: string; x: number; y: number };
    const items: Item[] = content.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((it: any) => typeof it.str === "string" && it.str.trim() !== "")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => ({ str: it.str, x: it.transform[4], y: Math.round(it.transform[5]) }));

    const byY = new Map<number, Item[]>();
    for (const it of items) {
      const key = Math.round(it.y / 3) * 3;
      const arr = byY.get(key) ?? [];
      arr.push(it);
      byY.set(key, arr);
    }
    const lines = Array.from(byY.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, arr]) => arr.sort((a, b) => a.x - b.x));

    if (lines.length === 0) continue;

    let startIdx = 0;
    if (headers.length === 0) {
      const headerIdx = lines.findIndex((l) => {
        const text = l.map((i) => i.str).join(" ");
        return /restaurant/i.test(text) && /date/i.test(text);
      });
      if (headerIdx === -1) continue;
      headers = lines[headerIdx].map((i) => i.str.trim());
      anchors = lines[headerIdx].map((i) => i.x);
      startIdx = headerIdx + 1;
    }

    for (let i = startIdx; i < lines.length; i++) {
      const row = buildRow(lines[i], headers, anchors);
      if (row) allRowsRaw.push(row);
    }
  }

  if (headers.length === 0 || allRowsRaw.length === 0) {
    return {
      rows: [],
      warnings: [],
      errors: ["No tabular data detected in PDF — please export the report as CSV or XLSX."],
      missingColumns: [],
      totalRows: 0,
      uniqueRestaurants: [],
    };
  }
  return normalizeRows(allRowsRaw, headers);
}

function buildRow(items: Array<{ str: string; x: number }>, headers: string[], anchors: number[]): Record<string, unknown> | null {
  if (items.length === 0 || anchors.length === 0) return null;
  const cells: string[] = new Array(headers.length).fill("");
  for (const it of items) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < anchors.length; i++) {
      const d = Math.abs(it.x - anchors[i]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    cells[best] = (cells[best] ? cells[best] + " " : "") + it.str;
  }
  const row: Record<string, unknown> = {};
  headers.forEach((h, i) => { row[h] = cells[i].trim(); });
  return row;
}

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXlsx(file);
  if (name.endsWith(".pdf")) return parsePdf(file);
  return {
    rows: [], warnings: [],
    errors: [`Unsupported file type: ${file.name}. Use CSV, XLSX, XLS, or PDF.`],
    missingColumns: [], totalRows: 0, uniqueRestaurants: [],
  };
}

export interface RestaurantMatchResult {
  matched: ParsedRow[];
  unmatched: { csvName: string; rowCount: number; suggestion?: string }[];
}

export function resolveRestaurantMatches(
  rows: ParsedRow[],
  existing: Array<{ id: string; name: string; display_name?: string | null }>,
): RestaurantMatchResult {
  const lookup = new Map<string, string>();
  const names: string[] = [];
  existing.forEach((r) => {
    const n = normalizeName(r.name);
    if (n) { lookup.set(n, r.id); names.push(r.name); }
    if (r.display_name) {
      const dn = normalizeName(r.display_name);
      if (dn && !lookup.has(dn)) lookup.set(dn, r.id);
    }
  });

  const matched: ParsedRow[] = [];
  const unmatchedMap = new Map<string, number>();
  for (const r of rows) {
    if (lookup.has(normalizeName(r.restaurant_name))) matched.push(r);
    else unmatchedMap.set(r.restaurant_name, (unmatchedMap.get(r.restaurant_name) ?? 0) + 1);
  }

  const unmatched = Array.from(unmatchedMap.entries()).map(([csvName, rowCount]) => {
    let suggestion: string | undefined;
    const target = normalizeName(csvName);
    let bestDist = Infinity;
    for (const n of names) {
      const d = levenshtein(target, normalizeName(n));
      if (d < bestDist) { bestDist = d; suggestion = n; }
    }
    if (suggestion && bestDist > Math.max(2, Math.floor(target.length / 3))) suggestion = undefined;
    return { csvName, rowCount, suggestion };
  });

  return { matched, unmatched };
}

export async function commitImport(parsed: ParseResult, file: File) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  const { data: existing } = await supabase.from("restaurants").select("id, name, display_name");
  const { matched, unmatched } = resolveRestaurantMatches(parsed.rows, existing ?? []);

  const lookup = new Map<string, string>();
  (existing ?? []).forEach((r) => {
    const n = normalizeName(r.name);
    if (n) lookup.set(n, r.id);
    if (r.display_name) {
      const dn = normalizeName(r.display_name);
      if (dn && !lookup.has(dn)) lookup.set(dn, r.id);
    }
  });

  // Upload original file to storage (best-effort)
  let storagePath: string | null = null;
  try {
    const id = crypto.randomUUID();
    const path = `${u.user.id}/${id}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("uploads").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (!upErr) storagePath = path;
  } catch {
    // non-fatal
  }

  const { data: fileRow, error: fileErr } = await supabase
    .from("uploaded_files")
    .insert({
      file_name: file.name,
      file_size: file.size,
      uploaded_by: u.user.id,
      row_count: matched.length,
      status: "processing",
    })
    .select()
    .single();
  if (fileErr || !fileRow) throw fileErr ?? new Error("File record failed");

  const dmRows = matched.map((r) => ({
    restaurant_id: lookup.get(normalizeName(r.restaurant_name))!,
    date: r.date,
    ...r.metrics,
  }));

  const BATCH = 200;
  for (let i = 0; i < dmRows.length; i += BATCH) {
    const slice = dmRows.slice(i, i + BATCH);
    const { error } = await supabase
      .from("daily_metrics")
      .upsert(slice as never, { onConflict: "restaurant_id,date" });
    if (error) throw error;
  }

  await supabase
    .from("uploaded_files")
    .update({
      status: "processed",
      summary: {
        matched: matched.length,
        unmatched: unmatched.map((u) => u.csvName),
        warnings: parsed.warnings.slice(0, 50),
        unique_restaurants: parsed.uniqueRestaurants.length,
        storage_path: storagePath,
      } as never,
    })
    .eq("id", fileRow.id);

  return {
    fileId: fileRow.id,
    matched: matched.length,
    unmatched: unmatched.map((u) => u.csvName),
    warnings: parsed.warnings,
    storagePath,
  };
}