// ─── ENTITIES ─────────────────────────────────────────────────────────────────
export const ENTITIES = [
  "Consolidated",
  "Corneat",
  "Holmes Place PT",
  "Orange Space",
  "Tribute Brands",
] as const;

export type Entity = (typeof ENTITIES)[number];

// First non-consolidated entity — used as the default in forms
export const FIRST_ENTITY = "Corneat";

export const ENT_COLOR: Record<string, string> = {
  Consolidated:     "#3b82f6",
  Corneat:          "#8b5cf6",
  "Holmes Place PT":"#f59e0b",
  "Orange Space":   "#f97316",
  "Tribute Brands": "#ec4899",
};

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
export const ALL_CATS = [
  "financing_in","grant","salary",
  "operating_out",
  "op_rd","op_professional","op_regulatory","op_office","op_it","op_travel",
  "bank_charges","intercompany","fx_conversion","other",
] as const;

export type Category = (typeof ALL_CATS)[number];

export const OP_SUBCATS: Category[] = [
  "op_rd","op_professional","op_regulatory","op_office","op_it","op_travel",
];

export const CAT_LABELS: Record<string, string> = {
  financing_in:    "Financing Inflows",
  grant:           "Grant Income",
  intercompany_in: "Intercompany (In)",
  intercompany_out:"Intercompany (Out)",
  intercompany:    "Intercompany",
  salary:          "Payroll & Salaries",
  operating_out:   "Operating Payments",
  op_rd:           "R&D & Clinical",
  op_professional: "Professional Services",
  op_regulatory:   "Regulatory & IP",
  op_office:       "Office & Admin",
  op_it:           "IT & Software",
  op_travel:       "Travel & Conferences",
  bank_charges:    "Bank Charges & FX",
  fx_conversion:   "FX Conversion",
  other:           "Other",
};

export const CAT_COLORS: Record<string, string> = {
  financing_in:    "#16a34a",
  grant:           "#0891b2",
  intercompany_in: "#7c3aed",
  intercompany_out:"#7c3aed",
  intercompany:    "#7c3aed",
  salary:          "#dc2626",
  operating_out:   "#ea580c",
  op_rd:           "#c2410c",
  op_professional: "#b45309",
  op_regulatory:   "#a16207",
  op_office:       "#92400e",
  op_it:           "#d97706",
  op_travel:       "#f59e0b",
  bank_charges:    "#9f1239",
  fx_conversion:   "#64748b",
  other:           "#94a3b8",
};

export const CAT_BG: Record<string, string> = {
  financing_in:    "#dcfce7",
  grant:           "#e0f2fe",
  intercompany_in: "#ede9fe",
  intercompany_out:"#ede9fe",
  intercompany:    "#ede9fe",
  salary:          "#fee2e2",
  operating_out:   "#ffedd5",
  op_rd:           "#fff7ed",
  op_professional: "#fffbeb",
  op_regulatory:   "#fefce8",
  op_office:       "#fef3c7",
  op_it:           "#fffbeb",
  op_travel:       "#fef9c3",
  bank_charges:    "#fce7f3",
  fx_conversion:   "#f1f5f9",
  other:           "#f8fafc",
};

// ─── VIEW PERIODS ─────────────────────────────────────────────────────────────
export const VIEW_PERIODS = ["weekly","monthly","quarterly","yearly"] as const;
export type ViewPeriod = (typeof VIEW_PERIODS)[number];

// ─── TABS ─────────────────────────────────────────────────────────────────────
export const TABS = ["Cashflow","Transactions","Forecast","Rules","Reconcile"] as const;
export type Tab = (typeof TABS)[number];
