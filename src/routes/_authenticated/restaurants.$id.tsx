import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PeriodSelector } from "@/components/period-selector";
import { KpiCard } from "@/components/kpi-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type PeriodMode, getPeriodRange, getPreviousRange, toISODate } from "@/lib/period";
import { sumMetrics, METRICS, formatMetric } from "@/lib/metrics";
import { pctChange, formatDate } from "@/lib/format";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/restaurants/$id")({
  component: RestaurantDetail,
  head: () => ({ meta: [{ title: "Restaurant — Kread Insights" }] }),
});

function RestaurantDetail() {
  const { id } = Route.useParams();
  const [mode, setMode] = useState<PeriodMode>("weekly");
  const [date, setDate] = useState(() => new Date());

  const cur = getPeriodRange(mode, date);
  const prev = getPreviousRange(mode, date);

  const { data, isLoading } = useQuery({
    queryKey: ["restaurant", id, mode, toISODate(date)],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 60);
      const [r, curRows, prevRows, trendRows, alerts] = await Promise.all([
        supabase.from("restaurants").select("*").eq("id", id).single(),
        supabase.from("daily_metrics").select("*").eq("restaurant_id", id).gte("date", toISODate(cur.start)).lte("date", toISODate(cur.end)),
        supabase.from("daily_metrics").select("*").eq("restaurant_id", id).gte("date", toISODate(prev.start)).lte("date", toISODate(prev.end)),
        supabase.from("daily_metrics").select("*").eq("restaurant_id", id).gte("date", since.toISOString().slice(0, 10)).order("date"),
        supabase.from("alerts").select("*").eq("restaurant_id", id).eq("acknowledged", false).order("detected_at", { ascending: false }).limit(10),
      ]);
      return {
        restaurant: r.data,
        curRows: curRows.data ?? [],
        prevRows: prevRows.data ?? [],
        trend: trendRows.data ?? [],
        alerts: alerts.data ?? [],
      };
    },
  });

  const totals = useMemo(() => {
    if (!data) return null;
    return { cur: sumMetrics(data.curRows), prev: sumMetrics(data.prevRows) };
  }, [data]);

  if (isLoading || !data || !totals) {
    return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-96" /></div>;
  }
  if (!data.restaurant) {
    return <EmptyDetail />;
  }

  const groups = ["sales", "funnel", "marketing"] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link to="/restaurants"><ArrowLeft className="mr-1 h-4 w-4" /> Restaurants</Link>
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{data.restaurant.display_name}</h1>
            <Badge variant="secondary" className="capitalize">{data.restaurant.platform}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{cur.label} vs {prev.label}</p>
        </div>
        <PeriodSelector mode={mode} onModeChange={setMode} date={date} onDateChange={setDate} />
      </div>

      {data.alerts.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{data.alerts.length} active alert{data.alerts.length > 1 ? "s" : ""}</AlertTitle>
          <AlertDescription className="text-xs">
            Latest: {data.alerts[0].message}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {groups.map((g) => <TabsTrigger key={g} value={g} className="capitalize">{g}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {METRICS.slice(0, 8).map((m) => {
              const c = (totals.cur as any)[m.key];
              const p = (totals.prev as any)[m.key];
              return (
                <KpiCard key={m.key} label={m.label} value={formatMetric(c, m.format)} previousValue={formatMetric(p, m.format)} pctChange={pctChange(c, p)} higherIsBetter={m.higherIsBetter} />
              );
            })}
          </div>
          <TrendChart data={data.trend} metricKey="sales" label="Sales (60d)" />
        </TabsContent>
        {groups.map((g) => (
          <TabsContent key={g} value={g} className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {METRICS.filter((m) => m.group === g).map((m) => {
                const c = (totals.cur as any)[m.key];
                const p = (totals.prev as any)[m.key];
                return (
                  <KpiCard key={m.key} label={m.label} value={formatMetric(c, m.format)} previousValue={formatMetric(p, m.format)} pctChange={pctChange(c, p)} higherIsBetter={m.higherIsBetter} />
                );
              })}
            </div>
            {METRICS.filter((m) => m.group === g).slice(0, 2).map((m) => (
              <TrendChart key={m.key} data={data.trend} metricKey={m.key} label={`${m.label} (60d)`} />
            ))}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function EmptyDetail() {
  return <div className="p-6 text-sm text-muted-foreground">Restaurant not found.</div>;
}

function TrendChart({ data, metricKey, label }: { data: any[]; metricKey: string; label: string }) {
  const chartData = data.map((r) => ({ date: formatDate(r.date), value: Number(r[metricKey] || 0) }));
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>Daily trend</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={{ value: { label, color: "var(--chart-1)" } }} className="h-64 w-full">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey="value" stroke="var(--color-value)" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}