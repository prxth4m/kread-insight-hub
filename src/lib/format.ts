export const formatINR = (v: number | null | undefined, opts?: { compact?: boolean }) => {
  if (v == null || isNaN(Number(v))) return "₹0";
  const n = Number(v);
  if (opts?.compact) {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
    if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  }
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
};

export const formatNumber = (v: number | null | undefined, opts?: { compact?: boolean }) => {
  if (v == null || isNaN(Number(v))) return "0";
  const n = Number(v);
  if (opts?.compact) {
    if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
    if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
    if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  }
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};

export const formatPct = (v: number | null | undefined, digits = 1) => {
  if (v == null || isNaN(Number(v))) return "0%";
  return `${Number(v).toFixed(digits)}%`;
};

export const formatMultiplier = (v: number | null | undefined) => {
  if (v == null || isNaN(Number(v))) return "0.0x";
  return `${Number(v).toFixed(2)}x`;
};

export const pctChange = (current: number, previous: number) => {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

export const formatDate = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatDateTime = (d: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};