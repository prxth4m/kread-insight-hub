# Restructure navigation + comparison

## 1. Delete obsolete routes
- Remove `src/routes/_authenticated/compare.tsx`
- Remove `src/routes/_authenticated/compare.ranges.tsx`
- `routeTree.gen.ts` auto-regenerates. Grep for any leftover `to="/compare"` / `to="/compare/ranges"` references and remove them (notably the `<Link>` to `/compare/ranges` that lived inside the old compare page — already gone with the file).

## 2. Sidebar (`src/components/layout/AppSidebar.tsx`)
- Replace `mainItems` with just Overview, Restaurants, Reports.
- Drop `GitCompareArrows` and `CalendarRange` from the `lucide-react` import.
- Admin section unchanged.

## 3. Dashboard refactor (`src/routes/_authenticated/dashboard.tsx`)

### 3A. Fleet Overview (trim)
- Keep header, `PeriodSelector`, last-updated timestamp, 8 KPI cards, and Anomaly Alerts card.
- Remove the Top Performers and Weakest Performers cards, the `ranked` computation, the `byRest` map, and the `Trophy` / `TrendingDown` imports.
- Let Anomaly Alerts occupy the full width below the KPI grid (single column card).

### 3B. Performance Comparison (new section, same page)
- Divider with "Performance Comparison" heading between fleet overview and this block.
- Local state: `cmpRestaurantId`, `cmpPreset` (default `"this-vs-last-week"`), `cmpRangeA`, `cmpRangeB` (both `DateRange | undefined`).
- `CMP_PRESETS` defined module-scope with builders for: Today vs Yesterday, This week vs Last week, Last 7d vs Prior 7d, This month vs Last month, Custom.
- `useEffect` on mount applies the `this-vs-last-week` preset.
- Controls:
  - Row 1: searchable `Select` of active restaurants (full width on mobile, ~320px on desktop), placeholder "Select a restaurant to analyse".
  - Row 2: 5 preset pills (`Button` outline/default based on active). Clicking a preset with a builder sets both ranges; "Custom" reveals two `DateRangePicker`s labeled "Period A" / "Period B" — picking from them sets `cmpPreset = "custom"`.
- Query: `["cmp", restaurantId, aFrom, aTo, bFrom, bTo]`, enabled when restaurant + both ranges set. Fetches `daily_metrics` for the restaurant between min and max date across both ranges in one call, then splits into `aRows` / `bRows` by ISO date.
- Compute `aTotals`/`bTotals` via `sumMetrics`, then `deltas` array with `aVal`, `bVal`, `pctChange`, `improved` per `METRICS` entry.
- Results: 2×2 grid (1 col mobile) of category cards:
  - "Sales & Operations" → `group === "sales"`
  - "Customer Funnel" → funnel + specified key allowlist
  - "Customer Segments" → funnel + segment/daypart key allowlist
  - "Ads & Offers" → `group === "marketing"`
- Each card header shows `Period A: …  ·  Period B: …` via `fmtRange` helper.
- Card body: flex rows (not table) — label, `aVal → bVal`, Δ% badge (green ↑ improved, red ↓ declined, muted "—" otherwise). Skip rows where both values are 0; if the entire category is skipped, show muted "No data for this period".
- Empty state: `<EmptyState icon={TrendingUp} title="Select a restaurant" …/>` until a restaurant is chosen. Skeletons while loading.
- No winner column, no scorecard, no verdict text.

### Imports added/removed
- Add: `DateRangePicker`, `DateRange` type, period helpers (`startOfWeek`, `endOfWeek`, `startOfMonth`, `endOfMonth`, `shiftDays`, `toISODate`), `METRICS`, `sumMetrics`, `formatMetric`, `TrendingUp`.
- Remove: `Trophy`, `TrendingDown`, and any imports only used by the removed cards.

## 4. Anomaly dedupe

### Migration
```sql
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS data_date DATE;
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_restaurant_metric_date_key;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_restaurant_metric_date_key
  UNIQUE (restaurant_id, metric_name, data_date);
```
Submitted via `supabase--migration` so types regenerate before code edits compile.

### `src/lib/anomaly.ts`
- Add `data_date: last.date` to each pushed alert object.
- Switch `.insert(...)` to `.upsert(alerts, { onConflict: "restaurant_id,metric_name,data_date", ignoreDuplicates: true })`.
- Extend `RULES` with `average_rating`, `total_complaints`, `online_pct`, `kpt_minutes` thresholds as specified.

## 5. Out of scope (do not modify)
`src/lib/metrics.ts`, `src/lib/csv-process.ts`, `src/lib/period.ts`, `src/components/ui/date-range-picker.tsx`, `src/components/kpi-card.tsx`, admin routes, restaurants pages, upload flow, existing RLS migrations.

## Execution order
1. Run the alerts migration (waits for approval; types regenerate).
2. Delete the two compare route files.
3. Edit `AppSidebar.tsx`.
4. Rewrite `dashboard.tsx` with fleet trim + comparison section.
5. Update `src/lib/anomaly.ts` (data_date + upsert + new RULES).
6. Grep for stale `/compare` references and clean up.
