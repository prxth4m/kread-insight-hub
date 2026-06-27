import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { KpiCard } from "@/components/kpi-card";
import { PeriodSelector } from "@/components/period-selector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { DateRange } from "react-day-picker";
import {
  type PeriodMode,
  getPeriodRange,
  getPreviousRange,
  toISODate,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  shiftDays,
} from "@/lib/period";
import { formatINR, formatNumber, formatMultiplier, pctChange, formatDateTime } from "@/lib/format";
import { METRICS, sumMetrics, formatMetric, METRIC_BY_KEY, type MetricKey } from "@/lib/metrics";
import { AlertTriangle, Activity, TrendingUp, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Overview — Kread Insights" }] }),
});

const CMP_PRESETS = [
  {
    id: "today-vs-yesterday",
    label: "Today vs Yesterday",
    build: () => {
      const today = new Date();
      const yesterday = shiftDays(today, -1);
      return {
        a: { from: today, to: today } as DateRange,
        b: { from: yesterday, to: yesterday } as DateRange,
      };
    },
  },
  {
    id: "this-vs-last-week",
    label: "This week vs Last week",
    build: () => {
      const now = new Date();
      const a: DateRange = { from: startOfWeek(now), to: endOfWeek(now) };
      const lastRef = shiftDays(now, -7);
      const b: DateRange = { from: startOfWeek(lastRef), to: endOfWeek(lastRef) };
      return { a, b };
    },
  },
  {
    id: "last-7-vs-prior-7",
    label: "Last 7d vs Prior 7d",
    build: () => {
      const now = new Date();
      return {
        a: { from: shiftDays(now, -6), to: now } as DateRange,
        b: { from: shiftDays(now, -13), to: shiftDays(now, -7) } as DateRange,
      };
    },
  },
  {
    id: "this-vs-last-month",
    label: "This month vs Last month",
    build: () => {
      const now = new Date();
      const a: DateRange = { from: startOfMonth(now), to: endOfMonth(now) };
      const lastRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const b: DateRange = { from: startOfMonth(lastRef), to: endOfMonth(lastRef) };
      return { a, b };
    },
  },
  {
    id: "custom",
    label: "Custom",
    build: null as null | (() => { a: DateRange; b: DateRange }),
  },
] as const;

const FUNNEL_KEYS: MetricKey[] = [
  "impressions", "impressions_to_menu", "menu_opens", "menu_to_cart",
  "cart_builds", "cart_to_order", "placed_orders", "delivered_orders",
];
const SEGMENT_KEYS: MetricKey[] = [
  "new_user_orders", "repeat_user_orders", "lapsed_user_orders",
  "breakfast_orders", "lunch_orders", "snacks_orders", "dinner_orders",
  "late_night_orders",
];

const CATEGORIES: { title: string; keys: MetricKey[] }[] = [
  { title: "Sales & Operations", keys: METRICS.filter((m) => m.group === "sales").map((m) => m.key) },
  { title: "Customer Funnel", keys: FUNNEL_KEYS },
  { title: "Customer Segments", keys: SEGMENT_KEYS },
  { title: "Ads & Offers", keys: METRICS.filter((m) => m.group === "marketing").map((m) => m.key) },
];

function fmtRange(r: DateRange | undefined): string {
  if (!r?.from) return "—";
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const from = r.from.toLocaleDateString("en-IN", opts);
  if (!r.to || toISODate(r.to) === toISODate(r.from)) return from;
  return `${from} – ${r.to.toLocaleDateString("en-IN", opts)}`;
}

