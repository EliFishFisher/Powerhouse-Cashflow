import type { FxRates } from "./types";
import type { ViewPeriod } from "./constants";

// ─── NUMBER FORMATTING ────────────────────────────────────────────────────────
// rate: optional reporting-currency multiplier (1 = USD, 3.72 = ILS, etc.)
export function fmt(v: number | null | undefined, rate = 1): string {
  if (v === 0 || v == null) return "–";
  const converted = v * rate;
  const s =
    Math.abs(converted) >= 1000
      ? Math.abs(converted).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
      : Math.abs(converted).toFixed(2);
  return converted < 0 ? `(${s})` : s;
}

// ─── WEEK HELPERS ─────────────────────────────────────────────────────────────
export function weekLabel(w: string): string {
  const d = new Date(w);
  const end = new Date(w);
  end.setDate(end.getDate() + 6);
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
}

export function isoWeek(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00");
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const jan1Day = jan1.getDay() || 7;
  return Math.ceil((dayOfYear + jan1Day) / 7);
}

export function getWeekMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

// ─── PERIOD HELPERS ───────────────────────────────────────────────────────────
export function getPeriodKey(week: string, period: ViewPeriod): string {
  if (period === "weekly")    return week;
  if (period === "monthly")   return week.slice(0, 7);
  if (period === "quarterly") {
    const m = parseInt(week.slice(5, 7), 10);
    return `${week.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
  }
  return week.slice(0, 4); // yearly
}

export function periodLabel(key: string, period: ViewPeriod): string {
  if (period === "weekly")    return weekLabel(key);
  if (period === "monthly") {
    const [y, m] = key.split("-");
    return new Date(+y, +m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  }
  if (period === "quarterly") return key.replace("-", " ");
  return key;
}

// ─── FX CONVERSION ────────────────────────────────────────────────────────────
export function convertToUSD(amount: number, currency: string, rates: FxRates): number {
  if (!currency || currency === "USD") return amount;
  const key = currency.toUpperCase() === "NIS" ? "ILS" : currency.toUpperCase();
  const rate = rates[key];
  if (!rate) return amount;
  return amount / rate;
}
