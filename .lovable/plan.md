## Feature 1 — Universal upload with auto-cleaning

### Parsing layer (`src/lib/csv-process.ts` → rename concept, file stays for compatibility)

- Add `parseFile(file)` dispatcher that picks parser by extension/MIME and returns the existing `ParseResult` shape unchanged:
  - `.csv` → existing `Papa.parse` path.
  - `.xls` / `.xlsx` → `xlsx` (SheetJS): read first sheet, `sheet_to_json({ defval: "", raw: false })`, feed rows through the same row-normalizer used by CSV.
  - `.pdf` → use `pdfjs-dist` (already common, low-footprint) to extract text per page, then run a simple column-clustering table extractor. If no row with the required `Restaurant` + `Date` columns can be assembled, return a `ParseResult` with a clear `errors[]` entry ("No tabular data detected in PDF — please export as CSV/XLSX") and zero rows.
- Extract row-normalization into a shared helper used by all three paths:
  - Trim every cell, collapse internal whitespace.
  - Expand `toNumber` to also strip `$`, `€`, thousand separators, parenthesized negatives.
  - Expand `toISODate` to also accept `Mon DD, YYYY`, `DD Mon YYYY`, Excel serial numbers (when `xlsx` returns them).
  - Drop fully-empty rows silently; rows missing only `Restaurant` or `Date` become warnings (already behavior); rows where every metric is empty become a warning, not an error.
- Keep `ParsedRow` / `ParseResult` exactly as-is so `upload.tsx` consumers don't fork.

### Restaurant fuzzy matching

- Add `normalizeName(s)`: lowercase, trim, strip punctuation, collapse spaces.
- In `commitImport`, build the lookup map keyed by `normalizeName(restaurants.name)` and also try `normalizeName(restaurants.display_name)`. Same normalization on the CSV `restaurant_name`.
- New helper `resolveRestaurantMatches(parsed)` (runs at preview time, not just at commit) returning `{ matched, unmatched: { csvName, suggestion? }[] }`. Suggestion uses simple Levenshtein against existing names with a small threshold.

### Storage of original file

- Create a private Supabase Storage bucket `uploads` via `supabase--storage_create_bucket` (admin-only RLS on `storage.objects`). After parsing, upload the raw file as `uploads/{user_id}/{uuid}-{filename}`.
- Extend `uploaded_files` insert (no schema change — use existing `summary` jsonb to also stash `storage_path`; if a dedicated column is wanted later, that's a separate migration outside this work).

### Upload UI (`src/routes/_authenticated/upload.tsx`)

- `<input accept=".csv,.xls,.xlsx,.pdf">`; dropzone copy updated to list supported formats.
- Step indicator kept (`select/validate/preview/processing/done`).
- Preview step:
  - New "Unmatched restaurants" section listing each unmatched CSV name with the closest suggestion and an inline **Create restaurant** button. Clicking it calls the same `supabase.from("restaurants").insert(...)` used in `admin.restaurants.index.tsx`, then re-runs `resolveRestaurantMatches` so the row moves to "matched" without leaving the page.
  - "Process & import" button disabled only when zero rows would be matched (not when any are unmatched — user is informed and can proceed).
- After `commitImport` resolves, call `queryClient.invalidateQueries({ queryKey: ["dashboard"] })` and the other relevant keys (`compare`, `restaurants`) so dashboard reflects fresh data.

## Feature 2 — Range-vs-range comparison

### New route `src/routes/_authenticated/compare.ranges.tsx` (`/compare/ranges`)

- Add a link to it from existing `/compare` page header ("Compare date ranges →") so the existing restaurant-vs-restaurant page stays untouched.
- State: `restaurantIds: string[]` (multi-select via existing shadcn Command/Popover combobox, defaulting to all active), `rangeA: { from, to }`, `rangeB: { from, to }`.
- Defaults: A = this week (Mon–today), B = last week (same length, prior 7 days). Quick-preset buttons: This week vs Last week, Last 7d vs Prior 7d, This month vs Last month, MTD vs Same period last month, Custom.
- Two `Calendar` instances (`mode="range"`, `numberOfMonths={2}`) in `Popover`s, with `pointer-events-auto` per the datepicker rule. Popover gives the smooth open/close transition — no new animation lib.
- Single react-query call: fetch `daily_metrics` `.in("restaurant_id", restaurantIds).gte("date", min(A.from,B.from)).lte("date", max(A.to,B.to))`, then split client-side into A/B buckets.
- Reuse `sumMetrics`, `formatMetric`, `METRICS`, and the grouped (`sales`/`funnel`/`marketing`) table layout from `compare.tsx` — render side-by-side "Range A" vs "Range B" columns with Δ, % Δ, and the existing winner-badge logic (`m.higherIsBetter`).
- Header strip shows actual day counts per range (`A: 7 days · B: 5 days (2 missing)`) computed from the distinct dates returned per bucket so partial data is explicit.
- Empty-state when no restaurants selected, skeleton while loading, "no data in this range" alert per side when its bucket is empty.

## Technical notes

- New dep: `pdfjs-dist` (PDF text extraction; pure JS, works in Worker). Add via `bun add`.
- `xlsx` already present — use `XLSX.read(arrayBuffer, { type: "array", cellDates: true })`.
- All parsing remains client-side (existing pattern). Only the raw file upload to Storage and the existing `daily_metrics` upsert happen server-side via the supabase client.
- React-query keys to invalidate after commit: `["dashboard"]`, `["compare"]`, `["compare-restaurants"]`, `["restaurants"]`, `["alerts"]`.
- Security findings flagged in the panel are **out of scope** per the request and will not be modified.