function Dashboard() {
  const [mode, setMode] = useState<PeriodMode>("weekly");
  const [date, setDate] = useState(() => new Date());

  const cur = getPeriodRange(mode, date);
  const prev = getPreviousRange(mode, date);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", mode, toISODate(date)],
    queryFn: async () => {
      const [{ data: restaurants }, { data: curRows }, { data: prevRows }, { data: alerts }, { data: lastFile }] =
        await Promise.all([
          supabase.from("restaurants").select("id, display_name, is_archived").eq("is_archived", false),
          supabase
            .from("daily_metrics")
            .select("*")
            .gte("date", toISODate(cur.start))
            .lte("date", toISODate(cur.end)),
          supabase
            .from("daily_metrics")
            .select("*")
            .gte("date", toISODate(prev.start))
            .lte("date", toISODate(prev.end)),
          supabase
            .from("alerts")
            .select("*, restaurants(display_name)")
            .eq("acknowledged", false)
            .order("detected_at", { ascending: false })
            .limit(10),
          supabase
            .from("uploaded_files")
            .select("created_at")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
      return { restaurants: restaurants ?? [], curRows: curRows ?? [], prevRows: prevRows ?? [], alerts: alerts ?? [], lastFile };
    },
  });

  const totals = useMemo(() => {
    if (!data) return null;
    const curT = sumMetrics(data.curRows);
    const prevT = sumMetrics(data.prevRows);
    return { curT, prevT };
  }, [data]);

  // ---------- Comparison state ----------
  const [cmpRestaurantId, setCmpRestaurantId] = useState<string>("");
  const [cmpPreset, setCmpPreset] = useState<string>("this-vs-last-week");
  const [cmpRangeA, setCmpRangeA] = useState<DateRange | undefined>();
  const [cmpRangeB, setCmpRangeB] = useState<DateRange | undefined>();

  useEffect(() => {
    const preset = CMP_PRESETS.find((p) => p.id === "this-vs-last-week");
    if (preset?.build) {
      const { a, b } = preset.build();
      setCmpRangeA(a);
      setCmpRangeB(b);
    }
  }, []);

  const cmpEnabled = !!(
    cmpRestaurantId &&
    cmpRangeA?.from && cmpRangeA?.to &&
    cmpRangeB?.from && cmpRangeB?.to
  );

  const { data: cmpRows, isLoading: cmpLoading } = useQuery({
    enabled: cmpEnabled,
    queryKey: [
      "cmp",
      cmpRestaurantId,
      cmpRangeA?.from && toISODate(cmpRangeA.from),
      cmpRangeA?.to && toISODate(cmpRangeA.to),
      cmpRangeB?.from && toISODate(cmpRangeB.from),
      cmpRangeB?.to && toISODate(cmpRangeB.to),
    ],
    queryFn: async () => {
      const aFrom = toISODate(cmpRangeA!.from!);
      const aTo = toISODate(cmpRangeA!.to!);
      const bFrom = toISODate(cmpRangeB!.from!);
      const bTo = toISODate(cmpRangeB!.to!);
      const minDate = [aFrom, aTo, bFrom, bTo].sort()[0];
      const maxDate = [aFrom, aTo, bFrom, bTo].sort()[3];
      const { data } = await supabase
        .from("daily_metrics")
        .select("*")
        .eq("restaurant_id", cmpRestaurantId)
        .gte("date", minDate)
        .lte("date", maxDate);
      return data ?? [];
    },
  });

  const cmpResult = useMemo(() => {
    if (!cmpRows || !cmpRangeA?.from || !cmpRangeA?.to || !cmpRangeB?.from || !cmpRangeB?.to) return null;
    const aFrom = toISODate(cmpRangeA.from);
    const aTo = toISODate(cmpRangeA.to);
    const bFrom = toISODate(cmpRangeB.from);
    const bTo = toISODate(cmpRangeB.to);
    const aRows = cmpRows.filter((r: any) => r.date >= aFrom && r.date <= aTo);
    const bRows = cmpRows.filter((r: any) => r.date >= bFrom && r.date <= bTo);
    const aTotals = sumMetrics(aRows);
    const bTotals = sumMetrics(bRows);
    return { aTotals, bTotals };
  }, [cmpRows, cmpRangeA, cmpRangeB]);

  if (isLoading || !data || !totals) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const { curT, prevT } = totals;
  const criticalCount = data.alerts.filter((a: any) => a.severity === "critical").length;
  const warnCount = data.alerts.filter((a: any) => a.severity === "warning").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">
            {cur.label} vs {prev.label}
            {data.lastFile?.created_at && ` · Last updated ${formatDateTime(data.lastFile.created_at)}`}
          </p>
        </div>
        <PeriodSelector mode={mode} onModeChange={setMode} date={date} onDateChange={setDate} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard label="Restaurants" value={String(data.restaurants.length)} hint="Active in dashboard" />
        <KpiCard label="Total Sales" value={formatINR(curT.sales, { compact: true })}
          previousValue={formatINR(prevT.sales, { compact: true })} pctChange={pctChange(curT.sales, prevT.sales)} />
        <KpiCard label="Total Orders" value={formatNumber(curT.delivered_orders, { compact: true })}
          previousValue={formatNumber(prevT.delivered_orders, { compact: true })} pctChange={pctChange(curT.delivered_orders, prevT.delivered_orders)} />
        <KpiCard label="Avg AOV" value={formatINR(curT.average_order_value)}
          previousValue={formatINR(prevT.average_order_value)} pctChange={pctChange(curT.average_order_value, prevT.average_order_value)} />
        <KpiCard label="Avg ROI" value={formatMultiplier(curT.ads_roi)}
          previousValue={formatMultiplier(prevT.ads_roi)} pctChange={pctChange(curT.ads_roi, prevT.ads_roi)} />
        <KpiCard label="Ad Spend" value={formatINR(curT.ads_spend, { compact: true })}
          previousValue={formatINR(prevT.ads_spend, { compact: true })} pctChange={pctChange(curT.ads_spend, prevT.ads_spend)} higherIsBetter={false} />
        <KpiCard label="Offer Sales" value={formatINR(curT.gross_sales_from_offers, { compact: true })}
          previousValue={formatINR(prevT.gross_sales_from_offers, { compact: true })} pctChange={pctChange(curT.gross_sales_from_offers, prevT.gross_sales_from_offers)} />
        <KpiCard label="Active Alerts" value={String(data.alerts.length)}
          hint={`${criticalCount} critical · ${warnCount} warning`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-500" /> Anomaly Alerts</CardTitle>
          <CardDescription>Unacknowledged</CardDescription>
        </CardHeader>
        <CardContent>
          {data.alerts.length === 0 ? (
            <EmptyState icon={Activity} title="No active alerts" className="border-none p-4 shadow-none" />
          ) : (
            <ScrollArea className="max-h-64 pr-2">
              <ul className="grid gap-2 md:grid-cols-2">
                {data.alerts.map((a: any) => (
                  <li key={a.id}>
                    <Alert>
                      <AlertTitle className="flex items-center justify-between text-sm">
                        <span>{a.restaurants?.display_name ?? "Restaurant"}</span>
                        <Badge variant={a.severity === "critical" ? "destructive" : "secondary"} className="capitalize">{a.severity}</Badge>
                      </AlertTitle>
                      <AlertDescription className="text-xs">
                        {METRIC_BY_KEY[a.metric_name as keyof typeof METRIC_BY_KEY]?.label ?? a.metric_name} · {a.pct_change != null ? `${a.pct_change > 0 ? "+" : ""}${Number(a.pct_change).toFixed(1)}%` : ""}
                      </AlertDescription>
                    </Alert>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2 pt-2">
        <Separator />
        <h2 className="text-xl font-semibold tracking-tight">Performance Comparison</h2>
        <p className="text-sm text-muted-foreground">Compare a single restaurant across two periods.</p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Select value={cmpRestaurantId} onValueChange={setCmpRestaurantId}>
              <SelectTrigger className="w-full md:w-[320px]">
                <SelectValue placeholder="Select a restaurant to analyse" />
              </SelectTrigger>
              <SelectContent>
                {data.restaurants.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            {CMP_PRESETS.map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={cmpPreset === p.id ? "default" : "outline"}
                onClick={() => {
                  setCmpPreset(p.id);
                  if (p.build) {
                    const { a, b } = p.build();
                    setCmpRangeA(a);
                    setCmpRangeB(b);
                  }
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {cmpPreset === "custom" && (
            <div className="grid gap-3 md:grid-cols-2">
              <DateRangePicker
                label="Period A"
                value={cmpRangeA}
                onChange={(r) => { setCmpRangeA(r); setCmpPreset("custom"); }}
              />
              <DateRangePicker
                label="Period B"
                value={cmpRangeB}
                onChange={(r) => { setCmpRangeB(r); setCmpPreset("custom"); }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {!cmpRestaurantId ? (
        <EmptyState
          icon={TrendingUp}
          title="Select a restaurant"
          description="Choose a restaurant above to compare its performance across two periods."
        />
      ) : cmpLoading || !cmpResult ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {CATEGORIES.map((cat) => {
            const rows = cat.keys
              .map((k) => {
                const m = METRIC_BY_KEY[k];
                const aVal = cmpResult.aTotals[k];
                const bVal = cmpResult.bTotals[k];
                return { m, aVal, bVal };
              })
              .filter(({ aVal, bVal }) => !(aVal === 0 && bVal === 0));

            return (
              <Card key={cat.title}>
                <CardHeader>
                  <CardTitle className="text-base">{cat.title}</CardTitle>
                  <CardDescription>
                    Period A: {fmtRange(cmpRangeA)} · Period B: {fmtRange(cmpRangeB)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data for this period</p>
                  ) : (
                    <ul className="divide-y">
                      {rows.map(({ m, aVal, bVal }) => {
                        const pct = bVal !== 0 ? ((aVal - bVal) / Math.abs(bVal)) * 100 : null;
                        const improved = aVal === bVal ? null : (m.higherIsBetter ? aVal > bVal : aVal < bVal);
                        return (
                          <li key={m.key} className="flex items-center justify-between gap-3 py-2.5">
                            <span className="text-sm font-medium">{m.label}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {formatMetric(aVal, m.format)} → {formatMetric(bVal, m.format)}
                              </span>
                              {improved === null || pct === null ? (
                                <Badge variant="outline" className="tabular-nums text-muted-foreground">—</Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "tabular-nums gap-0.5",
                                    improved
                                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                      : "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400",
                                  )}
                                >
                                  {improved ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                  {Math.abs(pct).toFixed(1)}%
                                </Badge>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}