import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { CalendarIcon, GitCompareArrows, Info, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  startOfWeek as soWeek,
  endOfWeek as eoWeek,
  shiftDays,
  startOfMonth as soMonth,
  endOfMonth as eoMonth,
  toISODate,
} from "@/lib/period";
import { METRICS, sumMetrics, formatMetric } from "@/lib/metrics";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/_authenticated/compare/ranges")({
  component: CompareRangesPage,
  head: () => ({ meta: [{ title: "Compare Date Ranges — Kread Insights" }] }),
});

function fmtRange(r: DateRange | undefined) {
  if (!r?.from) return "Pick a date range";
  const from = r.from.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (!r.to) return from;
  const to = r.to.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return `${from} → ${to}`;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / 86400000) + 1;
}

type Preset = { id: string; label: string; build: () => { a: DateRange; b: DateRange } };

const PRESETS: Preset[] = [
  {
    id: "this-vs-last-week",
    label: "This week vs Last week",
    build: () => {
      const now = new Date();
      const a = { from: soWeek(now), to: eoWeek(now) };
      const lastRef = shiftDays(now, -7);
      const b = { from: soWeek(lastRef), to: eoWeek(lastRef) };
      return { a, b };
    },
  },
  {
    id: "last-7-vs-prior-7",
    label: "Last 7d vs Prior 7d",
    build: () => {
      const now = new Date();
      const a = { from: shiftDays(now, -6), to: now };
      const b = { from: shiftDays(now, -13), to: shiftDays(now, -7) };
      return { a, b };
    },
  },
  {
    id: "this-vs-last-month",
    label: "This month vs Last month",
    build: () => {
      const now = new Date();
      const a = { from: soMonth(now), to: eoMonth(now) };
      const lastRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const b = { from: soMonth(lastRef), to: eoMonth(lastRef) };
      return { a, b };
    },
  },
  {
    id: "mtd-vs-same-last",
    label: "MTD vs same period last month",
    build: () => {
      const now = new Date();
      const a = { from: soMonth(now), to: now };
      const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastEnd = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      return { a, b: { from: lastStart, to: lastEnd } };
    },
  },
];

