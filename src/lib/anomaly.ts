import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Severity = Database["public"]["Enums"]["alert_severity"];

interface Rule {
  metric: string;
  label: string;
  higherIsBetter: boolean;
  warningPct: number;
  criticalPct: number;
}

const RULES: Rule[] = [
  { metric: "sales", label: "Sales", higherIsBetter: true, warningPct: 20, criticalPct: 30 },
  { metric: "delivered_orders", label: "Orders", higherIsBetter: true, warningPct: 20, criticalPct: 30 },
  { metric: "impressions", label: "Impressions", higherIsBetter: true, warningPct: 30, criticalPct: 50 },
  { metric: "ads_roi", label: "ROI", higherIsBetter: true, warningPct: 25, criticalPct: 40 },
  { metric: "menu_to_order", label: "Menu→Order", higherIsBetter: true, warningPct: 15, criticalPct: 25 },
  { metric: "cart_to_order", label: "Cart→Order", higherIsBetter: true, warningPct: 15, criticalPct: 25 },
];

export async function detectAnomaliesForRestaurant(restaurantId: string, restaurantName: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data: rows } = await supabase
    .from("daily_metrics")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  if (!rows || rows.length < 2) return [];

  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const alerts: Array<{
    restaurant_id: string;
    metric_name: string;
    severity: Severity;
    current_value: number;
    previous_value: number;
    pct_change: number;
    message: string;
  }> = [];

  for (const rule of RULES) {
    const cur = Number((last as any)[rule.metric] ?? 0);
    const pre = Number((prev as any)[rule.metric] ?? 0);
    if (pre === 0) continue;
    const pct = ((cur - pre) / pre) * 100;
    const drop = rule.higherIsBetter ? -pct : pct;
    if (drop >= rule.criticalPct) {
      alerts.push({
        restaurant_id: restaurantId,
        metric_name: rule.metric,
        severity: "critical",
        current_value: cur,
        previous_value: pre,
        pct_change: pct,
        message: `${restaurantName}: ${rule.label} ${pct < 0 ? "down" : "up"} ${Math.abs(pct).toFixed(1)}% vs previous day`,
      });
    } else if (drop >= rule.warningPct) {
      alerts.push({
        restaurant_id: restaurantId,
        metric_name: rule.metric,
        severity: "warning",
        current_value: cur,
        previous_value: pre,
        pct_change: pct,
        message: `${restaurantName}: ${rule.label} ${pct < 0 ? "down" : "up"} ${Math.abs(pct).toFixed(1)}% vs previous day`,
      });
    }
  }

  if (alerts.length > 0) {
    await supabase.from("alerts").insert(alerts as never);
  }
  return alerts;
}

export async function detectAnomaliesAll() {
  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, display_name")
    .eq("is_archived", false);
  if (!restaurants) return 0;
  let total = 0;
  for (const r of restaurants) {
    const a = await detectAnomaliesForRestaurant(r.id, r.display_name);
    total += a.length;
  }
  return total;
}