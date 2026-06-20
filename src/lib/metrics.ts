export type MetricKey =
  | "sales"
  | "delivered_orders"
  | "average_order_value"
  | "impressions"
  | "menu_to_order"
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
  | "effective_discount";

export type MetricFormat = "currency" | "number" | "percent" | "multiplier";
export type MetricGroup = "sales" | "funnel" | "marketing";

export interface MetricDef {
  key: MetricKey;
  label: string;
  group: MetricGroup;
  format: MetricFormat;
  higherIsBetter: boolean;
  csvColumn: string;
}

export const METRICS: MetricDef[] = [
  { key: "sales", label: "Sales", group: "sales", format: "currency", higherIsBetter: true, csvColumn: "Sales" },
  { key: "delivered_orders", label: "Delivered Orders", group: "sales", format: "number", higherIsBetter: true, csvColumn: "Delivered Orders" },
  { key: "average_order_value", label: "Average Order Value", group: "sales", format: "currency", higherIsBetter: true, csvColumn: "Average Order Value" },
  { key: "impressions", label: "Impressions", group: "funnel", format: "number", higherIsBetter: true, csvColumn: "Impressions" },
  { key: "menu_to_order", label: "Menu to Order", group: "funnel", format: "percent", higherIsBetter: true, csvColumn: "Menu to Order" },
  { key: "menu_to_cart", label: "Menu to Cart", group: "funnel", format: "percent", higherIsBetter: true, csvColumn: "Menu to Cart" },
  { key: "cart_to_order", label: "Cart to Order", group: "funnel", format: "percent", higherIsBetter: true, csvColumn: "Cart to Order" },
  { key: "sales_from_ads", label: "Sales from Ads", group: "marketing", format: "currency", higherIsBetter: true, csvColumn: "Sales from Ads" },
  { key: "ad_ctr", label: "Ad Click Through Rate", group: "marketing", format: "percent", higherIsBetter: true, csvColumn: "Ad Click Through Rate" },
  { key: "ads_orders", label: "Ads Orders", group: "marketing", format: "number", higherIsBetter: true, csvColumn: "Ads Orders" },
  { key: "ads_impressions", label: "Ads Impressions", group: "marketing", format: "number", higherIsBetter: true, csvColumn: "Ads Impressions" },
  { key: "ads_spend", label: "Ads Spend", group: "marketing", format: "currency", higherIsBetter: false, csvColumn: "Ads Spend" },
  { key: "ads_roi", label: "Ads Return on Investment", group: "marketing", format: "multiplier", higherIsBetter: true, csvColumn: "Ads Return on Investment" },
  { key: "gross_sales_from_offers", label: "Gross Sales from Offers", group: "marketing", format: "currency", higherIsBetter: true, csvColumn: "Gross Sales from Offers" },
  { key: "orders_with_offers", label: "Orders With Offers", group: "marketing", format: "number", higherIsBetter: true, csvColumn: "Orders With Offers" },
  { key: "discount_given", label: "Discount Given", group: "marketing", format: "currency", higherIsBetter: false, csvColumn: "Discount Given" },
  { key: "effective_discount", label: "Effective Discount", group: "marketing", format: "percent", higherIsBetter: false, csvColumn: "Effective Discount" },
];

export const METRIC_BY_KEY = Object.fromEntries(METRICS.map((m) => [m.key, m])) as Record<MetricKey, MetricDef>;

export const REQUIRED_CSV_COLUMNS = ["Restaurant", "Date", ...METRICS.map((m) => m.csvColumn)];

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
  const out = emptyMetrics() as Record<MetricKey, number>;
  rows.forEach((r) => METRICS.forEach((m) => { out[m.key] += Number(r[m.key] || 0); }));
  // Recalc derived averages
  if (out.delivered_orders > 0) out.average_order_value = out.sales / out.delivered_orders;
  if (out.ads_spend > 0) out.ads_roi = out.sales_from_ads / out.ads_spend;
  if (rows.length > 0) {
    out.menu_to_order = avg(rows, "menu_to_order");
    out.menu_to_cart = avg(rows, "menu_to_cart");
    out.cart_to_order = avg(rows, "cart_to_order");
    out.ad_ctr = avg(rows, "ad_ctr");
    out.effective_discount = avg(rows, "effective_discount");
  }
  return out;
}

function avg<T extends Record<string, any>>(rows: T[], key: string) {
  const vals = rows.map((r) => Number(r[key] || 0));
  return vals.reduce((a, b) => a + b, 0) / Math.max(vals.length, 1);
}