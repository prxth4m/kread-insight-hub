import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { PeriodSelector } from "@/components/period-selector";
import { type PeriodMode, getPeriodRange, toISODate } from "@/lib/period";
import { METRICS, sumMetrics, formatMetric } from "@/lib/metrics";
import { GitCompareArrows, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/compare")({
  component: ComparePage,
  head: () => ({ meta: [{ title: "Compare — Kread Insights" }] }),
});

function ComparePage() {
  const [mode, setMode] = useState<PeriodMode>("weekly");
  const [date, setDate] = useState(() => new Date());
  const [aId, setA] = useState<string | undefined>();
  const [bId, setB] = useState<string | undefined>();

  const { data: restaurants } = useQuery({
    queryKey: ["compare-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id, display_name").eq("is_archived", false).order("display_name");
      return data ?? [];
    },
  });

  const cur = getPeriodRange(mode, date);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["compare", aId, bId, mode, toISODate(date)],
    enabled: !!aId && !!bId,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_metrics")
        .select("*")
        .in("restaurant_id", [aId!, bId!])
        .gte("date", toISODate(cur.start))
        .lte("date", toISODate(cur.end));
      return data ?? [];
    },
  });

  const result = useMemo(() => {
    if (!rows) return null;
    const rowsA = rows.filter((r: any) => r.restaurant_id === aId);
    const rowsB = rows.filter((r: any) => r.restaurant_id === bId);
    return { a: sumMetrics(rowsA), b: sumMetrics(rowsB) };
  }, [rows, aId, bId]);

  const aName = restaurants?.find((r) => r.id === aId)?.display_name ?? "Restaurant A";
  const bName = restaurants?.find((r) => r.id === bId)?.display_name ?? "Restaurant B";

  const insight = useMemo(() => {
    if (!result) return null;
    let aWins = 0;
    let bWins = 0;
    METRICS.forEach((m) => {
      const av = (result.a as any)[m.key];
      const bv = (result.b as any)[m.key];
      if (av === bv) return;
      const aBetter = m.higherIsBetter ? av > bv : av < bv;
      if (aBetter) aWins++; else bWins++;
    });
    return { aWins, bWins };
  }, [result]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compare Restaurants</h1>
          <p className="text-sm text-muted-foreground">All-metrics comparison · {cur.label}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/compare/ranges"><CalendarRange className="mr-1 h-4 w-4" /> Compare date ranges</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selection</CardTitle>
          <CardDescription>Pick two restaurants and a period.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Select value={aId} onValueChange={setA}>
            <SelectTrigger><SelectValue placeholder="Restaurant A" /></SelectTrigger>
            <SelectContent>
              {(restaurants ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={bId} onValueChange={setB}>
            <SelectTrigger><SelectValue placeholder="Restaurant B" /></SelectTrigger>
            <SelectContent>
              {(restaurants ?? []).filter((r) => r.id !== aId).map((r) => <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <PeriodSelector mode={mode} onModeChange={setMode} date={date} onDateChange={setDate} />
        </CardContent>
      </Card>

      {!aId || !bId ? (
        <EmptyState icon={GitCompareArrows} title="Pick two restaurants" description="Select Restaurant A and Restaurant B to see the all-metrics comparison." />
      ) : isLoading || !result ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{aName} leads</div><div className="text-2xl font-semibold">{insight?.aWins ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {METRICS.length}</span></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{bName} leads</div><div className="text-2xl font-semibold">{insight?.bWins ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {METRICS.length}</span></div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Verdict</div><div className="mt-1 text-sm font-medium">
              {insight && insight.aWins > insight.bWins ? `${aName} outperforms in ${insight.aWins} of ${METRICS.length} metrics.`
                : insight && insight.bWins > insight.aWins ? `${bName} outperforms in ${insight.bWins} of ${METRICS.length} metrics.`
                : "Even performance across metrics."}
            </div></CardContent></Card>
          </div>

          {(["sales", "funnel", "marketing"] as const).map((g) => (
            <Card key={g}>
              <CardHeader><CardTitle className="text-base capitalize">{g}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">{aName}</TableHead>
                      <TableHead className="text-right">{bName}</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead className="text-right">% Δ</TableHead>
                      <TableHead>Winner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {METRICS.filter((m) => m.group === g).map((m) => {
                      const av = (result.a as any)[m.key];
                      const bv = (result.b as any)[m.key];
                      const diff = av - bv;
                      const pct = bv ? ((av - bv) / bv) * 100 : 0;
                      const aBetter = av === bv ? null : m.higherIsBetter ? av > bv : av < bv;
                      return (
                        <TableRow key={m.key}>
                          <TableCell>{m.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(av, m.format)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(bv, m.format)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatMetric(Math.abs(diff), m.format)}</TableCell>
                          <TableCell className="text-right tabular-nums">{isFinite(pct) ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}</TableCell>
                          <TableCell>
                            {aBetter === null ? <Badge variant="outline">Tie</Badge> : aBetter ? <Badge>{aName}</Badge> : <Badge variant="secondary">{bName}</Badge>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}