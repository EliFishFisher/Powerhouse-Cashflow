import { CAT_LABELS } from "./constants";
import type { Category } from "./constants";
import type { Transaction, ReconIssue, ReconStatus } from "./types";
import { fmt, weekLabel } from "./format";
import { suggestCategory } from "./classify";
import { buildWeekly, addBalances } from "./cashflow";

export function runReconciliation(
  transactions: Transaction[],
  excluded:     Set<string>,
  catOverrides: Record<string, Category>,
): ReconIssue[] {
  const issues: ReconIssue[] = [];
  let idSeq = 0;
  const newId = () => `rc_${idSeq++}`;
  const effCat = (t: Transaction): Category => catOverrides[t.uid] || t.cat;
  const active = transactions.filter(t => !excluded.has(t.uid));

  // ── CHECK 1: Uncategorized ────────────────────────────────────────────────
  active.filter(t => effCat(t) === "other").forEach(t => {
    const suggested = suggestCategory(t);
    issues.push({
      id: newId(), type: "uncategorized", severity: "warning",
      title: "Uncategorized transaction",
      description: `"${t.details || t.account}" (${t.date}, ${t.entity}) is categorized as Other and will not appear in any cashflow line.`,
      transactions: [t.uid],
      fix: { type: "reclassify", uid: t.uid, cat: suggested || "operating_out" },
      fixLabel: suggested ? `Reclassify → ${CAT_LABELS[suggested] || suggested}` : "Reclassify → Operating Payments",
      adjustmentAdvice: `Review the description "${t.details || t.account}" and assign the correct category.`,
      suggestedAdjCat: suggested || "operating_out",
      suggestedAdjDesc: null, suggestedAdjAmount: null,
    });
  });

  // ── CHECK 2: Possible FX conversions ─────────────────────────────────────
  active.filter(t => {
    if (effCat(t) === "fx_conversion") return false;
    const text = `${t.details} ${t.contra} ${t.account}`.toLowerCase();
    return text.includes("conversion") || text.includes("פועלים $") ||
           text.includes("פועלים euro") || text.includes("פועלים gbp");
  }).forEach(t => {
    issues.push({
      id: newId(), type: "fx_in_net", severity: "warning",
      title: "Possible FX conversion in net cash flow",
      description: `"${t.details || t.account}" (${t.date}, ${fmt(t.net)} USD) looks like a currency conversion but is counted in cash flow.`,
      transactions: [t.uid],
      fix: { type: "reclassify", uid: t.uid, cat: "fx_conversion" },
      fixLabel: "Reclassify → FX Conversion (excluded from net)",
      adjustmentAdvice: `FX conversions are internal transfers. Click ⚡ to remove from net cash flow.`,
      suggestedAdjCat: "bank_charges",
      suggestedAdjDesc: `FX cost adjustment for ${t.details}`,
      suggestedAdjAmount: null,
    });
  });

  // ── CHECK 3: Intercompany imbalance ───────────────────────────────────────
  const icTxns = active.filter(t => effCat(t) === "intercompany");
  const icByWeek: Record<string, { out: number; in: number; txns: string[] }> = {};
  icTxns.forEach(t => {
    if (!icByWeek[t.week]) icByWeek[t.week] = { out: 0, in: 0, txns: [] };
    if (t.net < 0) icByWeek[t.week].out += t.net;
    else            icByWeek[t.week].in  += t.net;
    icByWeek[t.week].txns.push(t.uid);
  });
  Object.entries(icByWeek).forEach(([week, { out, in: inAmt, txns }]) => {
    const diff = Math.abs(Math.abs(out) - inAmt);
    if (diff > 1) {
      issues.push({
        id: newId(), type: "intercompany_mismatch", severity: "error",
        title: `Intercompany imbalance — week of ${weekLabel(week)}`,
        description: `Intercompany outflows total ${fmt(out)} but inflows total ${fmt(inAmt)}. Gap: ${fmt(diff)} USD.`,
        transactions: txns,
        fix: null,
        fixLabel: "Review in Transactions tab",
        adjustmentAdvice: `A transfer record is likely missing on one side.`,
        suggestedAdjCat: "intercompany",
        suggestedAdjDesc: `Intercompany balancing entry — week of ${weekLabel(week)}`,
        suggestedAdjAmount: diff,
      });
    }
  });

  // ── CHECK 4: Probable duplicates ──────────────────────────────────────────
  const seen = new Map<string, Transaction>();
  const flaggedDupes = new Set<string>();
  active.forEach(t => {
    const key = `${t.entity}|${t.week}|${Math.abs(t.net).toFixed(2)}`;
    if (!seen.has(key)) { seen.set(key, t); return; }
    const other = seen.get(key)!;
    if (other.uid !== t.uid && !flaggedDupes.has(other.uid) && !flaggedDupes.has(t.uid)) {
      flaggedDupes.add(t.uid);
      issues.push({
        id: newId(), type: "duplicate", severity: "warning",
        title: "Possible duplicate transaction",
        description: `Two transactions in the same week with the same amount (${fmt(t.net)} USD) for ${t.entity}: "${other.details}" (${other.date}) and "${t.details}" (${t.date}).`,
        transactions: [other.uid, t.uid],
        fix: { type: "exclude", uid: t.uid },
        fixLabel: "Exclude the newer entry",
        adjustmentAdvice: `Compare the two entries. If they are the same transaction loaded twice, click ⚡ to exclude the duplicate.`,
        suggestedAdjCat: null, suggestedAdjDesc: null, suggestedAdjAmount: null,
      });
    }
  });

  // ── CHECK 5: Zero-net transactions ────────────────────────────────────────
  active.filter(t => t.net === 0 && t.debit > 0 && t.credit > 0).forEach(t => {
    issues.push({
      id: newId(), type: "zero_net", severity: "info" as const,
      title: "Zero-net transaction (offsetting debit/credit)",
      description: `"${t.details || t.account}" (${t.date}, ${t.entity}) has both debit and credit of ${fmt(t.debit)} that cancel out.`,
      transactions: [t.uid],
      fix: { type: "reclassify", uid: t.uid, cat: "fx_conversion" },
      fixLabel: "Mark as non-cash (exclude from net)",
      adjustmentAdvice: `Likely a journal reversal or same-day transfer. Mark as FX Conversion to exclude from net.`,
      suggestedAdjCat: null, suggestedAdjDesc: null, suggestedAdjAmount: null,
    });
  });

  // ── CHECK 6: Balance continuity ───────────────────────────────────────────
  const allWeeks = [...new Set(active.map(t => t.week))].sort();
  ["Corneat", "Holmes Place PT", "Orange Space", "Tribute Brands"].forEach(ent => {
    const rows = addBalances(buildWeekly(active, ent, allWeeks), 0);
    rows.forEach((r, i) => {
      if (i > 0 && Math.abs(rows[i].opening_bal - rows[i - 1].closing_bal) > 0.5) {
        const gap = parseFloat((rows[i].opening_bal - rows[i - 1].closing_bal).toFixed(2));
        issues.push({
          id: newId(), type: "balance_break", severity: "error",
          title: `Balance continuity break — ${ent}`,
          description: `Week of ${weekLabel(r.week)}: opening ${fmt(r.opening_bal)} does not match prior closing ${fmt(rows[i - 1].closing_bal)}. Gap: ${fmt(Math.abs(gap))} USD.`,
          transactions: [],
          fix: null,
          fixLabel: "Check for missing data",
          adjustmentAdvice: `A bank statement file may be missing. Upload the missing extract or create an adjustment of ${fmt(gap)} USD.`,
          suggestedAdjCat: "other",
          suggestedAdjDesc: `Balance continuity adjustment — ${ent}`,
          suggestedAdjAmount: gap,
        });
      }
    });
  });

  return issues;
}

export function makeEmptyReconStatus(): ReconStatus {
  return { lastRun: null, errorCount: 0, warningCount: 0, issues: [] };
}
