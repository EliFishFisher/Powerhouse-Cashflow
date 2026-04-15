import type { Category, Entity } from "./constants";

// ─── CORE TRANSACTION ─────────────────────────────────────────────────────────
export interface Transaction {
  uid:          string;
  entity:       string;
  date:         string;   // "YYYY-MM-DD"
  week:         string;   // "YYYY-MM-DD" Monday of week
  account:      string;
  details:      string;
  contra:       string;
  debit:        number;
  credit:       number;
  net:          number;   // positive = inflow
  netUSD?:      number;   // FX-converted, computed at runtime
  cat:          Category;
  currency:     string;
  journalNo:    string;
  sourceFile:   string;
  sourceSheet:  string;
  isAdjustment?:boolean;
  createdBy?:   string;
  createdAt?:   string;
  isManual?:    boolean;
}

// ─── CLASSIFICATION RULE ──────────────────────────────────────────────────────
export interface ClassificationRule {
  uid:       string;
  label:     string;
  keywords:  string[];
  field:     "any" | "details" | "contra" | "account";
  cat:       Category;
  enabled:   boolean;
  priority:  number;
  createdAt: string;
  /** If non-empty, only transactions whose entity is in this list are matched.
   *  Empty array or undefined = applies to ALL companies. */
  entities?: string[];
}

// ─── MANUAL FORECAST ENTRY ────────────────────────────────────────────────────
export interface ManualEntry {
  uid:         string;
  entity:      string;
  month:       string;   // "YYYY-MM"
  description: string;
  amount:      number;
  cat:         Category;
  isManual:    boolean;
  createdBy:   string;
  createdAt:   string;
}

// ─── RECONCILIATION ───────────────────────────────────────────────────────────
export interface ReconFix {
  type:  "reclassify" | "exclude";
  uid:   string;
  cat?:  Category;
}

export interface ReconIssue {
  id:                string;
  type:              string;
  severity:          "error" | "warning" | "info";
  title:             string;
  description:       string;
  transactions:      string[];
  fix:               ReconFix | null;
  fixLabel:          string;
  adjustmentAdvice?: string;
  suggestedAdjCat?:  Category | null;
  suggestedAdjDesc?: string | null;
  suggestedAdjAmount?:number | null;
}

export interface ReconStatus {
  lastRun:      string | null;
  errorCount:   number;
  warningCount: number;
  issues:       ReconIssue[];
}

// ─── APP DATA (server response shape) ────────────────────────────────────────
export interface AppData {
  transactions:  Transaction[];
  meta:          { files: string[]; totalTxns: number };
  excluded:      string[];
  overrides:     Record<string, Category>;
  adjustments:   Transaction[];
  manualEntries: ManualEntry[];
  reconStatus:   ReconStatus;
  rules:         ClassificationRule[];
}

// ─── FX RATES ─────────────────────────────────────────────────────────────────
export interface FxRates {
  ILS?: number;
  EUR?: number;
  GBP?: number;
  [key: string]: number | undefined;
}

// ─── CASHFLOW DERIVED ─────────────────────────────────────────────────────────
export interface WeeklyRow {
  week:        string;
  cats:        Record<string, number>;
  net:         number;
  opening_bal: number;
  closing_bal: number;
}

export interface DerivedRow extends WeeklyRow {
  derived:   Record<string, number>;
  total_in:  number;
  total_out: number;
}

// ─── DRAWER STATE ─────────────────────────────────────────────────────────────
export interface DrawerState {
  week:  string;
  cat:   string;
  title: string;
}
