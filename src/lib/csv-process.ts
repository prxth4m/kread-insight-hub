import Papa from "papaparse";
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
  const s = String(v).replace(/[₹,\s%]/g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}

function toISODate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Accept yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (isoMatch) return s;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s);
  if (dmy) {
    const [, d, m, y] = dmy;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

export async function parseCsv(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const warnings: string[] = [];
        const errors: string[] = [];
        const headers = results.meta.fields ?? [];
        const missingColumns = REQUIRED_CSV_COLUMNS.filter((c) => !headers.includes(c));
        const rows: ParsedRow[] = [];
        const seen = new Set<string>();
        const restaurants = new Set<string>();

        for (const row of results.data) {
          const restaurant_name = String(row["Restaurant"] ?? "").trim();
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
          METRICS.forEach((m) => {
            metrics[m.key] = toNumber(row[m.csvColumn]);
          });
          rows.push({ restaurant_name, date, metrics, _raw: row });
        }

        resolve({
          rows,
          warnings,
          errors,
          missingColumns,
          totalRows: results.data.length,
          uniqueRestaurants: Array.from(restaurants),
        });
      },
      error: (err) => {
        resolve({
          rows: [],
          warnings: [],
          errors: [err.message],
          missingColumns: [],
          totalRows: 0,
          uniqueRestaurants: [],
        });
      },
    });
  });
}

export async function commitImport(parsed: ParseResult, fileName: string, fileSize: number) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Not authenticated");

  // Map restaurant names → ids
  const { data: existing } = await supabase.from("restaurants").select("id, name");
  const nameToId = new Map<string, string>();
  (existing ?? []).forEach((r) => nameToId.set(r.name.toLowerCase(), r.id));

  const unmatched: string[] = [];
  const matched: ParsedRow[] = [];
  for (const r of parsed.rows) {
    const id = nameToId.get(r.restaurant_name.toLowerCase());
    if (!id) {
      unmatched.push(r.restaurant_name);
      continue;
    }
    matched.push(r);
  }

  // Create file record
  const { data: fileRow, error: fileErr } = await supabase
    .from("uploaded_files")
    .insert({
      file_name: fileName,
      file_size: fileSize,
      uploaded_by: u.user.id,
      row_count: matched.length,
      status: "processing",
    })
    .select()
    .single();
  if (fileErr || !fileRow) throw fileErr ?? new Error("File record failed");

  // Upsert daily_metrics in batches
  const dmRows = matched.map((r) => ({
    restaurant_id: nameToId.get(r.restaurant_name.toLowerCase())!,
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

  // Update file record
  await supabase
    .from("uploaded_files")
    .update({
      status: "processed",
      summary: {
        matched: matched.length,
        unmatched: Array.from(new Set(unmatched)),
        warnings: parsed.warnings.slice(0, 50),
        unique_restaurants: parsed.uniqueRestaurants.length,
      } as never,
    })
    .eq("id", fileRow.id);

  return {
    fileId: fileRow.id,
    matched: matched.length,
    unmatched: Array.from(new Set(unmatched)),
    warnings: parsed.warnings,
  };
}