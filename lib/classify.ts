import type { Category } from "./constants";
import type { Transaction, ClassificationRule } from "./types";

// ─── KEYWORD RULES ────────────────────────────────────────────────────────────
export const CAT_KEYWORDS: { cat: Category; words: string[] }[] = [
  { cat: "salary",          words: ["salary","salaire","משכורת","payroll","wages","pension","ביטוח לאומי","national insurance","income tax","withholding","ניכויים","compensation","deel"] },
  { cat: "financing_in",    words: ["cla","loan","convertible","investment","fundrais","capital","bridge"] },
  { cat: "grant",           words: ["grant","ati","army","navy","innovation authority","oia","nati","department of"] },
  { cat: "bank_charges",    words: ["bank fee","bank charge","commission","interest","ריבית","עמלה","עמלות","fx","exchange","conversion","spread","overdraft"] },
  { cat: "intercompany",    words: ["transfer to","transfer from","intercompany","inter-company","ltd to inc","inc to ltd"] },
  // Operating subcategories (checked before generic operating_out)
  { cat: "op_rd",           words: ["lab","laboratory","clinical","cro","preclinical","animal study","cadaver","biotech","trial","experiment","r&d","research","histology","pathology","surgeon","surgery","implant","device testing"] },
  { cat: "op_professional", words: ["legal","audit","accounting","consulting","counsel","lawyer","attorney","notary","cpa","kpmg","deloitte","pwc","ey ","advisory","law firm","advocate","accountant"] },
  { cat: "op_regulatory",   words: ["fda","ce mark","iso ","regulatory","patent","trademark","intellectual property"," ip ","registration","mdr","510k","ce certification","notified body"] },
  { cat: "op_office",       words: ["rent","office","utilities","electricity","water","cleaning","maintenance","facility","building","insurance","postage","courier","fedex","dhl","amazon","printing","stationery"] },
  { cat: "op_it",           words: ["software","saas","subscription","aws","azure","google cloud","microsoft","zoom","slack","github","license","hosting","it support","jira","salesforce","hubspot","domain"] },
  { cat: "op_travel",       words: ["travel","flight","hotel","accommodation","conference","airbnb","taxi","uber","transport","per diem","meal","restaurant","airport","train","car rental"] },
  // Generic operating fallback
  { cat: "operating_out",   words: ["invoice","supplier","vendor"] },
];

// ─── LEGACY CLASSIFY (for old internal format) ────────────────────────────────
export function classify(cat: string, details: string): Category {
  const c = String(cat || "").toLowerCase();
  const d = String(details || "").toLowerCase();
  if (c === "salary")                      return "salary";
  if (c === "bank charges")                return "bank_charges";
  if (c === "cla")                         return "financing_in";
  if (c === "grant")                       return "grant";
  if (c === "conversion")                  return "fx_conversion";
  if (c === "inc" || d.includes("transfer")) return "intercompany";
  if (c === "supplier" || c === "suppliers") {
    const match = CAT_KEYWORDS.find(r => r.cat.startsWith("op_") && r.words.some(w => d.includes(w)));
    return match ? match.cat : "operating_out";
  }
  return "other";
}

// ─── RUNTIME RE-CLASSIFIER ────────────────────────────────────────────────────
// Upgrades stored operating_out → subcategory by keyword (non-destructive)
export function reclassifyOp(t: Transaction): Category {
  if (t.cat !== "operating_out") return t.cat;
  const text = `${t.details || ""} ${t.contra || ""} ${t.account || ""}`.toLowerCase();
  const match = CAT_KEYWORDS.find(r => r.cat.startsWith("op_") && r.words.some(w => text.includes(w)));
  return match ? match.cat : "operating_out";
}

