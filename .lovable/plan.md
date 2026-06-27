# Plan: unify Compare + fix import + adopt "use client" range picker

## 1. Fix the silent import failure (root cause)

`uploaded_files` rows are all stuck in `status: 'processing'` and `daily_metrics` is empty. The
row that contains the date-range summary is being created before the `daily_metrics` upsert,
so the upsert is what's throwing. Several daily_metrics columns are typed `integer` but the
Zomato CSV/XLSX cells routinely hold fractional values (e.g. averaged values, blank → 0,
`Impressions` reported as `12345.0`). PostgREST rejects the batch with
"invalid input syntax for integer".

**Migration (already approved):** convert `delivered_orders`, `impressions`, `ads_orders`,
`ads_impressions`, `orders_with_offers` from `integer` → `numeric` in `public.daily_metrics`.

**Code:** also harden `commitImport` so when the upsert (or any later step) throws we update
the `uploaded_files` row to `status: 'failed'` with the Postgres `code/message/details/hint`
stored in `error_details`. This way future failures surface in the UI instead of leaving the
row in `processing` forever. Use the existing `toError` helper.

## 2. Consolidate Compare into a single page (single restaurant, two date ranges)

The user no longer wants to compare two restaurants; the only flow they need is
"same restaurant, Range A vs Range B".

- Delete `src/routes/_authenticated/compare.ranges.tsx`.
- Rewrite `src/routes/_authenticated/compare.tsx` to:
  - pick exactly one restaurant,
  - pick Range A and Range B via the new `DatePickerWithRange`,
  - keep the preset buttons (This wk vs Last wk, Last 7d vs Prior 7d, This mo vs Last mo, MTD vs same last month),
  - render the same three metric-group tables (sales / funnel / marketing), Δ, %Δ, winner, and
    the "partial data" alert when actual days < expected days.
- Remove the "Date Ranges" item from `AppSidebar` and the cross-page link button on Compare.
- Update query cache key to `["compare-range", restaurantId, A.from, A.to, B.from, B.to]` and
  invalidate it from `upload.tsx` (drop the old `compare`, `compare-ranges` keys).

## 3. Adopt the shadcn-style "use client" range picker

Rewrite `src/components/ui/date-range-picker.tsx` to mirror the snippet the user supplied:
- start the file with `"use client";`
- export `DatePickerWithRange` built on `Field` + `FieldLabel` + `Popover` + `Calendar`
  (`mode="range"`, `numberOfMonths={2}`),
- keep a controlled `DateRangePicker` wrapper (label + value + onChange) for use inside the
  Compare page so the existing call sites keep working.
- Add the missing `Field`/`FieldLabel` primitives at `src/components/ui/field.tsx` (the snippet
  imports them from `@/components/ui/field`, which doesn't exist yet in this project).

## Files to add / edit / delete

- add: `src/components/ui/field.tsx`
- edit: `src/components/ui/date-range-picker.tsx`
- edit: `src/lib/csv-process.ts` (mark file as `failed` on error, store error_details)
- edit: `src/routes/_authenticated/compare.tsx` (rewritten as date-range comparison)
- edit: `src/routes/_authenticated/upload.tsx` (drop stale query-cache keys)
- edit: `src/components/layout/AppSidebar.tsx` (remove Date Ranges item)
- delete: `src/routes/_authenticated/compare.ranges.tsx`

## Out of scope

- Not touching auth, RLS, or the `has_role` SECURITY DEFINER warning surfaced by the linter
  (already intentionally kept that way in earlier turns).
- Not changing any other route, dashboard widget, or report logic.