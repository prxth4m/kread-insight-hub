import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload as UploadIcon, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { parseFile, commitImport, type ParseResult, type CommitResult } from "@/lib/csv-process";
import { detectAnomaliesAll } from "@/lib/anomaly";
import { logAudit } from "@/lib/audit";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
  head: () => ({ meta: [{ title: "Upload — Kread Insights" }] }),
});

const ACCEPT = ".csv,.xls,.xlsx";

function UploadPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [step, setStep] = useState<"select" | "validate" | "preview" | "processing" | "done">("select");
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<(CommitResult & { alerts?: number }) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: knownZomatoIds = [] } = useQuery({
    queryKey: ["upload-known-zomato-ids"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("zomato_id");
      return (data ?? []).map((r) => r.zomato_id).filter((v): v is string => !!v);
    },
  });

  const knownSet = useMemo(() => new Set(knownZomatoIds), [knownZomatoIds]);

  const restaurantBreakdown = useMemo(() => {
    if (!parsed) return { known: 0, toCreate: 0 };
    let known = 0, toCreate = 0;
    for (const zid of parsed.uniqueRestaurantIds) {
      if (knownSet.has(zid)) known++;
      else toCreate++;
    }
    return { known, toCreate };
  }, [parsed, knownSet]);

  if (!loading && !isAdmin) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Admin access required</AlertTitle>
        <AlertDescription>Only admins can upload data.</AlertDescription>
      </Alert>
    );
  }

  const handleFile = async (f: File) => {
    setFile(f);
    setStep("validate");
    const result = await parseFile(f);
    setParsed(result);
    setStep("preview");
  };

  const handleCommit = async () => {
    if (!parsed || !file) return;
    setStep("processing");
    setProgress(20);
    try {
      const res = await commitImport(parsed, file);
      setProgress(70);
      await logAudit("file_uploaded", "file", res.fileId, {
        matched: res.matched,
        auto_created: res.autoCreated,
        file_name: file.name,
      });
      setProgress(85);
      const alertsCount = await detectAnomaliesAll();
      setProgress(100);
      setSummary({ ...res, alerts: alertsCount });
      setStep("done");
      toast.success(
        `Imported ${res.matched} rows${res.autoCreated ? ` · ${res.autoCreated} auto-created` : ""}${alertsCount ? ` · ${alertsCount} anomalies` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["compare"] });
      qc.invalidateQueries({ queryKey: ["compare-ranges"] });
      qc.invalidateQueries({ queryKey: ["compare-restaurants"] });
      qc.invalidateQueries({ queryKey: ["restaurants"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["admin-restaurants"] });
      qc.invalidateQueries({ queryKey: ["upload-known-zomato-ids"] });
    } catch (e) {
      console.error("[Upload] Import failed:", e);
      const msg =
        e instanceof Error
          ? [e.message, (e as any).details, (e as any).hint].filter(Boolean).join(" — ")
          : "Import failed";
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

  const canImport = !!parsed && parsed.errors.length === 0 && parsed.rows.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload Data</h1>
        <p className="text-sm text-muted-foreground">Import Zomato daily reports (CSV or Excel) into the analytics dataset.</p>
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
          <CardDescription>
            Accepts Zomato daily report exports (.csv or .xlsx). Restaurant ID, date columns, and metric rows are auto-detected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === "select" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center"
            >
              <UploadIcon className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm">Drag and drop a CSV or Excel file, or</p>
              <Button onClick={() => inputRef.current?.click()}>Select file</Button>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <p className="text-xs text-muted-foreground">Long-format reports are pivoted automatically. Unknown restaurants are created on the fly using their Zomato ID.</p>
            </div>
          )}

          {step === "validate" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Parsing & pivoting…
            </div>
          )}

          {step === "preview" && parsed && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" /> {file?.name}</Badge>
                <Badge variant="secondary">{parsed.totalRows} source rows</Badge>
                <Badge variant="secondary">{parsed.rows.length} pivoted records</Badge>
                <Badge variant="secondary">{parsed.dateCount} date columns</Badge>
                <Badge variant="secondary">{parsed.uniqueRestaurantIds.length} restaurants</Badge>
              </div>

              {parsed.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Parse error</AlertTitle>
                  <AlertDescription className="text-xs">{parsed.errors.join(" · ")}</AlertDescription>
                </Alert>
              )}

              {parsed.errors.length === 0 && parsed.uniqueRestaurantIds.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{restaurantBreakdown.known}</span> restaurants already known ·{" "}
                  <span className="font-medium text-foreground">{restaurantBreakdown.toCreate}</span> will be auto-created
                </p>
              )}

              {Object.keys(parsed.overviewCounts).length > 0 && (
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Data points by overview group</CardTitle>
                    <CardDescription className="text-xs">Verify each section of the report was detected correctly.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(parsed.overviewCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([group, count]) => (
                          <Badge key={group} variant="outline" className="text-xs">
                            {group}: <span className="ml-1 font-semibold tabular-nums">{count}</span>
                          </Badge>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Re-uploading data for dates already in the system is safe.
                      Existing records are updated in place — values are never doubled.
                    </p>
                  </CardContent>
                </Card>
              )}

              {parsed.warnings.length > 0 && (
                <Alert>
                  <AlertTitle>{parsed.warnings.length} warnings</AlertTitle>
                  <AlertDescription className="max-h-32 overflow-auto text-xs">
                    {parsed.warnings.slice(0, 10).join(" · ")}
                    {parsed.warnings.length > 10 && ` … +${parsed.warnings.length - 10} more`}
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button onClick={handleCommit} disabled={!canImport}>
                  Process & import {parsed.rows.length > 0 ? `${parsed.rows.length} records` : ""}
                </Button>
                <Button variant="outline" onClick={reset}>Cancel</Button>
              </div>
            </div>
          )}

          {step === "processing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Auto-creating restaurants, upserting metrics & running anomaly detection…
              </div>
              <Progress value={progress} />
            </div>
          )}

          {step === "done" && summary && (
            <div className="space-y-3">
              {summary.isDuplicate && (
                <Alert variant="default" className="border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-800">Possible duplicate upload</AlertTitle>
                  <AlertDescription className="text-amber-700">
                    A file with the same name covering {summary.dateRange.from} → {summary.dateRange.to} was
                    previously imported. Your data has been safely merged — existing values were updated and no
                    duplicates were created.
                  </AlertDescription>
                </Alert>
              )}
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Import complete</AlertTitle>
                <AlertDescription className="text-xs">
                  Imported {summary.matched} rows
                  {summary.autoCreated ? ` · ${summary.autoCreated} restaurants auto-created` : ""}
                  {summary.alerts ? ` · ${summary.alerts} anomalies detected` : ""}
                  {summary.storagePath ? " · Source file stored" : ""}
                </AlertDescription>
              </Alert>
              {summary.autoCreated > 0 && (
                <Alert>
                  <AlertTitle>New restaurants</AlertTitle>
                  <AlertDescription className="text-xs">{summary.autoCreatedNames.join(", ")}</AlertDescription>
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
    </div>
  );
}