// ─── APPLY A CLASSIFICATION RULE ─────────────────────────────────────────────
export function applyRule(rule: ClassificationRule, t: Partial<Transaction>): boolean {
  if (rule.enabled === false) return false;
  const keywords = rule.keywords.map(k => k.toLowerCase().trim()).filter(Boolean);
  if (!keywords.length) return false;

  // Entity scope: if the rule is scoped to specific companies, skip non-matching txns
  if (rule.entities && rule.entities.length > 0) {
    if (!t.entity || !rule.entities.includes(t.entity)) return false;
  }

  const fields: Record<string, string> = {
    details: String(t.details || "").toLowerCase(),
    contra:  String(t.contra  || "").toLowerCase(),
    account: String(t.account || "").toLowerCase(),
  };
  const anyText = Object.values(fields).join(" ");

  return keywords.some(kw => {
    if (rule.field === "any")     return anyText.includes(kw);
    if (rule.field === "details") return fields.details.includes(kw);
    if (rule.field === "contra")  return fields.contra.includes(kw);
    if (rule.field === "account") return fields.account.includes(kw);
    return anyText.includes(kw);
  });
}

// ─── SUGGEST A CATEGORY FROM KEYWORDS ────────────────────────────────────────
export function suggestCategory(t: Partial<Transaction>): Category | null {
  const text = `${t.details || ""} ${t.contra || ""} ${t.account || ""}`.toLowerCase();
  for (const rule of CAT_KEYWORDS) {
    if (rule.words.some(w => text.includes(w))) return rule.cat;
  }
  return null;
}

// ─── BANK LEUMI TRANSACTION CLASSIFIER ───────────────────────────────────────
export function classifyIsraeliBankTxn(transType: string, details: string): Category {
  const t   = (transType || "").toLowerCase();
  const d   = (details   || "").toLowerCase();
  const all = `${t} ${d}`;

  if (t.includes("salary") || t === "salary-net" || t.includes("salary fee")) return "salary";
  if (t.includes("management fee") || t.includes("recording fee") ||
      t.includes("transfer/deposit fee") || t.includes("transfer fee") ||
      t.includes("trade fee") || t.includes("currency fee"))                   return "bank_charges";
  if (t.includes("foreign currency - sale") || t.includes("foreign currency - purchase"))
                                                                                return "fx_conversion";
  if (t.includes("foreign currency") || t.includes("foreign trade") ||
      t.includes("foreign-currency") || t.includes("foreign-trade"))           return "bank_charges";
  if (t.includes("interest on deposit"))  return "grant";
  if (t.includes("deposit maturity"))     return "financing_in";
  if (t.includes("payment into deposit")) return "other";
  if (t.includes("customs") || t.includes("vat")) return "op_regulatory";
  if (d.includes("קורנית") || d.includes("corneat") ||
      d.includes("גלאוקיור") || d.includes("glaucure")) return "intercompany";
  if (t.includes("isracard") || t.includes("credit card")) return "operating_out";
  if (t.includes("transfer") || t.includes("cluster transfer")) {
    const match = CAT_KEYWORDS.find(r => r.words.some(w => all.includes(w)));
    return match ? match.cat : "operating_out";
  }
  if (t.includes("זיכוי") || t.includes("credit")) return "financing_in";
  const match = CAT_KEYWORDS.find(r => r.words.some(w => all.includes(w)));
  return match ? match.cat : "other";
}

// ─── KEYWORD EXTRACTION (for Rules tab suggestions) ──────────────────────────
export const STOP_WORDS = new Set([
  "the","and","for","with","from","into","that","this","have","been","were","they",
  "their","will","would","could","should","about","which","there","when","where",
  "your","our","its","not","but","all","any","can","may","one","two","has","had",
  "was","are","his","her","him","who","how","what","why","are","ltd","inc","llc",
  "bv","gmbh","corp","co","pvt","plc","bank","payment","transfer","invoice","ref",
  "order","number","account","credit","debit","date","amount","total","tax","vat",
  "month","months","year","jan","feb","mar","apr","may","jun","jul","aug","sep",
  "oct","nov","dec","בעמ","בעמ","בע","מ","לחשבון","עבור","חשבון",
]);

export function extractWords(t: Partial<Transaction>): string[] {
  const text = `${t.details || ""} ${t.contra || ""} ${t.account || ""}`;
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
}

export function extractPhrases(t: Partial<Transaction>): string[] {
  const words = extractWords(t);
  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    if (!STOP_WORDS.has(words[i]) && !STOP_WORDS.has(words[i + 1])) bigrams.push(bg);
  }
  return [...words, ...bigrams];
}
