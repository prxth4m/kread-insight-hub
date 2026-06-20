# Kread Insights — Internal Restaurant Analytics Platform

This re-issues the previously approved plan so you can switch to build mode and begin implementation.

## 1. Architecture & Stack
- Keep the current TanStack Start + React 19 + Tailwind v4 + shadcn/ui project (no Next.js migration — TanStack Start already provides SSR, route protection via `_authenticated` layouts, and server functions/routes that cover everything NextAuth + Next middleware would).
- Enable **Lovable Cloud** (Supabase under the hood) for Postgres + Auth + Storage + RLS. Auth uses Cloud's email/password (no NextAuth).
- FastAPI is **not** a fit on this platform — server runs on Cloudflare Workers (no Python). All CSV processing, anomaly detection, aggregation, PDF/Excel/CSV generation runs in **TanStack server functions / server routes** in TypeScript. Libraries: `papaparse` (CSV), `xlsx` (Excel), `pdf-lib` or HTML-to-PDF via a serverless-friendly route for PDFs.
- Branding: "Kread Insights" everywhere (title, sidebar, head metadata, exports, login, footer).

## 2. Database Schema (migrations)
Tables (all in `public`, with GRANTs + RLS):
- `profiles` (id → auth.users, full_name, email)
- `user_roles` (user_id, role enum `admin`|`viewer`) + `has_role()` security-definer fn
- `restaurants` (id, name unique, display_name, platform enum `zomato`|`swiggy` default zomato, status, is_archived, archived_at, archived_by, archive_reason, timestamps)
- `uploaded_files` (id, file_name, file_size, uploaded_by, uploaded_at, row_count, status, error_details jsonb)
- `raw_imports` (id, uploaded_file_id, restaurant_id, date, raw_row_data jsonb)
- `daily_metrics` (restaurant_id, date, + all 13 metrics: sales, delivered_orders, aov, impressions, menu_to_order, menu_to_cart, cart_to_order, sales_from_ads, ad_ctr, ads_orders, ads_impressions, ads_spend, ads_roi, gross_sales_from_offers, orders_with_offers, discount_given, effective_discount). Unique (restaurant_id, date).
- `weekly_aggregates`, `monthly_aggregates` (same metrics + period_start, period_end)
- `alerts` (restaurant_id, metric_name, severity, current_value, previous_value, pct_change, detected_at, acknowledged, acknowledged_by, acknowledged_at)
- `reports` (generated_by, report_type, period_start, period_end, restaurant_ids[], format, storage_path, generated_at)
- `audit_logs` (user_id, action, target_type, target_id, metadata jsonb, created_at)

RLS: authenticated read on most tables; writes restricted via `has_role(auth.uid(), 'admin')`. Indexes on hot paths.

## 3. Auth & Route Protection
- Cloud email/password sign-in at `/auth`. First-registered user auto-granted admin via trigger; subsequent users default viewer.
- Use the integration-managed `_authenticated` layout to gate `/dashboard`, `/restaurants`, `/restaurants/$id`, `/compare`, `/reports`, `/upload`, `/admin/*`.
- Admin-only routes (`/upload`, `/admin/*`) further gated by a nested `_admin` layout that checks `has_role` via server fn and redirects viewers.
- All server functions use `requireSupabaseAuth` middleware; admin actions additionally check `has_role`. Public/share endpoints: none.

## 4. App Shell
- Collapsible shadcn Sidebar with: Overview, Restaurants, Compare, Reports, Upload (admin), Admin → (Restaurants, Archived, Audit Log).
- Sticky header: breadcrumbs, global period selector, theme toggle, user menu with logout.
- Footer label "Kread Insights".

## 5. Restaurant Management (admin)
- `/admin/restaurants`: TanStack Table (sort/search/filter/column-visibility/pagination/CSV export). Add/Edit via Sheet + react-hook-form + Zod. Archive via AlertDialog requiring reason. No seed — all 32 added through UI.
- `/admin/restaurants/archived`: list archived with Restore and (gated) Permanent Delete (typed-name confirmation).
- Every action writes `audit_logs`.

