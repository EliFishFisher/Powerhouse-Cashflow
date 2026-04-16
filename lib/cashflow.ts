import { getPeriodKey } from "./format";
import { reclassifyOp, applyRule } from "./classify";
import { convertToUSD } from "./format";
import type { Transaction, WeeklyRow, DerivedRow, FxRates, ClassificationRule } from "./types";
import type { Category, ViewPeriod } from "./constants";

// ─── ACTIVE TRANSACTIONS ──────────────────────────────────────────────────────
// Applies exclusions, category overrides, user rules, auto-reclassification,
// and FX conversion. This is the single source of truth for all tabs.
export function computeActiveTxns(
  transactions: Transaction[],
  adjustments:  Transaction[],
  excluded:     Set<string>,
  catOverrides: Record<string, Category>,
  rules:        ClassificationRule[],
  fxRates:      FxRates,
): Transaction[] {
  const all = [...transactions, ...adjustments];
  return all
    .filter(t => !excluded.has(t.uid))
    .map(t => {
      // 1. Manual override wins
      let cat: Category = catOverrides[t.uid] || null!;

      // 2. User-defined rules (first match, by priority order)
      if (!cat) {
        const sorted = [...rules]
          .filter(r => r.enabled !== false)
          .sort((a, b) => (a.priority || 0) - (b.priority || 0));
        const matched = sorted.find(r => applyRule(r, t));
        if (matched) cat = matched.cat;
      }

      // 3. Auto-upgrade operating_out → subcategory
      if (!cat) cat = reclassifyOp(t);

      // 4. Compute netUSD
      const netUSD = convertToUSD(t.net, t.currency, fxRates);

      return { ...t, cat, netUSD };
    });
}

// ─── BUILD WEEKLY ROWS ────────────────────────────────────────────────────────
export function buildWeekly(
  txns:   Transaction[],
  entity: string,
  weeks:  string[],
): Omit<WeeklyRow, "opening_bal" | "closing_bal">[] {
  const sub =
    entity === "Consolidated"
      ? txns.filter(t => t.cat !== "fx_conversion")
      : txns.filter(t => t.entity === entity && t.cat !== "fx_conversion");

  return weeks.map(w => {
    const wt = sub.filter(t => t.week === w);
    const sum = (cat: string) =>
      wt.filter(t => t.cat === cat).reduce((s, t) => s + (t.netUSD ?? t.net), 0);

    const cats: Record<string, number> = {
      financing_in:    sum("financing_in"),
      grant:           sum("grant"),
      salary:          sum("salary"),
      operating_out:   sum("operating_out"),
      op_rd:           sum("op_rd"),
      op_professional: sum("op_professional"),
      op_regulatory:   sum("op_regulatory"),
      op_rent:         sum("op_rent"),
      op_office:       sum("op_office"),
      op_it:           sum("op_it"),
      op_travel:       sum("op_travel"),
      bank_charges:    sum("bank_charges"),
      intercompany:    sum("intercompany"),
    };

    return { week: w, cats, net: Object.values(cats).reduce((s, v) => s + v, 0) };
  });
}

// ─── ADD RUNNING BALANCES ─────────────────────────────────────────────────────
export function addBalances(
  rows: Omit<WeeklyRow, "opening_bal" | "closing_bal">[],
  openingBal = 0,
): WeeklyRow[] {
  let bal = openingBal;
  return rows.map(r => {
    const open = bal;
    bal = parseFloat((bal + r.net).toFixed(2));
    return { ...r, opening_bal: parseFloat(open.toFixed(2)), closing_bal: bal };
  });
}

