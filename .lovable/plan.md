## Goal

Rework parsing + restaurant identity to match the real Zomato daily report:
pivoted long-format CSV, restaurants identified by Zomato ID (not name),
new metric set, and an upload UI that never blocks on "unmatched" names.

## 1. Database migration (single migration)

```sql
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS zomato_id TEXT,
  ADD COLUMN IF NOT EXISTS subzone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_zomato_id_key
  ON public.restaurants (zomato_id) WHERE zomato_id IS NOT NULL;

-- Rename the misleading column; data is preserved.
ALTER TABLE public.daily_metrics
  RENAME COLUMN menu_to_order TO impressions_to_menu;

-- New metric columns (all NUMERIC DEFAULT 0)
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS market_share NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_rating NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rated_orders NUMERIC DEFAULT 0,
  ... (all 25 new keys from section 3/5 of the request) ...;
```

No RLS or policy changes. `restaurants_admin_insert` already covers inline
auto-create.

## 2. `src/lib/metrics.ts`

- `MetricKey` union: keep every existing key **except** rename `menu_to_order` → `impressions_to_menu`. Add the 25 new keys from the spec.
- Rewrite the `METRICS` array with corrected `csvColumn` values matching the
  exact "Metric" cell strings (e.g. `"Sales (Rs)"`, `"Delivered orders"`,
  `"Impressions to menu (%)"`, etc.).
- `average_order_value` stays in `METRICS` but is marked derived — add
  `derived: true` to `MetricDef` and skip it in the csv→key lookup map.
- Export a new `CSV_METRIC_LOOKUP: Map<string, MetricKey>` built from
  every non-derived METRIC's `csvColumn`.
- Remove `REQUIRED_CSV_COLUMNS` (no longer used by parser or UI).
- `sumMetrics` / `formatMetric` / `emptyMetrics`: leave untouched except
  `sumMetrics` must reference `impressions_to_menu` if it was averaging
  `menu_to_order` (it doesn't currently — only `menu_to_cart`,
  `cart_to_order`, etc.). Add an average for `impressions_to_menu` for
  parity with the other funnel %s.

## 3. `src/lib/csv-process.ts` — rewrite parser around the pivoted format

- Extend `ParsedRow`:
  ```ts
  interface ParsedRow {
    restaurant_id_external: string;   // Zomato ID as string
    restaurant_name: string;
    subzone: string;
    city: string;
    date: string;                     // ISO
    metrics: Record<string, number>;
    _raw: Record<string, unknown>;
  }
  ```
- Replace `normalizeRows` with `pivotRows(rawRows, headers)`:
  1. Detect date columns via `/^\d{1,2}\s+[A-Za-z]+,?\s+\d{4}$/`; build
     `{ header → isoDate }`. If zero date columns → push error
     `"No date columns detected"`.
  2. Validate required identity columns: `Restaurant ID`, `Restaurant name`,
     `Metric`. Missing → error.
  3. Group rows by `${restaurantId}__${isoDate}` into a map. For each cell:
     resolve `MetricKey` via `CSV_METRIC_LOOKUP.get(row["Metric"])`; ignore
     unknown metrics (push a one-time warning per unknown metric name).
  4. After accumulation, derive `average_order_value = sales /
     delivered_orders` when `delivered_orders > 0`.
  5. Return `ParseResult` with new field `overviewCounts: Record<string,
     number>` counting source rows per "Overview" group.
- `ParseResult` adds `overviewCounts` and `uniqueRestaurantIds: string[]`;
  keeps `uniqueRestaurants` (names) for display.
- `parseCsv` / `parseXlsx` route through `pivotRows`. Drop `parsePdf` and
  remove the `pdfjs-dist` import + `.pdf` branch in `parseFile`.
- Drop `resolveRestaurantMatches`, `levenshtein`, and `normalizeName`
  (no longer used anywhere — verify with rg before deleting; the only
  consumer is `upload.tsx`, which is being rewritten in the same patch).
- Rewrite `commitImport(parsed, file)`:
  1. Fetch `restaurants` selecting `id, zomato_id`.
  2. Build `Map<zomato_id, uuid>`.
  3. From `parsed.rows`, derive unique
     `{ zomato_id, restaurant_name, subzone, city }` set. For ids not in
     the map, batch-insert via
     `supabase.from("restaurants").upsert(payload, { onConflict: "zomato_id" }).select("id, zomato_id")`,
     payload uses `name`/`display_name` = restaurant_name, plus subzone,
     city, platform `"zomato"`. Merge returned uuids into the lookup map.
  4. Track `autoCreated` (count + name list) from the insert response
     (ids that were missing in step 2).
  5. Upload original file to storage (unchanged best-effort logic).
  6. Insert `uploaded_files` row (status `processing`).
  7. Build `daily_metrics` rows: `{ restaurant_id: lookup.get(zomato_id),
     date, ...metrics }`. Upsert in batches of 200 on
     `restaurant_id,date`.
  8. Update `uploaded_files` summary with
     `{ matched, auto_created: autoCreated.length, auto_created_names,
        warnings, storage_path, overview_counts }`.
  9. Return `{ fileId, matched, autoCreated, autoCreatedNames, warnings,
     storagePath, overviewCounts }`. No `unmatched` field — there isn't one.

## 4. `src/routes/_authenticated/upload.tsx`

- `ACCEPT = ".csv,.xls,.xlsx"`. Drop the PDF branch and the `Wand2`/`Plus`
  icons that powered manual create.
- Remove the `existingRestaurants` query, the `matchInfo` memo, the
  unmatched-restaurants `Card`, `createRestaurantFor`, `creatingFor`,
  and all the related state — auto-create is fully handled in
  `commitImport`.
- Preview step now shows:
  - Existing badges (`totalRows`, `rows.length`, restaurant count).
  - New line: `"{known} restaurants already known · {new} will be
    auto-created"` computed from `parsed.uniqueRestaurantIds` vs a quick
    one-shot client query of `restaurants.select("zomato_id")`.
  - **Overview breakdown** card: small grid of badges from
    `parsed.overviewCounts` (Sales / Customer experience / Customer funnel
    / Customer segmentation / Ads / Offers) with row counts.
- `Process & import` button disabled only when
  `parsed.errors.length > 0 || parsed.rows.length === 0`.
- Replace bottom "Expected columns" card with a single descriptive line:
  > "Accepts Zomato daily report exports (.csv or .xlsx). Restaurant ID,
  > date columns, and metric rows are auto-detected."
- "Done" step summary now reads:
  `"Imported {matched} rows · {autoCreated} restaurants auto-created
   {alerts ? · {alerts} anomalies detected}"`.

## 5. Out of scope (per constraints)

- No changes to `sumMetrics`, `formatMetric`, `KpiCard`, dashboard,
  compare, range-compare logic. New metric keys are additive — existing
  views keep referencing the keys they already use.
- No RLS / auth changes.
- No PDF parser (explicit per spec).

## 6. Execution order

1. Submit DB migration (section 1) — wait for approval; `types.ts`
   regenerates with the new columns and renamed column.
2. Edit `src/lib/metrics.ts`.
3. Rewrite `src/lib/csv-process.ts`.
4. Rewrite preview/commit flow in `src/routes/_authenticated/upload.tsx`.
5. Verify build; spot-check `compare.tsx`, `compare.ranges.tsx`,
   `dashboard.tsx`, `anomaly.ts`, `restaurants.$id.tsx` for any direct
   reference to `menu_to_order` — replace with `impressions_to_menu` if
   present (otherwise leave alone).
