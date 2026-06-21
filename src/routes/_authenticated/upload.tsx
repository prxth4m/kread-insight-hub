import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload as UploadIcon, Loader2, CheckCircle2, AlertCircle, FileText, Plus, Wand2 } from "lucide-react";
import {
  parseFile,
  commitImport,
  resolveRestaurantMatches,
  type ParseResult,
} from "@/lib/csv-process";
import { detectAnomaliesAll } from "@/lib/anomaly";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { REQUIRED_CSV_COLUMNS } from "@/lib/metrics";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
  head: () => ({ meta: [{ title: "Upload — Kread Insights" }] }),
});

const ACCEPT = ".csv,.xls,.xlsx,.pdf";

function UploadPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [step, setStep] = useState<"select" | "validate" | "preview" | "processing" | "done">("select");
  const [progress, setProgress] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [summary, setSummary] = useState<any>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: existingRestaurants = [], refetch: refetchRestaurants } = useQuery({
    queryKey: ["upload-restaurants"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id, name, display_name");
      return data ?? [];
    },
  });

  const matchInfo = useMemo(() => {
    if (!parsed) return null;
    return resolveRestaurantMatches(parsed.rows, existingRestaurants);
  }, [parsed, existingRestaurants]);

  if (!loading && !isAdmin) {
    return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Admin access required</AlertTitle><AlertDescription>Only admins can upload data.</AlertDescription></Alert>;
  }

  const handleFile = async (f: File) => {
    setFile(f);
    setStep("validate");
    const result = await parseFile(f);
    setParsed(result);
    setStep("preview");
  };

  const createRestaurantFor = async (csvName: string, suggestion?: string) => {
    setCreatingFor(csvName);
    try {
      const { data, error } = await supabase
        .from("restaurants")
        .insert({ name: csvName, display_name: suggestion || csvName, platform: "zomato" })
        .select()
        .single();
      if (error) throw error;
      if (data) await logAudit("restaurant_created", "restaurant", data.id, { name: csvName, from: "upload" });
      toast.success(`Created restaurant "${csvName}"`);
      await refetchRestaurants();
      qc.invalidateQueries({ queryKey: ["admin-restaurants"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create restaurant";
      toast.error(msg);
    } finally {
      setCreatingFor(null);
    }
  };

  const handleCommit = async () => {
    if (!parsed || !file) return;
    setStep("processing");
    setProgress(25);
    try {
      const res = await commitImport(parsed, file);
      setProgress(70);
      await logAudit("file_uploaded", "file", res.fileId, { matched: res.matched, file_name: file.name });
      setProgress(85);
      const alertsCount = await detectAnomaliesAll();
      setProgress(100);
      setSummary({ ...res, alerts: alertsCount });
      setStep("done");
      toast.success(`Imported ${res.matched} rows${alertsCount ? ` · ${alertsCount} anomalies detected` : ""}`);
      // Refresh downstream views so dashboard reflects new data immediately
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["compare"] });
      qc.invalidateQueries({ queryKey: ["compare-ranges"] });
      qc.invalidateQueries({ queryKey: ["compare-restaurants"] });
      qc.invalidateQueries({ queryKey: ["restaurants"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["admin-restaurants"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      toast.error(msg);
      setStep("preview");
    }
  };

  const reset = () => {
    setFile(null);
    setParsed(null);
    setSummary(null);
    setStep("select");
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  const matchedCount = matchInfo?.matched.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload Data</h1>
        <p className="text-sm text-muted-foreground">Import CSV, Excel, or PDF reports into the analytics dataset.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {(["select", "validate", "preview", "processing", "done"] as const).map((s, i) => (
          <div key={s} className={`rounded-md border p-3 text-xs ${step === s ? "border-primary bg-primary/5" : "text-muted-foreground"}`}>
            <div className="font-medium capitalize">
              {i + 1}. {s === "select" ? "Upload" : s === "validate" ? "Validate" : s === "preview" ? "Preview" : s === "processing" ? "Process" : "Confirm"}
            </div>
          </div>
        )).slice(0, 4)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Source file</CardTitle>
          <CardDescription>Supported: CSV, XLSX, XLS, PDF (with extractable tables). Required columns: Restaurant, Date, and all metric columns.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "select" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center"
            >
              <UploadIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm">Drag and drop a CSV, Excel, or PDF file, or</p>
              <Button onClick={() => inputRef.current?.click()}>Select file</Button>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <p className="text-xs text-muted-foreground">Data is auto-cleaned: whitespace trimmed, currency/percent symbols removed, dates normalized.</p>
            </div>
          )}

          {step === "validate" && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Parsing & validating…</div>}

          {step === "preview" && parsed && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" /> {file?.name}</Badge>
                <Badge variant="secondary">{parsed.totalRows} rows parsed</Badge>
                <Badge variant="secondary">{parsed.rows.length} valid</Badge>
                <Badge variant="secondary">{parsed.uniqueRestaurants.length} restaurants</Badge>
                {matchInfo && <Badge variant={matchedCount > 0 ? "default" : "destructive"}>{matchedCount} matched</Badge>}
              </div>

              {parsed.errors.length > 0 && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Parse error</AlertTitle><AlertDescription className="text-xs">{parsed.errors.join(" · ")}</AlertDescription></Alert>
              )}
              {parsed.missingColumns.length > 0 && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Missing columns</AlertTitle><AlertDescription className="text-xs">{parsed.missingColumns.join(", ")}</AlertDescription></Alert>
              )}
              {parsed.warnings.length > 0 && (
                <Alert><AlertTitle>{parsed.warnings.length} warnings</AlertTitle><AlertDescription className="max-h-32 overflow-auto text-xs">{parsed.warnings.slice(0, 10).join(" · ")}{parsed.warnings.length > 10 && ` … +${parsed.warnings.length - 10} more`}</AlertDescription></Alert>
              )}

              {matchInfo && matchInfo.unmatched.length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Unmatched restaurants ({matchInfo.unmatched.length})</CardTitle>
                    <CardDescription className="text-xs">These names in your file don't match any existing restaurant. Create them now to include their rows.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name in file</TableHead>
                          <TableHead>Rows</TableHead>
                          <TableHead>Closest match</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {matchInfo.unmatched.map((u) => (
                          <TableRow key={u.csvName}>
                            <TableCell className="text-xs font-medium">{u.csvName}</TableCell>
                            <TableCell className="text-xs">{u.rowCount}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {u.suggestion ? <span className="inline-flex items-center gap-1"><Wand2 className="h-3 w-3" />{u.suggestion}</span> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" disabled={creatingFor === u.csvName} onClick={() => createRestaurantFor(u.csvName, u.suggestion)}>
                                {creatingFor === u.csvName ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Plus className="mr-1 h-3 w-3" />}
                                Create
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <details>
                <summary className="cursor-pointer text-sm font-medium">Preview first 10 rows</summary>
                <div className="mt-2 overflow-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Restaurant</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Sales</TableHead><TableHead className="text-right">Orders</TableHead><TableHead className="text-right">AOV</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {parsed.rows.slice(0, 10).map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{r.restaurant_name}</TableCell>
                          <TableCell className="text-xs">{r.date}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{r.metrics.sales}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{r.metrics.delivered_orders}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{r.metrics.average_order_value}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>

              <div className="flex gap-2">
                <Button onClick={handleCommit} disabled={parsed.missingColumns.length > 0 || matchedCount === 0}>
                  Process & import {matchedCount > 0 ? `${matchedCount} rows` : ""}
                </Button>
                <Button variant="outline" onClick={reset}>Cancel</Button>
              </div>
              {matchedCount === 0 && parsed.rows.length > 0 && (
                <p className="text-xs text-muted-foreground">No rows can be imported — create at least one restaurant above to proceed.</p>
              )}
            </div>
          )}

          {step === "processing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Importing rows, storing source file & running anomaly detection…</div>
              <Progress value={progress} />
            </div>
          )}

          {step === "done" && summary && (
            <div className="space-y-3">
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Import complete</AlertTitle>
                <AlertDescription className="text-xs">
                  Matched {summary.matched} rows · {summary.unmatched.length} unmatched restaurants{summary.alerts ? ` · ${summary.alerts} anomalies detected` : ""}
                  {summary.storagePath ? " · Source file stored" : ""}
                </AlertDescription>
              </Alert>
              {summary.unmatched.length > 0 && (
                <Alert>
                  <AlertTitle>Skipped restaurants</AlertTitle>
                  <AlertDescription className="text-xs">{summary.unmatched.join(", ")}.</AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button onClick={() => navigate({ to: "/dashboard" })}>Go to dashboard</Button>
                <Button variant="outline" onClick={reset}>Upload another</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Expected columns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1">
            {REQUIRED_CSV_COLUMNS.map((c) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}