// ─── BUILD DERIVED ROWS (for cashflow table) ──────────────────────────────────
export function buildDerived(
  txns:   Transaction[],
  entity: string,
  weeks:  string[],
): DerivedRow[] {
  const rows = addBalances(buildWeekly(txns, entity, weeks), 0);
  return rows.map(r => {
    const ic = r.cats.intercompany;
    const d: Record<string, number> = {
      financing_in:     r.cats.financing_in    > 0 ? r.cats.financing_in    : 0,
      grant:            r.cats.grant           > 0 ? r.cats.grant           : 0,
      intercompany_in:  ic > 0 ? ic : 0,
      salary:           r.cats.salary          < 0 ? r.cats.salary          : 0,
      operating_out:    r.cats.operating_out   < 0 ? r.cats.operating_out   : 0,
      op_rd:            r.cats.op_rd           < 0 ? r.cats.op_rd           : 0,
      op_professional:  r.cats.op_professional < 0 ? r.cats.op_professional : 0,
      op_regulatory:    r.cats.op_regulatory   < 0 ? r.cats.op_regulatory   : 0,
      op_rent:          r.cats.op_rent         < 0 ? r.cats.op_rent         : 0,
      op_office:        r.cats.op_office       < 0 ? r.cats.op_office       : 0,
      op_it:            r.cats.op_it           < 0 ? r.cats.op_it           : 0,
      op_travel:        r.cats.op_travel       < 0 ? r.cats.op_travel       : 0,
      bank_charges:     r.cats.bank_charges    < 0 ? r.cats.bank_charges    : 0,
      intercompany_out: ic < 0 ? ic : 0,
    };
    const opSubTotal =
      d.op_rd + d.op_professional + d.op_regulatory +
      d.op_rent + d.op_office + d.op_it + d.op_travel;

    return {
      ...r,
      derived:   d,
      total_in:  d.financing_in + d.grant + d.intercompany_in,
      total_out: d.salary + d.operating_out + opSubTotal + d.bank_charges + d.intercompany_out,
    };
  });
}

// ─── GROUP DERIVED BY PERIOD ──────────────────────────────────────────────────
export function groupDerived(derived: DerivedRow[], period: ViewPeriod): DerivedRow[] {
  if (period === "weekly") return derived;

  const groups = new Map<string, { key: string; rows: DerivedRow[]; opening_bal: number }>();
  derived.forEach(row => {
    const k = getPeriodKey(row.week, period);
    if (!groups.has(k)) groups.set(k, { key: k, rows: [], opening_bal: row.opening_bal });
    groups.get(k)!.rows.push(row);
  });

  const DCATS = [
    "financing_in","grant","intercompany_in","salary","operating_out",
    "op_rd","op_professional","op_regulatory","op_rent","op_office","op_it","op_travel",
    "bank_charges","intercompany_out",
  ];

  return [...groups.values()].map(g => {
    const last = g.rows[g.rows.length - 1];
    const d: Record<string, number> = {};
    DCATS.forEach(c => {
      d[c] = g.rows.reduce((s, r) => s + (r.derived[c] || 0), 0);
    });
    return {
      week:        g.key,
      opening_bal: g.opening_bal,
      closing_bal: last.closing_bal,
      net:         g.rows.reduce((s, r) => s + r.net, 0),
      cats:        last.cats,
      derived:     d,
      total_in:    g.rows.reduce((s, r) => s + r.total_in,  0),
      total_out:   g.rows.reduce((s, r) => s + r.total_out, 0),
    };
  });
}

// ─── GROUP BANK BY PERIOD ─────────────────────────────────────────────────────
export function groupBank(
  bankDerived: WeeklyRow[],
  weekKeys:    string[],
  period:      ViewPeriod,
): WeeklyRow[] {
  if (period === "weekly") return bankDerived;

  const groups = new Map<string, { key: string; rows: WeeklyRow[]; opening_bal: number }>();
  bankDerived.forEach((row, i) => {
    const k = getPeriodKey(weekKeys[i] || row.week, period);
    if (!groups.has(k)) groups.set(k, { key: k, rows: [], opening_bal: row.opening_bal });
    groups.get(k)!.rows.push(row);
  });

  return [...groups.values()].map(g => {
    const last = g.rows[g.rows.length - 1];
    return {
      week:        g.key,
      cats:        last.cats,
      opening_bal: g.opening_bal,
      closing_bal: last.closing_bal,
      net:         g.rows.reduce((s, r) => s + r.net, 0),
    };
  });
}
