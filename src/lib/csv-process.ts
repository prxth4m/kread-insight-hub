import Papa from "papaparse";
import * as XLSX from "xlsx";
import { CSV_METRIC_LOOKUP, type MetricKey } from "./metrics";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedRow {
  restaurant_id_external: string;
  restaurant_name: string;
  subzone: string;
  city: string;
  date: string;
  metrics: Record<string, number>;
  overview_groups: Set<string>;
}

export interface ParseResult {
  rows: ParsedRow[];
  warnings: string[];
  errors: string[];
  totalRows: number;
  uniqueRestaurants: string[];
  uniqueRestaurantIds: string[];
  overviewCounts: Record<string, number>;
  dateCount: number;
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

const DATE_HEADER_RE = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/;

function parseDateHeader(h: string): string | null {
  const m = DATE_HEADER_RE.exec(h.trim());
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${pad(mo)}-${pad(Number(m[1]))}`;
}

const trimCell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function pivot(rawRows: Array<Record<string, unknown>>, headers: string[]): ParseResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const dateCols: Array<{ header: string; iso: string }> = [];
  for (const h of headers) {
    const iso = parseDateHeader(h);
    if (iso) dateCols.push({ header: h, iso });
  }

  const required = ["Restaurant ID", "Restaurant name", "Metric"];
  const missing = required.filter((c) => !headers.includes(c));
  if (missing.length > 0) errors.push(`Missing required column(s): ${missing.join(", ")}`);
  if (dateCols.length === 0) errors.push("No date columns detected (expected format like '09 Jun, 2026').");

  if (errors.length > 0) {
    return { rows: [], warnings, errors, totalRows: rawRows.length, uniqueRestaurants: [], uniqueRestaurantIds: [], overviewCounts: {}, dateCount: dateCols.length };
  }

  type Bucket = ParsedRow;
  const buckets = new Map<string, Bucket>();
  const unknownMetrics = new Set<string>();
  const overviewCounts: Record<string, number> = {};

  for (const row of rawRows) {
    const restaurantId = trimCell(row["Restaurant ID"]);
    const restaurantName = trimCell(row["Restaurant name"]);
    const metricName = trimCell(row["Metric"]);
    if (!restaurantId || !metricName) continue;

    const overview = trimCell(row["Overview"]) || "Other";
    const subzone = trimCell(row["Subzone"]);
    const city = trimCell(row["City"]);

    const metricKey = CSV_METRIC_LOOKUP.get(metricName);
    if (!metricKey) {
      if (!unknownMetrics.has(metricName)) {
        unknownMetrics.add(metricName);
        warnings.push(`Unknown metric ignored: "${metricName}"`);
      }
      continue;
    }

    overviewCounts[overview] = (overviewCounts[overview] ?? 0) + 1;

    for (const { header, iso } of dateCols) {
      const raw = row[header];
      if (raw == null || raw === "") continue;
      const value = toNumber(raw);
      const key = `${restaurantId}__${iso}`;
      let b = buckets.get(key);
      if (!b) {
        b = {
          restaurant_id_external: restaurantId,
          restaurant_name: restaurantName,
          subzone,
          city,
          date: iso,
          metrics: {},
          overview_groups: new Set(),
        };
        buckets.set(key, b);
      }
      b.metrics[metricKey] = value;
      b.overview_groups.add(overview);
    }
  }

  // Derive average_order_value
  for (const b of buckets.values()) {
    const sales = Number(b.metrics["sales"] ?? 0);
    const orders = Number(b.metrics["delivered_orders"] ?? 0);
    if (orders > 0) b.metrics["average_order_value"] = sales / orders;
  }

  const rows = Array.from(buckets.values());
  const uniqIds = new Set<string>();
  const uniqNames = new Set<string>();
  rows.forEach((r) => { uniqIds.add(r.restaurant_id_external); uniqNames.add(r.restaurant_name); });

  if (rows.length === 0 && warnings.length === 0) {
    warnings.push("No data rows found after pivoting.");
  }

  return {
    rows,
    warnings,
    errors,
    totalRows: rawRows.length,
    uniqueRestaurants: Array.from(uniqNames),
    uniqueRestaurantIds: Array.from(uniqIds),
    overviewCounts,
    dateCount: dateCols.length,
  };
}

async function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = (results.meta.fields ?? []).map((h) => h.trim());
        resolve(pivot(results.data as Array<Record<string, unknown>>, headers));
      },
      error: (err) => {
        resolve({ rows: [], warnings: [], errors: [err.message], totalRows: 0, uniqueRestaurants: [], uniqueRestaurantIds: [], overviewCounts: {}, dateCount: 0 });
      },
    });
  });
}

async function parseXlsx(file: File): Promise<ParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { rows: [], warnings: [], errors: ["Workbook has no sheets"], totalRows: 0, uniqueRestaurants: [], uniqueRestaurantIds: [], overviewCounts: {}, dateCount: 0 };
  }
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  const trimmed = json.map((row) => {
    const out: Record<string, unknown> = {};
    Object.entries(row).forEach(([k, v]) => { out[k.trim()] = v; });
    return out;
  });
  const headers = Object.keys(trimmed[0] ?? {});
  return pivot(trimmed, headers);
}

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXlsx(file);
  return {
    rows: [], warnings: [],
    errors: [`Unsupported file type: ${file.name}. Use CSV, XLSX, or XLS.`],
    totalRows: 0, uniqueRestaurants: [], uniqueRestaurantIds: [], overviewCounts: {}, dateCount: 0,
  };
}

export interface CommitResult {
  fileId: string;
  matched: number;
  autoCreated: number;
  autoCreatedNames: string[];
  warnings: string[];
  storagePath: string | null;
  overviewCounts: Record<string, number>;
}

export async function commitImport(parsed: ParseResult, file: File): Promise<CommitResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  // 1. Fetch existing restaurants by zomato_id.
  const { data: existing, error: exErr } = await supabase
    .from("restaurants")
    .select("id, zomato_id");
  if (exErr) throw exErr;

  const lookup = new Map<string, string>();
  (existing ?? []).forEach((r) => {
    if (r.zomato_id) lookup.set(String(r.zomato_id), r.id);
  });

  // 2. Determine unique restaurants from file & which are new.
  const fileRestaurants = new Map<string, { restaurant_name: string; subzone: string; city: string }>();
  for (const r of parsed.rows) {
    if (!fileRestaurants.has(r.restaurant_id_external)) {
      fileRestaurants.set(r.restaurant_id_external, {
        restaurant_name: r.restaurant_name,
        subzone: r.subzone,
        city: r.city,
      });
    }
  }

  const toCreate: Array<{ zomato_id: string; name: string; display_name: string; subzone: string | null; city: string | null; platform: string }> = [];
  const autoCreatedNames: string[] = [];
  for (const [zid, meta] of fileRestaurants) {
    if (!lookup.has(zid)) {
      toCreate.push({
        zomato_id: zid,
        name: meta.restaurant_name || `Restaurant ${zid}`,
        display_name: meta.restaurant_name || `Restaurant ${zid}`,
        subzone: meta.subzone || null,
        city: meta.city || null,
        platform: "zomato",
      });
      autoCreatedNames.push(meta.restaurant_name || `Restaurant ${zid}`);
    }
  }

  if (toCreate.length > 0) {
    const { data: upserted, error: upErr } = await supabase
      .from("restaurants")
      .upsert(toCreate as never, { onConflict: "zomato_id" })
      .select("id, zomato_id");
    if (upErr) throw upErr;
    (upserted ?? []).forEach((r) => {
      if (r.zomato_id) lookup.set(String(r.zomato_id), r.id);
    });
  }

  // 3. Upload original file to storage (best-effort).
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

  // 4. Record uploaded_files row.
  const { data: fileRow, error: fileErr } = await supabase
    .from("uploaded_files")
    .insert({
      file_name: file.name,
      file_size: file.size,
      uploaded_by: u.user.id,
      row_count: parsed.rows.length,
      status: "processing",
    })
    .select()
    .single();
  if (fileErr || !fileRow) throw fileErr ?? new Error("File record failed");

  // 5. Build daily_metrics rows.
  const dmRows: Array<Record<string, unknown>> = [];
  let unresolved = 0;
  for (const r of parsed.rows) {
    const restaurantUuid = lookup.get(r.restaurant_id_external);
    if (!restaurantUuid) { unresolved++; continue; }
    dmRows.push({
      restaurant_id: restaurantUuid,
      date: r.date,
      ...r.metrics,
    });
  }

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
        matched: dmRows.length,
        auto_created: autoCreatedNames.length,
        auto_created_names: autoCreatedNames,
        unresolved,
        warnings: parsed.warnings.slice(0, 50),
        overview_counts: parsed.overviewCounts,
        storage_path: storagePath,
      } as never,
    })
    .eq("id", fileRow.id);

  return {
    fileId: fileRow.id,
    matched: dmRows.length,
    autoCreated: autoCreatedNames.length,
    autoCreatedNames,
    warnings: parsed.warnings,
    storagePath,
    overviewCounts: parsed.overviewCounts,
  };
}