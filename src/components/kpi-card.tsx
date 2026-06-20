import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string;
  previousValue?: string;
  pctChange?: number;
  higherIsBetter?: boolean;
  hint?: string;
}

export function KpiCard({ label, value, previousValue, pctChange, higherIsBetter = true, hint }: KpiCardProps) {
  const hasDelta = typeof pctChange === "number" && isFinite(pctChange);
  const positive = (pctChange ?? 0) > 0;
  const good = hasDelta ? (higherIsBetter ? positive : !positive) : true;
  const Icon = !hasDelta || Math.abs(pctChange!) < 0.1 ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="gap-2">
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {hasDelta ? (
            <Badge
              variant="outline"
              className={cn(
                "gap-1 border-transparent",
                good ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
              )}
            >
              <Icon className="h-3 w-3" />
              {Math.abs(pctChange!).toFixed(1)}%
            </Badge>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
          {previousValue && <span>prev {previousValue}</span>}
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}