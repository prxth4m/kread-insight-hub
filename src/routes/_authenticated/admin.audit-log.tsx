import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { formatDateTime } from "@/lib/format";
import { Download, ScrollText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/audit-log")({
  component: AuditLog,
});

const ACTIONS = [
  "all","restaurant_created","restaurant_edited","restaurant_archived",
  "restaurant_restored","restaurant_deleted","file_uploaded","report_generated","alert_acknowledged",
];

function AuditLog() {
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", action],
    queryFn: async () => {
      let query = supabase.from("audit_logs").select("*, profiles(full_name, email)").order("created_at", { ascending: false }).limit(500);
      if (action !== "all") query = query.eq("action", action as any);
      const { data } = await query;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    return (data ?? []).filter((r: any) => {
      if (!term) return true;
      const user = r.profiles?.email ?? "";
      return user.toLowerCase().includes(term) || r.action.toLowerCase().includes(term) || (r.target_id ?? "").toLowerCase().includes(term);
    });
  }, [data, q]);

  const exportCsv = () => {
    const rows = [["Timestamp","User","Action","Target","Metadata"], ...filtered.map((r: any) => [
      formatDateTime(r.created_at), r.profiles?.email ?? "", r.action, r.target_id ?? "", JSON.stringify(r.metadata ?? {}),
    ])];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Audit log</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-40" />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => <SelectItem key={a} value={a} className="capitalize">{a.replace(/_/g, " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 h-3.5 w-3.5" /> CSV</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={ScrollText} title="No audit entries" description="Admin actions will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.profiles?.full_name ?? r.profiles?.email ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.action.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.target_id ?? "—"}</TableCell>
                  <TableCell className="max-w-md truncate text-xs text-muted-foreground">{r.metadata ? JSON.stringify(r.metadata) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}