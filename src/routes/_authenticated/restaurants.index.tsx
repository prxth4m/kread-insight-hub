import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { formatINR, formatNumber, formatMultiplier, formatDate } from "@/lib/format";
import { useState, useMemo } from "react";
import { Store, Search, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/restaurants/")({
  component: RestaurantList,
  head: () => ({ meta: [{ title: "Restaurants — Kread Insights" }] }),
});

function RestaurantList() {
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["restaurants-list"],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const [restRes, metricsRes] = await Promise.all([
        supabase.from("restaurants").select("*").eq("is_archived", false).order("display_name"),
        supabase.from("daily_metrics").select("*").gte("date", since.toISOString().slice(0, 10)),
      ]);
      const byId = new Map<string, any>();
      (metricsRes.data ?? []).forEach((m: any) => {
        const acc = byId.get(m.restaurant_id) ?? { sales: 0, orders: 0, spend: 0, salesAds: 0, lastDate: null as string | null };
        acc.sales += Number(m.sales || 0);
        acc.orders += Number(m.delivered_orders || 0);
        acc.spend += Number(m.ads_spend || 0);
        acc.salesAds += Number(m.sales_from_ads || 0);
        if (!acc.lastDate || m.date > acc.lastDate) acc.lastDate = m.date;
        byId.set(m.restaurant_id, acc);
      });
      return { restaurants: restRes.data ?? [], byId };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.toLowerCase().trim();
    return data.restaurants.filter((r: any) => !term || r.display_name.toLowerCase().includes(term));
  }, [data, q]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Restaurants</h1>
        <p className="text-sm text-muted-foreground">All active restaurants · last 30 days</p>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">All restaurants</CardTitle>
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-8" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Store} title="No restaurants" description={data?.restaurants.length === 0 ? "Add restaurants from Admin → Manage Restaurants." : "No match for search."} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Orders</TableHead>
                    <TableHead className="text-right">AOV</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                    <TableHead className="text-right">Ad Spend</TableHead>
                    <TableHead>Last Active</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r: any) => {
                    const m = data!.byId.get(r.id) ?? { sales: 0, orders: 0, spend: 0, salesAds: 0, lastDate: null };
                    const aov = m.orders ? m.sales / m.orders : 0;
                    const roi = m.spend ? m.salesAds / m.spend : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link to="/restaurants/$id" params={{ id: r.id }} className="font-medium hover:underline">
                            {r.display_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(m.sales, { compact: true })}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(m.orders)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(aov)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMultiplier(roi)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatINR(m.spend, { compact: true })}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{m.lastDate ? formatDate(m.lastDate) : "—"}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{r.platform}</Badge></TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/restaurants/$id" params={{ id: r.id }}>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}