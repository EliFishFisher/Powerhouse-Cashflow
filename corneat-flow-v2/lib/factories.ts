import type { Transaction, ManualEntry, ClassificationRule } from "./types";
import type { Category } from "./constants";
import { getWeekMonday } from "./format";

// ─── ADJUSTMENT TRANSACTION ───────────────────────────────────────────────────
export function makeAdjustment({
  entity, date, description, amount, cat,
  createdBy = "user",
}: {
  entity:      string;
  date:        string;
  description: string;
  amount:      number;
  cat:         Category;
  createdBy?:  string;
}): Transaction {
  const uid = `adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const net = parseFloat(String(amount));
  return {
    uid, entity,
    date,
    week:        getWeekMonday(date),
    account:     "Manual Adjustment",
    details:     description,
    contra:      "",
    debit:       net > 0 ? net : 0,
    credit:      net < 0 ? Math.abs(net) : 0,
    net,
    cat,
    currency:    "USD",
    journalNo:   "",
    sourceFile:  "ADJUSTMENT",
    sourceSheet: "",
    isAdjustment: true,
    createdBy,
    createdAt:   new Date().toISOString(),
  };
}

// ─── MANUAL FORECAST ENTRY ────────────────────────────────────────────────────
export function makeManualEntry({
  entity, month, description, amount, cat,
  createdBy = "user",
}: {
  entity:      string;
  month:       string;
  description: string;
  amount:      number;
  cat:         Category;
  createdBy?:  string;
}): ManualEntry {
  return {
    uid:         `man_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    entity, month, description,
    amount:      parseFloat(String(amount)),
    cat,
    isManual:    true,
    createdBy,
    createdAt:   new Date().toISOString(),
  };
}

// ─── CLASSIFICATION RULE ─────────────────────────────────────────────────────
export function makeClassificationRule({
  label, keywords, cat, field = "any", enabled = true,
}: {
  label:    string;
  keywords: string[];
  cat:      Category;
  field?:   ClassificationRule["field"];
  enabled?: boolean;
}): ClassificationRule {
  const now = Date.now();
  return {
    uid:       `rule_${now}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    keywords,
    cat,
    field,
    enabled,
    priority:  now,
    createdAt: new Date().toISOString(),
  };
}