function CompareRangesPage() {
  const initial = PRESETS[0].build();
  const [rangeA, setRangeA] = useState<DateRange | undefined>(initial.a);
  const [rangeB, setRangeB] = useState<DateRange | undefined>(initial.b);
  const [restaurantIds, setRestaurantIds] = useState<string[]>([]);
  const [restaurantPickerOpen, setRestaurantPickerOpen] = useState(false);

  const { data: restaurants } = useQuery({
    queryKey: ["compare-restaurants"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, display_name")
        .eq("is_archived", false)
        .order("display_name");
      return data ?? [];
    },
  });

  const validA = !!(rangeA?.from && rangeA?.to);
  const validB = !!(rangeB?.from && rangeB?.to);
  const ready = validA && validB && restaurantIds.length > 0;

  const queryRange = useMemo(() => {
    if (!validA || !validB) return null;
    const dates = [rangeA!.from!, rangeA!.to!, rangeB!.from!, rangeB!.to!];
    const min = new Date(Math.min(...dates.map((d) => d.getTime())));
    const max = new Date(Math.max(...dates.map((d) => d.getTime())));
    return { min, max };
  }, [rangeA, rangeB, validA, validB]);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["compare-ranges", restaurantIds.sort().join(","),
      validA ? toISODate(rangeA!.from!) : null, validA ? toISODate(rangeA!.to!) : null,
      validB ? toISODate(rangeB!.from!) : null, validB ? toISODate(rangeB!.to!) : null],
    enabled: ready && !!queryRange,
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_metrics")
        .select("*")
        .in("restaurant_id", restaurantIds)
        .gte("date", toISODate(queryRange!.min))
        .lte("date", toISODate(queryRange!.max));
      return data ?? [];
    },
  });

  const buckets = useMemo(() => {
    if (!rows || !validA || !validB) return null;
    const aFrom = new Date(rangeA!.from!); aFrom.setHours(0, 0, 0, 0);
    const aTo = new Date(rangeA!.to!); aTo.setHours(23, 59, 59, 999);
    const bFrom = new Date(rangeB!.from!); bFrom.setHours(0, 0, 0, 0);
    const bTo = new Date(rangeB!.to!); bTo.setHours(23, 59, 59, 999);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = rows.filter((r: any) => {
      const t = new Date(r.date).getTime();
      return t >= aFrom.getTime() && t <= aTo.getTime();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = rows.filter((r: any) => {
      const t = new Date(r.date).getTime();
      return t >= bFrom.getTime() && t <= bTo.getTime();
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const distinctDays = (rs: any[]) => new Set(rs.map((r) => r.date)).size;
    return {
      a: { rows: a, totals: sumMetrics(a), days: distinctDays(a), expected: daysBetween(rangeA!.from!, rangeA!.to!) },
      b: { rows: b, totals: sumMetrics(b), days: distinctDays(b), expected: daysBetween(rangeB!.from!, rangeB!.to!) },
    };
  }, [rows, rangeA, rangeB, validA, validB]);

  const insight = useMemo(() => {
    if (!buckets) return null;
    let aWins = 0, bWins = 0;
    METRICS.forEach((m) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const av = (buckets.a.totals as any)[m.key];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bv = (buckets.b.totals as any)[m.key];
      if (av === bv) return;
      const aBetter = m.higherIsBetter ? av > bv : av < bv;
      if (aBetter) aWins++; else bWins++;
    });
    return { aWins, bWins };
  }, [buckets]);

  const toggleRestaurant = (id: string) => {
    setRestaurantIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const selectAll = () => setRestaurantIds((restaurants ?? []).map((r) => r.id));
  const clearAll = () => setRestaurantIds([]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compare Date Ranges</h1>
          <p className="text-sm text-muted-foreground">Compare the same metrics across two custom date ranges.</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/compare"><ArrowLeftRight className="mr-1 h-4 w-4" /> Compare restaurants</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selection</CardTitle>
          <CardDescription>Pick restaurants and two date ranges to compare.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Button key={p.id} variant="secondary" size="sm" onClick={() => { const r = p.build(); setRangeA(r.a); setRangeB(r.b); }}>
                {p.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Popover open={restaurantPickerOpen} onOpenChange={setRestaurantPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start font-normal">
                  {restaurantIds.length === 0
                    ? "Select restaurants"
                    : restaurantIds.length === 1
                      ? restaurants?.find((r) => r.id === restaurantIds[0])?.display_name
                      : `${restaurantIds.length} restaurants`}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <button className="text-primary hover:underline" onClick={selectAll}>Select all</button>
                  <button className="text-muted-foreground hover:underline" onClick={clearAll}>Clear</button>
                </div>
                <ScrollArea className="h-64">
                  <ul className="space-y-1">
                    {(restaurants ?? []).map((r) => (
                      <li key={r.id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                          <Checkbox checked={restaurantIds.includes(r.id)} onCheckedChange={() => toggleRestaurant(r.id)} />
                          <span>{r.display_name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </PopoverContent>
            </Popover>

            <RangePopover label="Range A" value={rangeA} onChange={setRangeA} />
            <RangePopover label="Range B" value={rangeB} onChange={setRangeB} />
          </div>
        </CardContent>
      </Card>

      {!ready ? (
        <EmptyState icon={GitCompareArrows} title="Pick restaurants and two date ranges" description="Choose at least one restaurant and complete both date ranges to see the comparison." />
      ) : isLoading || !buckets ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Range A leads</div>
              <div className="text-2xl font-semibold">{insight?.aWins ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {METRICS.length}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{fmtRange(rangeA)} · {buckets.a.days} of {buckets.a.expected} days</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Range B leads</div>
              <div className="text-2xl font-semibold">{insight?.bWins ?? 0}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {METRICS.length}</span></div>
              <div className="mt-1 text-xs text-muted-foreground">{fmtRange(rangeB)} · {buckets.b.days} of {buckets.b.expected} days</div>
            </CardContent></Card>
            <Card><CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Verdict</div>
              <div className="mt-1 text-sm font-medium">
                {insight && insight.aWins > insight.bWins ? `Range A outperforms on ${insight.aWins} of ${METRICS.length} metrics.`
                  : insight && insight.bWins > insight.aWins ? `Range B outperforms on ${insight.bWins} of ${METRICS.length} metrics.`
                  : "Even performance across metrics."}
              </div>
            </CardContent></Card>
          </div>

          {(buckets.a.days < buckets.a.expected || buckets.b.days < buckets.b.expected) && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Partial data</AlertTitle>
              <AlertDescription className="text-xs">
                {buckets.a.days < buckets.a.expected && <>Range A has data for {buckets.a.days} of {buckets.a.expected} days. </>}
                {buckets.b.days < buckets.b.expected && <>Range B has data for {buckets.b.days} of {buckets.b.expected} days. </>}
                Totals reflect only days with data.
              </AlertDescription>
            </Alert>
          )}

          {(["sales", "funnel", "marketing"] as const).map((g) => (
            <Card key={g}>
              <CardHeader><CardTitle className="text-base capitalize">{g}</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Metric</TableHead>
                      <TableHead className="text-right">Range A</TableHead>
                      <TableHead className="text-right">Range B</TableHead>
                      <TableHead className="text-right">Δ</TableHead>
                      <TableHead className="text-right">% Δ</TableHead>
                      <TableHead>Winner</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {METRICS.filter((m) => m.group === g).map((m) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const av = (buckets.a.totals as any)[m.key];
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const bv = (buckets.b.totals as any)[m.key];
                      const diff = av - bv;
                      const pct = bv ? ((av - bv) / bv) * 100 : 0;
                      const aBetter = av === bv ? null : m.higherIsBetter ? av > bv : av < bv;
                      return (
                        <TableRow key={m.key}>
                          <TableCell>{m.label}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(av, m.format)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMetric(bv, m.format)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{formatMetric(Math.abs(diff), m.format)}</TableCell>
                          <TableCell className="text-right tabular-nums">{isFinite(pct) && bv ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}</TableCell>
                          <TableCell>
                            {aBetter === null ? <Badge variant="outline">Tie</Badge> : aBetter ? <Badge>Range A</Badge> : <Badge variant="secondary">Range B</Badge>}
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

function RangePopover({ label, value, onChange }: { label: string; value: DateRange | undefined; onChange: (r: DateRange | undefined) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("justify-start text-left font-normal", !value?.from && "text-muted-foreground")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="truncate"><span className="mr-2 font-medium">{label}:</span>{fmtRange(value)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="range" selected={value} onSelect={onChange} numberOfMonths={2} className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}