import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload as UploadIcon, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { parseCsv, commitImport, type ParseResult } from "@/lib/csv-process";
import { detectAnomaliesAll } from "@/lib/anomaly";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { REQUIRED_CSV_COLUMNS } from "@/lib/metrics";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
  head: () => ({ meta: [{ title: "Upload — Kread Insights" }] }),
});

function UploadPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [step, setStep] = useState<"select" | "validate" | "preview" | "processing" | "done">("select");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!loading && !isAdmin) {
    return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Admin access required</AlertTitle><AlertDescription>Only admins can upload data.</AlertDescription></Alert>;
  }

  const handleFile = async (f: File) => {
    setFile(f);
    setStep("validate");
    const result = await parseCsv(f);
    setParsed(result);
    setStep("preview");
  };

  const handleCommit = async () => {
    if (!parsed || !file) return;
    setStep("processing");
    setProgress(25);
    try {
      const res = await commitImport(parsed, file.name, file.size);
      setProgress(70);
      await logAudit("file_uploaded", "file", res.fileId, { matched: res.matched, file_name: file.name });
      setProgress(85);
      const alertsCount = await detectAnomaliesAll();
      setProgress(100);
      setSummary({ ...res, alerts: alertsCount });
      setStep("done");
      toast.success(`Imported ${res.matched} rows${alertsCount ? ` · ${alertsCount} anomalies detected` : ""}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload Data</h1>
        <p className="text-sm text-muted-foreground">Process Zomato CSV reports into the analytics dataset.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {(["select","validate","preview","processing","done"] as const).map((s, i, arr) => (
          <div key={s} className={`rounded-md border p-3 text-xs ${step === s ? "border-primary bg-primary/5" : "text-muted-foreground"}`}>
            <div className="font-medium capitalize">{i + 1}. {s === "select" ? "Upload" : s === "validate" ? "Validate" : s === "preview" ? "Preview" : s === "processing" ? "Process" : "Confirm"}</div>
          </div>
        )).slice(0,4)}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV File</CardTitle>
          <CardDescription>Required columns: Restaurant, Date, and all metric columns.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "select" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center"
            >
              <UploadIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm">Drag and drop a CSV file, or</p>
              <Button onClick={() => inputRef.current?.click()}>Select file</Button>
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
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
              </div>
              {parsed.missingColumns.length > 0 && (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Missing columns</AlertTitle><AlertDescription className="text-xs">{parsed.missingColumns.join(", ")}</AlertDescription></Alert>
              )}
              {parsed.warnings.length > 0 && (
                <Alert><AlertTitle>{parsed.warnings.length} warnings</AlertTitle><AlertDescription className="max-h-32 overflow-auto text-xs">{parsed.warnings.slice(0, 10).join(" · ")}{parsed.warnings.length > 10 && ` … +${parsed.warnings.length - 10} more`}</AlertDescription></Alert>
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
                <Button onClick={handleCommit} disabled={parsed.missingColumns.length > 0 || parsed.rows.length === 0}>Process & import</Button>
                <Button variant="outline" onClick={reset}>Cancel</Button>
              </div>
              <p className="text-xs text-muted-foreground">Restaurants must already exist in the system (Admin → Manage Restaurants). Unmatched rows will be skipped.</p>
            </div>
          )}

          {step === "processing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Importing rows & running anomaly detection…</div>
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
                </AlertDescription>
              </Alert>
              {summary.unmatched.length > 0 && (
                <Alert>
                  <AlertTitle>Unmatched restaurants</AlertTitle>
                  <AlertDescription className="text-xs">{summary.unmatched.join(", ")}. Add them in Admin → Manage Restaurants and re-upload.</AlertDescription>
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
          <CardTitle className="text-sm">Expected CSV columns</CardTitle>
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