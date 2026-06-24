export type MetricKey =
  | "sales"
  | "delivered_orders"
  | "average_order_value"
  | "impressions"
  | "impressions_to_menu"
  | "menu_to_cart"
  | "cart_to_order"
  | "sales_from_ads"
  | "ad_ctr"
  | "ads_orders"
  | "ads_impressions"
  | "ads_spend"
  | "ads_roi"
  | "gross_sales_from_offers"
  | "orders_with_offers"
  | "discount_given"
  | "effective_discount"
  | "market_share"
  | "average_rating"
  | "rated_orders"
  | "bad_orders"
  | "rejected_orders"
  | "kpt_delayed_orders"
  | "poor_rated_orders"
  | "total_complaints"
  | "lost_sales"
  | "online_pct"
  | "offline_hours"
  | "kpt_minutes"
  | "for_accuracy"
  | "menu_opens"
  | "cart_builds"
  | "placed_orders"
  | "new_user_orders"
  | "repeat_user_orders"
  | "lapsed_user_orders"
  | "lunch_orders"
  | "dinner_orders"
  | "snacks_orders"
  | "breakfast_orders"
  | "late_night_orders"
  | "ads_menu_opens"
  | "non_refunded_complaints"
  | "complaints_poor_packaging"
  | "complaints_poor_quality"
  | "complaints_wrong_order"
  | "complaints_missing_items"
  | "self_logs_other_ors";

export type MetricFormat = "currency" | "number" | "percent" | "multiplier";
export type MetricGroup = "sales" | "funnel" | "marketing";
export type MetricAggregation = "sum" | "avg" | "derived";

export interface MetricDef {
  key: MetricKey;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  higherIsBetter: boolean;
  csvColumn: string;
  derived?: boolean;
  aggregation?: MetricAggregation;
}

