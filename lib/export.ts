import * as XLSX from "xlsx";
import { buildWeekly, addBalances } from "./cashflow";
import { isoWeek, convertToUSD } from "./format";
import { CAT_LABELS } from "./constants";
import type { Transaction, ManualEntry, FxRates } from "./types";

export function exportWeeklyExtract(
  activeTxns:    Transaction[],
  entity:        string,
  fxRates:       FxRates,
  manualEntries: ManualEntry[],
): void {
  const sub =
    entity === "Consolidated"
      ? activeTxns.filter(t => t.cat !== "fx_conversion")
      : activeTxns.filter(t => t.entity === entity && t.cat !== "fx_conversion");

  const allWeeks = [...new Set(sub.map(t => t.week))].sort();

  // 12 future Mondays
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const dow = today.getDay() || 7;
  const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - (dow - 1));
  const futureWeeks = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(thisMonday); d.setDate(thisMonday.getDate() + (i + 1) * 7);
    return d.toISOString().slice(0, 10);
  });

  const histRows = addBalances(buildWeekly(sub, entity, allWeeks), 0);
  const lastBal  = histRows.length ? histRows[histRows.length - 1].closing_bal : 0;
  const last8    = histRows.slice(-8);
  const avgWeeklyCashflow = last8.length ? last8.reduce((s, r) => s + r.net, 0) / last8.length : 0;

  const manSub = manualEntries.filter(e => entity === "Consolidated" ? true : e.entity === entity);
  const manByWeek: Record<string, number> = {};
  futureWeeks.forEach(wk => {
    const ym = wk.slice(0, 7);
    manByWeek[wk] = manSub.filter(e => e.month === ym).reduce((s, e) => s + (e.amount || 0) / 4.33, 0);
  });

  let bal = lastBal;
  const forecastRows = futureWeeks.map((wk, i) => {
    const weekEnd = new Date(wk); weekEnd.setDate(weekEnd.getDate() + 6);
    const projected = parseFloat((avgWeeklyCashflow + (manByWeek[wk] || 0)).toFixed(2));
    bal = parseFloat((bal + projected).toFixed(2));
    return { week: wk, weekEnd: weekEnd.toISOString().slice(0, 10), projected, balance: bal };
  });

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const fmtNum  = (v: number | null | undefined) => v == null ? "" : Math.round(v);

  const wb = XLSX.utils.book_new();

  const addSheet = (name: string, header: string[], rows: (string | number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws["!cols"] = header.map(h => ({ wch: Math.max(h.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("Actual Weekly", [
    "Week","Week Start","Week End","ISO Week",
    "Financing In","Grants","Salary","Operating Out","Bank Charges","Intercompany",
    "Net Cash Flow (USD)","Opening Balance (USD)","Closing Balance (USD)",
  ], histRows.map(r => {
    const we = new Date(r.week); we.setDate(we.getDate() + 6);
    return [
      `W${isoWeek(r.week)}`, fmtDate(r.week), fmtDate(we.toISOString().slice(0, 10)), isoWeek(r.week),
      fmtNum(r.cats.financing_in), fmtNum(r.cats.grant), fmtNum(r.cats.salary),
      fmtNum((r.cats.operating_out||0)+(r.cats.op_rd||0)+(r.cats.op_professional||0)+(r.cats.op_regulatory||0)+(r.cats.op_office||0)+(r.cats.op_it||0)+(r.cats.op_travel||0)),
      fmtNum(r.cats.bank_charges), fmtNum(r.cats.intercompany),
      fmtNum(r.net), fmtNum(r.opening_bal), fmtNum(r.closing_bal),
    ];
  }));

  addSheet("12-Week Projection", [
    "Week","Week Start","Week End","ISO Week",
    "Projected Net Cash Flow (USD)","Projected Closing Balance (USD)","Notes",
  ], forecastRows.map((r, i) => [
    `W${isoWeek(r.week)}`, fmtDate(r.week), fmtDate(r.weekEnd), isoWeek(r.week),
    fmtNum(r.projected), fmtNum(r.balance),
    i === 0 ? `Avg weekly CF: ${fmtNum(avgWeeklyCashflow)} USD · Starting balance: ${fmtNum(lastBal)} USD` : "",
  ]));

  addSheet("Transaction Detail", [
    "Date","Week","Entity","Description","Category","Currency","Amount (Native)","Amount (USD)","Source File",
  ], sub.sort((a, b) => a.date.localeCompare(b.date)).map(t => [
    t.date, `W${isoWeek(t.week)}`, t.entity, t.details || t.contra || "—",
    CAT_LABELS[t.cat] || t.cat, t.currency || "USD",
    fmtNum(t.net), fmtNum(t.netUSD ?? convertToUSD(t.net, t.currency, fxRates)),
    t.sourceFile || "",
  ]));

  const summaryWs = XLSX.utils.aoa_to_sheet([
    ["Powerhouse CashFlow — Weekly Cash Extract"],
    ["Generated", new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })],
    ["Entity", entity], ["Reporting Currency", "USD"], [""],
    ["ACTUAL PERIOD"],
    ["Weeks of data", histRows.length],
    ["First week", histRows.length ? fmtDate(histRows[0].week) : "—"],
    ["Last week",  histRows.length ? fmtDate(histRows[histRows.length-1].week) : "—"],
    ["Closing balance (last actual week)", fmtNum(lastBal)], [""],
    ["PROJECTION BASIS"],
    ["Average weekly net cashflow (last 8 weeks)", fmtNum(avgWeeklyCashflow)],
    ["Manual forecast entries applied", manSub.length], [""],
    ["12-WEEK OUTLOOK"],
    ["Projected balance in 12 weeks", fmtNum(forecastRows[forecastRows.length-1]?.balance)],
    ["Best week projected net",  fmtNum(Math.max(...forecastRows.map(r => r.projected)))],
    ["Worst week projected net", fmtNum(Math.min(...forecastRows.map(r => r.projected)))],
  ]);
  summaryWs["!cols"] = [{ wch: 45 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

  const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const entTag  = entity.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
  XLSX.writeFile(wb, `CorNeat_Flow_Weekly_Extract_${entTag}_${dateTag}.xlsx`);
}
