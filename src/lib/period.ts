export type PeriodMode = "daily" | "weekly" | "monthly";

export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function shiftDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // Monday=0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfWeek(date: Date) {
  const s = startOfWeek(date);
  return shiftDays(s, 6);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function getPeriodRange(mode: PeriodMode, refDate: Date): { start: Date; end: Date; label: string } {
  if (mode === "daily") {
    return { start: refDate, end: refDate, label: refDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) };
  }
  if (mode === "weekly") {
    const s = startOfWeek(refDate);
    const e = endOfWeek(refDate);
    return { start: s, end: e, label: `Week of ${s.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` };
  }
  const s = startOfMonth(refDate);
  const e = endOfMonth(refDate);
  return { start: s, end: e, label: s.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) };
}

export function getPreviousRange(mode: PeriodMode, refDate: Date) {
  if (mode === "daily") {
    const d = shiftDays(refDate, -1);
    return getPeriodRange("daily", d);
  }
  if (mode === "weekly") {
    const d = shiftDays(refDate, -7);
    return getPeriodRange("weekly", d);
  }
  const d = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
  return getPeriodRange("monthly", d);
}