export const METRICS: MetricDef[] = [
  { key: "sales", label: "Sales", group: "sales", format: "currency", higherIsBetter: true, csvColumn: "Sales (Rs)" },
  { key: "delivered_orders", label: "Delivered Orders", group: "sales", format: "number", higherIsBetter: true, csvColumn: "Delivered orders" },
  { key: "average_order_value", label: "Average Order Value", group: "sales", format: "currency", higherIsBetter: true, csvColumn: "__derived_aov__", derived: true, aggregation: "derived" },
  { key: "market_share", label: "Market Share", group: "sales", format: "percent", higherIsBetter: true, csvColumn: "Market share (%)", aggregation: "avg" },
  { key: "average_rating", label: "Average Rating", group: "sales", format: "number", higherIsBetter: true, csvColumn: "Average rating", aggregation: "avg" },
  { key: "rated_orders", label: "Rated Orders", group: "sales", format: "number", higherIsBetter: true, csvColumn: "Rated orders" },
  { key: "bad_orders", label: "Bad Orders", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Bad orders" },
  { key: "rejected_orders", label: "Rejected Orders", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Rejected orders" },
  { key: "kpt_delayed_orders", label: "KPT+10 Delayed Orders", group: "sales", format: "number", higherIsBetter: false, csvColumn: "KPT+10 delayed orders" },
  { key: "poor_rated_orders", label: "Poor Rated Orders", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Poor rated orders" },
  { key: "total_complaints", label: "Total Complaints", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Total complaints" },
  { key: "non_refunded_complaints", label: "Non-refunded Complaints", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Non-refunded complaints" },
  { key: "complaints_poor_packaging", label: "Complaints - Poor Packaging", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Total complaints - Poor packaging" },
  { key: "complaints_poor_quality", label: "Complaints - Poor Quality", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Total complaints - Poor quality" },
  { key: "complaints_wrong_order", label: "Complaints - Wrong Order", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Total complaints - Wrong order" },
  { key: "complaints_missing_items", label: "Complaints - Missing Items", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Total complaints - Missing items" },
  { key: "self_logs_other_ors", label: "Self Logs (Other ORs)", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Self logs other ors" },
  { key: "lost_sales", label: "Lost Sales", group: "sales", format: "currency", higherIsBetter: false, csvColumn: "Lost sales (Rs)" },
  { key: "online_pct", label: "Online %", group: "sales", format: "percent", higherIsBetter: true, csvColumn: "Online %", aggregation: "avg" },
  { key: "offline_hours", label: "Offline Hours", group: "sales", format: "number", higherIsBetter: false, csvColumn: "Offline time (in hours)" },
  { key: "kpt_minutes", label: "KPT (minutes)", group: "sales", format: "number", higherIsBetter: false, csvColumn: "KPT (in minutes)", aggregation: "avg" },
  { key: "for_accuracy", label: "FOR Accuracy", group: "sales", format: "percent", higherIsBetter: true, csvColumn: "FOR accuracy (%)", aggregation: "avg" },
  { key: "impressions", label: "Impressions", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Impressions" },
  { key: "impressions_to_menu", label: "Impressions to Menu", group: "funnel", format: "percent", higherIsBetter: true, csvColumn: "Impressions to menu (%)", aggregation: "avg" },
  { key: "menu_to_cart", label: "Menu to Cart", group: "funnel", format: "percent", higherIsBetter: true, csvColumn: "Menu to cart (%)", aggregation: "avg" },
  { key: "cart_to_order", label: "Cart to Order", group: "funnel", format: "percent", higherIsBetter: true, csvColumn: "Cart to orders (%)", aggregation: "avg" },
  { key: "menu_opens", label: "Menu Opens", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Menu opens" },
  { key: "cart_builds", label: "Cart Builds", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Cart builds" },
  { key: "placed_orders", label: "Placed Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Placed Orders" },
  { key: "new_user_orders", label: "New User Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "New user orders" },
  { key: "repeat_user_orders", label: "Repeat User Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Repeat user orders" },
  { key: "lapsed_user_orders", label: "Lapsed User Orders", group: "funnel", format: "number", higherIsBetter: false, csvColumn: "Lapsed user orders" },
  { key: "lunch_orders", label: "Lunch Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Lunch orders" },
  { key: "dinner_orders", label: "Dinner Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Dinner orders" },
  { key: "snacks_orders", label: "Snacks Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Snacks orders" },
  { key: "breakfast_orders", label: "Breakfast Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Breakfast orders" },
  { key: "late_night_orders", label: "Late Night Orders", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Late night orders" },
  { key: "sales_from_ads", label: "Sales from Ads", group: "marketing", format: "currency", higherIsBetter: true, csvColumn: "Sales from ads (Rs)" },
  { key: "ad_ctr", label: "Ads CTR", group: "marketing", format: "percent", higherIsBetter: true, csvColumn: "Ads CTR (%)", aggregation: "avg" },
  { key: "ads_orders", label: "Ads Orders", group: "marketing", format: "number", higherIsBetter: true, csvColumn: "Ads orders" },
  { key: "ads_impressions", label: "Ads Impressions", group: "marketing", format: "number", higherIsBetter: true, csvColumn: "Ads impressions" },
  { key: "ads_spend", label: "Ads Spend", group: "marketing", format: "currency", higherIsBetter: false, csvColumn: "Ads spend (Rs)" },
  { key: "ads_roi", label: "Ads ROI", group: "marketing", format: "multiplier", higherIsBetter: true, csvColumn: "Ads ROI", aggregation: "derived" },
  { key: "ads_menu_opens", label: "Ads Menu Opens", group: "marketing", format: "number", higherIsBetter: true, csvColumn: "Ads menu opens" },
  { key: "gross_sales_from_offers", label: "Gross Sales from Offers", group: "marketing", format: "currency", higherIsBetter: true, csvColumn: "Gross sales from offers (Rs)" },
  { key: "orders_with_offers", label: "Orders With Offers", group: "marketing", format: "number", higherIsBetter: true, csvColumn: "Orders with offers" },
  { key: "discount_given", label: "Discount Given", group: "marketing", format: "currency", higherIsBetter: false, csvColumn: "Discount given (Rs)" },
  { key: "effective_discount", label: "Effective Discount", group: "marketing", format: "percent", higherIsBetter: false, csvColumn: "Effective discount (%)", aggregation: "avg" },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>;

export const CSV_METRIC_LOOKUP: Map<string, MetricKey> = new Map(
  METRICS.filter((m) => !m.derived).map((m) => [m.csvColumn, m.key]),
);

import { formatINR, formatNumber, formatPct, formatMultiplier } from "./format";

export function formatMetric(value: number | null | undefined, format: MetricFormat): string {
  switch (format) {
    case "currency": return formatINR(value, { compact: true });
    case "number": return formatNumber(value, { compact: true });
    case "percent": return formatPct(value);
    case "multiplier": return formatMultiplier(value);
  }
}

export function emptyMetrics() {
  const o: Record<string, number> = {};
  METRICS.forEach((m) => (o[m.key] = 0));
  return o;
}

export function sumMetrics<T extends Record<string, any>>(rows: T[]): Record<MetricKey, number> {
  if (rows.length === 0) return emptyMetrics() as Record<MetricKey, number>;
  const out = emptyMetrics() as Record<MetricKey, number>;
  const counts: Record<string, number> = {};

  rows.forEach((r) => {
    METRICS.forEach((m) => {
      if (m.aggregation === "derived") return;
      const v = Number(r[m.key] || 0);
      out[m.key] += v;
      if (m.aggregation === "avg") {
        counts[m.key] = (counts[m.key] ?? 0) + (v !== 0 ? 1 : 0);
      }
    });
  });

  METRICS.forEach((m) => {
    if (m.aggregation === "avg") {
      const n = counts[m.key] ?? 0;
      out[m.key] = n > 0 ? out[m.key] / n : 0;
    }
  });

  if (out.delivered_orders > 0) {
    out.average_order_value = out.sales / out.delivered_orders;
  }
  if (out.ads_spend > 0) {
    out.ads_roi = out.sales_from_ads / out.ads_spend;
  }

  return out;
}