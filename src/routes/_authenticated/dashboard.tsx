import { createFileRoute, Link } from "@tanstack/react-router";
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
import { type PeriodMode, getPeriodRange, getPreviousRange, toISODate } from "@/lib/period";
import { formatINR, formatNumber, formatMultiplier, pctChange, formatDateTime } from "@/lib/format";
import { sumMetrics, METRIC_BY_KEY } from "@/lib/metrics";
import { AlertTriangle, TrendingUp, TrendingDown, Trophy, Activity, Store } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Overview — Kread Insights" }] }),
});

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
    // Per-restaurant aggregate
    const byRest = new Map<string, any>();
    data.curRows.forEach((r: any) => {
      const prev = byRest.get(r.restaurant_id) ?? { sales: 0, orders: 0 };
      prev.sales += Number(r.sales || 0);
      prev.orders += Number(r.delivered_orders || 0);
      byRest.set(r.restaurant_id, prev);
    });
    const ranked = data.restaurants.map((r: any) => ({
      id: r.id,
      name: r.display_name,
      sales: byRest.get(r.id)?.sales ?? 0,
      orders: byRest.get(r.id)?.orders ?? 0,
    })).sort((a, b) => b.sales - a.sales);
    return { curT, prevT, ranked };
  }, [data]);

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

  const { curT, prevT, ranked } = totals;
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4 text-emerald-500" /> Top Performers</CardTitle>
            <CardDescription>By sales · {cur.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {ranked.length === 0 ? (
              <EmptyState icon={Store} title="No data yet" description="Upload a CSV to see rankings." className="border-none p-4 shadow-none" />
            ) : (
              <ol className="space-y-2">
                {ranked.slice(0, 5).map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-6 w-6 justify-center p-0">{i + 1}</Badge>
                      <Link to="/restaurants/$id" params={{ id: r.id }} className="text-sm font-medium hover:underline">
                        {r.name}
                      </Link>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatINR(r.sales, { compact: true })}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><TrendingDown className="h-4 w-4 text-rose-500" /> Weakest Performers</CardTitle>
            <CardDescription>By sales · {cur.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {ranked.length === 0 ? (
              <EmptyState icon={Store} title="No data yet" className="border-none p-4 shadow-none" />
            ) : (
              <ol className="space-y-2">
                {ranked.slice(-5).reverse().map((r, i) => (
                  <li key={r.id} className="flex items-center justify-between rounded-md border p-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-6 w-6 justify-center p-0">{i + 1}</Badge>
                      <Link to="/restaurants/$id" params={{ id: r.id }} className="text-sm font-medium hover:underline">
                        {r.name}
                      </Link>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{formatINR(r.sales, { compact: true })}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-500" /> Anomaly Alerts</CardTitle>
            <CardDescription>Unacknowledged</CardDescription>
          </CardHeader>
          <CardContent>
            {data.alerts.length === 0 ? (
              <EmptyState icon={Activity} title="No active alerts" className="border-none p-4 shadow-none" />
            ) : (
              <ScrollArea className="h-64 pr-2">
                <ul className="space-y-2">
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
      </div>
    </div>
  );
}