## 6. CSV Upload Pipeline (admin)
- `/upload`: drag-and-drop card; stepper Upload → Validate → Process → Confirm.
- Server fn parses CSV with papaparse, validates required columns, coerces types, dedupes, fuzzy-matches restaurant names against active restaurants, returns preview + warnings.
- Confirmation step upserts into `raw_imports` + `daily_metrics`, recomputes weekly/monthly aggregates for affected dates, runs anomaly detection, logs to `uploaded_files` + `audit_logs`.
- Repeated uploads supported; same (restaurant_id, date) rows upsert.

## 7. Overview Dashboard `/dashboard`
- Period toolbar: Today vs Yesterday, This Week vs Last Week, This Month vs Last Month, custom range.
- KPI grid (Cards): Total Restaurants, Total Sales, Total Orders, Avg AOV, Avg ROI, Total Ad Spend, Total Offer Sales, Active Alerts. Each shows current, previous, abs Δ, % Δ, trend arrow, mini Recharts sparkline.
- Top 5 / Bottom 5 performers panels; Rankings tabs (Most Improved, Highest ROI, Best Funnel).
- Anomaly Alerts panel grouped by severity, click-through to restaurant detail.
- Last-updated timestamp.

## 8. Restaurant List `/restaurants`
- TanStack Table: Name, Sales, Orders, AOV, ROI, Ad Spend, Last Active, Status, Actions. Export CSV/XLSX. Admin row actions: Edit, Archive.

## 9. Restaurant Detail `/restaurants/$id`
- Header with name, status, last updated. Period tabs Daily/Weekly/Monthly + date/week/month picker.
- Tabs: Overview, Sales, Customer Funnel, Marketing. Each metric: current, previous, Δ, %Δ, trend badge, Recharts trend chart via ChartContainer.
- Restaurant-scoped anomaly panel.

## 10. Compare `/compare`
- Two restaurant selectors + period context (Daily/Weekly/Monthly + picker).
- Default: **All Metrics Overview** scorecard table (Metric, A, B, Δ, %Δ, Winner) grouped by Sales / Funnel / Marketing.
- Top KPI summary cards ("A leads in X of 13"); grouped Recharts bar charts.
- Auto-generated NL insight summary.
- Click any metric row → expanded single-metric drill-down chart.
- Selections persisted in URL search params for shareable links.

## 11. Reports `/reports`
- Controls: type (Daily/Weekly/Fortnightly/Monthly), period picker, restaurant multi-select, format (PDF/Excel/CSV).
- Server fn assembles report data; PDF via HTML→PDF rendering (server route), Excel via `xlsx`, CSV native. Files written to Cloud Storage; `reports` row records metadata.
- Inline preview: Executive Summary, KPI block, trend charts, rankings, anomalies, narrative.
- Reports history table with download links. Viewers can generate + export.

## 12. Anomaly Detection
- Thresholds (warning / critical): Sales 20/30%, Orders 20/30%, Impressions 30/50%, ROI 25/40%, Funnel conv. 15/25%, Discount spike 50% warning.
- Runs after each upload; on-demand button in admin. Inserts into `alerts`. Acknowledge action sets flags + logs audit.

## 13. Admin
- `/admin/audit-log`: filterable TanStack Table (action, date range, user) with CSV export.
- `/admin`: summary cards (users, uploads, recent activity, system health).

## 14. Exports
- PDF/Excel/CSV all generated server-side from the same processed tables that drive the dashboard so values match exactly. Proper ₹ and % formatting, UTF-8.

## 15. Polish
- Skeletons on all data pages, Empty states on empty tables, Sonner toasts, error boundaries, design-token-only colors, dark mode, keyboard accessibility, responsive sidebar (Sheet on mobile), horizontal table scroll.

## Technical notes (for the build)
- Stack stays TanStack Start; no Next.js, no FastAPI, no separate backend repo. This is the only platform-compatible path and preserves every functional requirement.
- Cloud Auth replaces NextAuth — same UX (email/password, HTTP-only cookies, session expiration, logout) with less infrastructure.
- All processing libraries chosen are Worker-compatible.

Switch to build mode to begin.