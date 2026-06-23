import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Download, CalendarIcon, FileBarChart } from "lucide-react";
import { type PeriodMode, getPeriodRange, toISODate } from "@/lib/period";
import { METRICS, sumMetrics, formatMetric } from "@/lib/metrics";
import { formatINR, formatDate, formatDateTime } from "@/lib/format";
import * as XLSX from "xlsx";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
  head: () => ({ meta: [{ title: "Reports — Kread Insights" }] }),
});

type ReportType = "daily" | "weekly" | "fortnightly" | "monthly";

function ReportsPage() {
  const [type, setType] = useState<ReportType>("weekly");
  const [date, setDate] = useState(new Date());
  const [format, setFormat] = useState<"pdf" | "xlsx" | "csv">("xlsx");
  const [generating, setGenerating] = useState(false);

  const period = getPeriodForReport(type, date);

  const { data: history } = useQuery({
    queryKey: ["reports-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("*, profiles(full_name, email)")
        .order("generated_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: restaurants } = await supabase.from("restaurants").select("id, display_name").eq("is_archived", false);
      const { data: rows } = await supabase
        .from("daily_metrics")
        .select("*")
        .gte("date", toISODate(period.start))
        .lte("date", toISODate(period.end));

      const rMap = new Map((restaurants ?? []).map((r) => [r.id, r.display_name]));
      const byRest = new Map<string, any[]>();
      (rows ?? []).forEach((r: any) => {
        const arr = byRest.get(r.restaurant_id) ?? [];
        arr.push(r);
        byRest.set(r.restaurant_id, arr);
      });

      const summary = (restaurants ?? []).map((r) => {
        const rs = byRest.get(r.id) ?? [];
        const t = sumMetrics(rs);
        return { restaurant: r.display_name, ...t };
      });

      const filename = `kread-insights-${type}-${toISODate(period.start)}-to-${toISODate(period.end)}`;

      if (format === "csv") {
        const headers = ["Restaurant", ...METRICS.map((m) => m.label)];
        const lines = [headers.join(",")];
        summary.forEach((row: any) => {
          lines.push([row.restaurant, ...METRICS.map((m) => row[m.key] ?? 0)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
        });
        downloadBlob(new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
      } else if (format === "xlsx") {
        const wb = XLSX.utils.book_new();
        const sheetData = summary.map((row: any) => {
          const o: any = { Restaurant: row.restaurant };
          METRICS.forEach((m) => (o[m.label] = row[m.key]));
          return o;
        });
        const ws = XLSX.utils.json_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(wb, ws, "Summary");
        // Executive sheet
        const totals = sumMetrics(rows ?? []);
        const execData = [
          { Field: "Report", Value: `Kread Insights — ${type}` },
          { Field: "Period", Value: `${formatDate(period.start)} to ${formatDate(period.end)}` },
          { Field: "Restaurants", Value: restaurants?.length ?? 0 },
          { Field: "Total Sales (₹)", Value: totals.sales },
          { Field: "Total Orders", Value: totals.delivered_orders },
          { Field: "Avg AOV (₹)", Value: totals.average_order_value },
          { Field: "Avg ROI", Value: totals.ads_roi },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execData), "Executive");
        XLSX.writeFile(wb, `${filename}.xlsx`);
      } else {
        // PDF: open printable HTML view in new window
        openPdfPreview(type, period, summary, restaurants ?? []);
      }

      // Record report row (no storage path since file generated client-side)
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: report } = await supabase.from("reports").insert({
          generated_by: u.user.id,
          report_type: type,
          period_start: toISODate(period.start),
          period_end: toISODate(period.end),
          restaurant_ids: (restaurants ?? []).map((r) => r.id),
          format,
          storage_path: `${filename}.${format}`,
        }).select().single();
        if (report) await logAudit("report_generated", "report", report.id, { type, format });
      }
      toast.success("Report generated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Generate polished, client-ready reports.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configure report</CardTitle>
          <CardDescription>Period: {formatDate(period.start)} → {formatDate(period.end)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="fortnightly">Fortnightly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start gap-2 font-normal">
                <CalendarIcon className="h-4 w-4" /> {formatDate(date)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} className="pointer-events-auto p-3" /></PopoverContent>
          </Popover>
          <Select value={format} onValueChange={(v) => setFormat(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="pdf">PDF (print)</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Generate
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent reports</CardTitle>
        </CardHeader>
        <CardContent>
          {(history ?? []).length === 0 ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><FileBarChart className="h-4 w-4" /> No reports generated yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Generated</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{formatDateTime(r.generated_at)}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize">{r.report_type}</Badge></TableCell>
                    <TableCell className="text-xs">{formatDate(r.period_start)} → {formatDate(r.period_end)}</TableCell>
                    <TableCell><Badge variant="secondary" className="uppercase">{r.format}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.profiles?.full_name ?? r.profiles?.email ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getPeriodForReport(type: ReportType, date: Date) {
  if (type === "daily") return getPeriodRange("daily" as PeriodMode, date);
  if (type === "weekly") return getPeriodRange("weekly" as PeriodMode, date);
  if (type === "monthly") return getPeriodRange("monthly" as PeriodMode, date);
  // fortnightly = 14 days ending on date
  const end = date;
  const start = new Date(date);
  start.setDate(start.getDate() - 13);
  return { start, end, label: `${formatDate(start)} → ${formatDate(end)}` };
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function openPdfPreview(type: string, period: { start: Date; end: Date }, summary: any[], restaurants: any[]) {
  const w = window.open("", "_blank");
  if (!w) return;
  const totalSales = summary.reduce((s, r) => s + (r.sales || 0), 0);
  const totalOrders = summary.reduce((s, r) => s + (r.delivered_orders || 0), 0);
  const top = [...summary].sort((a, b) => b.sales - a.sales).slice(0, 5);
  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  const safeType = esc(type);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Kread Insights — ${safeType}</title>
    <style>
      *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
      body{margin:0;padding:32px;color:#111;}
      h1{font-size:22px;margin:0 0 4px;}
      h2{font-size:14px;margin:24px 0 8px;color:#333;border-bottom:1px solid #ddd;padding-bottom:4px;}
      .meta{color:#666;font-size:12px;margin-bottom:24px;}
      table{width:100%;border-collapse:collapse;font-size:12px;}
      th,td{border-bottom:1px solid #eee;padding:6px 8px;text-align:left;}
      th{background:#f7f7f7;font-weight:600;}
      .kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}
      .kpi div{border:1px solid #eee;padding:10px;border-radius:6px;}
      .kpi b{display:block;font-size:18px;}
      .num{text-align:right;font-variant-numeric:tabular-nums;}
    </style></head><body>
    <h1>Kread Insights — ${esc(type[0].toUpperCase() + type.slice(1))} Report</h1>
    <div class="meta">${esc(formatDate(period.start))} → ${esc(formatDate(period.end))} · ${restaurants.length} restaurants · Prepared by KREAD Consulting</div>
    <h2>Executive Summary</h2>
    <div class="kpi">
      <div><span>Total Sales</span><b>${formatINR(totalSales)}</b></div>
      <div><span>Total Orders</span><b>${totalOrders.toLocaleString("en-IN")}</b></div>
      <div><span>Avg AOV</span><b>${formatINR(totalOrders ? totalSales / totalOrders : 0)}</b></div>
      <div><span>Restaurants</span><b>${restaurants.length}</b></div>
    </div>
    <h2>Top Performers</h2>
    <table><thead><tr><th>#</th><th>Restaurant</th><th class="num">Sales</th><th class="num">Orders</th></tr></thead><tbody>
      ${top.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.restaurant)}</td><td class="num">${formatINR(r.sales)}</td><td class="num">${(r.delivered_orders || 0).toLocaleString("en-IN")}</td></tr>`).join("")}
    </tbody></table>
    <h2>Per-Restaurant Detail</h2>
    <table><thead><tr><th>Restaurant</th>${METRICS.map((m) => `<th class="num">${esc(m.label)}</th>`).join("")}</tr></thead><tbody>
      ${summary.map((r) => `<tr><td>${esc(r.restaurant)}</td>${METRICS.map((m) => `<td class="num">${esc(formatMetric(r[m.key], m.format))}</td>`).join("")}</tr>`).join("")}
    </tbody></table>
    <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
  </body></html>`;
  w.document.write(html);
  w.document.close();
}