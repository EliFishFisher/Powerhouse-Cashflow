// This module runs on the client only (file parsing uses browser APIs)
import * as XLSX from "xlsx";
import { classify, classifyIsraeliBankTxn, suggestCategory, CAT_KEYWORDS } from "./classify";
import type { Transaction } from "./types";
import type { Category } from "./constants";

// ─── HASH ─────────────────────────────────────────────────────────────────────
function hashTxn(fields: string[]): string {
  const str = fields.join("|");
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// ─── ENTITY FROM FILENAME ─────────────────────────────────────────────────────
export function entityFromFilename(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("corneat"))   return "Corneat";
  if (n.includes("holmes"))    return "Holmes Place PT";
  if (n.includes("orange"))    return "Orange Space";
  if (n.includes("tribute"))   return "Tribute Brands";
  return "Unknown";
}

// ─── WEEK MONDAY ──────────────────────────────────────────────────────────────
function toWeekMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

// ─── UNIVERSAL DATE PARSER ────────────────────────────────────────────────────
// Handles: Date obj, Excel serial, DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY,
//          MM/DD/YYYY (US), YYYY-MM-DD, and ambiguous 2-digit day/month
function parseAnyDate(val: unknown): string | null {
  if (!val && val !== 0) return null;

  // Native Date object (XLSX with cellDates:true)
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().slice(0, 10);
  }

  // Excel serial number
  if (typeof val === "number" && val > 20000) {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const s = String(val).trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // DD-MM-YYYY  /  DD/MM/YYYY  /  DD.MM.YYYY
  const euroMatch = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (euroMatch) {
    const [, a, b, yyyy] = euroMatch;
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    // If first part > 12 it must be DD; if second part > 12 it must be MM
    // Default to DD/MM when ambiguous (European convention)
    let dd: string, mm: string;
    if (aNum > 12) { dd = a.padStart(2, "0"); mm = b.padStart(2, "0"); }
    else if (bNum > 12) { dd = b.padStart(2, "0"); mm = a.padStart(2, "0"); }
    else { dd = a.padStart(2, "0"); mm = b.padStart(2, "0"); } // assume DD/MM
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // MM/DD/YYYY  (US — only reached if above didn't match)
  const usMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, mm, dd, yyyy] = usMatch;
    const d = new Date(`${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  return null;
}

// ─── GENERIC MULTI-FORMAT ENGINE ──────────────────────────────────────────────
//
// Canonical field names → all known column header aliases (lowercase, partial match)
// Add new aliases here as new bank formats are discovered.
//
const FIELD_ALIASES: Record<string, string[]> = {
  date: [
    "date", "operation date", "transaction date", "posting date",
    "value date", "booking date", "entry date", "trade date",
    "תאריך",                         // Hebrew
    "fecha",                          // Spanish
    "datum",                          // German/Dutch
    "data",                           // Portuguese/Italian
  ],
  date2: [
    "amount date", "settlement date", "value date", "effective date",
  ],
  description: [
    "description", "details", "transaction details", "account description",
    "narrative", "particulars", "memo", "remarks", "reference text",
    "beneficiary", "payee", "payment details", "payment description",
    "תיאור", "פרטים",                // Hebrew
    "omschrijving",                   // Dutch
    "beschreibung",                   // German
    "descripcion",                    // Spanish
    "descricao", "descri",            // Portuguese
  ],
  type: [
    "type", "transaction type", "dr/cr", "debit/credit", "credit/debit",
    "dc", "direction", "flow",
  ],
  debit: [
    "debit", "debit amount", "withdrawals", "withdrawal", "payments out",
    "money out", "charges", "charge amount", "חובה",
    "débito",                         // Spanish/Portuguese
    "af",                             // Dutch
  ],
  credit: [
    "credit", "credit amount", "deposits", "deposit", "payments in",
    "money in", "proceeds", "זכות",
    "crédito",                        // Spanish/Portuguese
    "bij",                            // Dutch
  ],
  amount: [
    "amount", "value", "net amount", "transaction amount",
    "signed amount", "sum", "importe",
    "bedrag",                         // Dutch
    "betrag",                         // German
    "montant",                        // French
    "montante", "valor",              // Portuguese
  ],
  currency: [
    "currency", "ccy", "curr", "מטבע",
    "moneda", "moeda",                // Spanish/Portuguese
    "währung",                        // German
    "valuta",                         // Dutch/Italian
  ],
  balance: [
    "balance", "accounting balance", "running balance", "closing balance",
    "available balance", "יתרה",
    "saldo",                          // Spanish/Portuguese/Italian/Dutch
    "kontostand",                     // German
  ],
  ref: [
    "reference", "ref", "journal", "journal no", "check no",
    "transaction id", "txn id", "document no", "doc no",
    "אסמכתא",                        // Hebrew
    "referencia",                     // Spanish/Portuguese
    "kenmerk",                        // Dutch
  ],
};

// ─── COLUMN MAP ───────────────────────────────────────────────────────────────
interface ColMap {
  date?:        number;
  date2?:       number;
  description?: number;
  type?:        number;
  debit?:       number;
  credit?:      number;
  amount?:      number;
  currency?:    number;
  balance?:     number;
  ref?:         number;
}

// Scan the first 10 rows; pick the one with the most field-alias hits as the
// header row, then return the column index for each canonical field.
function detectHeaderRow(rows: unknown[][]): { headerIdx: number; colMap: ColMap } | null {
  let bestScore = 0;
  let bestIdx   = -1;
  let bestMap: ColMap = {};

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] as unknown[];
    if (!row) continue;

    const map: ColMap = {};
    let score = 0;

    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j] ?? "").toLowerCase().trim();
      if (!cell) continue;

      for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
        if (aliases.some(a => cell === a || cell.startsWith(a))) {
          if (!(field in map)) {              // first match wins
            (map as Record<string, number>)[field] = j;
            score++;
          }
          break;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx   = i;
      bestMap   = map;
    }
  }

  // Require at least a date column AND some amount column
  const hasAmount = bestMap.amount !== undefined
    || bestMap.debit  !== undefined
    || bestMap.credit !== undefined;

  if (bestIdx < 0 || bestMap.date === undefined || !hasAmount) return null;
  return { headerIdx: bestIdx, colMap: bestMap };
}

// Parse a numeric-looking string (handles commas, parentheses for negatives)
function parseNum(v: unknown): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (!s || s === "-") return 0;
  // Parentheses = negative: (1234.56) → -1234.56
  const parens = s.match(/^\((.+)\)$/);
  if (parens) return -(parseFloat(parens[1]) || 0);
  return parseFloat(s) || 0;
}

// ─── GENERIC SHEET PARSER ─────────────────────────────────────────────────────
function parseGenericSheet(
  rows:      unknown[][],
  filename:  string,
  sheetName: string,
): Transaction[] | null {
  const detected = detectHeaderRow(rows);
  if (!detected) return null;

  const { headerIdx, colMap: c } = detected;
  const entity = entityFromFilename(filename);
  const txns: Transaction[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (!r || r.every(v => v === null || v === undefined || v === "")) continue;

    // ── Date ────────────────────────────────────────────────────────────────
    const dateStr = parseAnyDate(c.date !== undefined ? r[c.date] : undefined);
    if (!dateStr) continue;

    // ── Amount ──────────────────────────────────────────────────────────────
    let debit  = 0;
    let credit = 0;

    if (c.debit !== undefined || c.credit !== undefined) {
      // Separate debit / credit columns
      debit  = Math.abs(parseNum(c.debit  !== undefined ? r[c.debit]  : 0));
      credit = Math.abs(parseNum(c.credit !== undefined ? r[c.credit] : 0));
    } else if (c.amount !== undefined) {
      const raw = parseNum(r[c.amount]);
      if (raw === 0) continue;

      // If there's a type column, use it to determine direction
      const typeStr = c.type !== undefined
        ? String(r[c.type] ?? "").toLowerCase().trim()
        : "";

      const isDebitType  = typeStr.startsWith("deb") || typeStr === "dr" || typeStr === "d";
      const isCreditType = typeStr.startsWith("cre") || typeStr === "cr" || typeStr === "c";

      if (isDebitType)       { debit  = Math.abs(raw); credit = 0; }
      else if (isCreditType) { credit = Math.abs(raw); debit  = 0; }
      else {
        // No type column — infer from sign
        if (raw < 0) { debit  = Math.abs(raw); credit = 0; }
        else         { credit = raw;            debit  = 0; }
      }
    }

    if (debit === 0 && credit === 0) continue;
    const net = credit - debit;

    // ── Other fields ────────────────────────────────────────────────────────
    const description = c.description !== undefined
      ? String(r[c.description] ?? "").trim()
      : "";
    const currency = c.currency !== undefined
      ? String(r[c.currency] ?? "").trim() || "USD"
      : "USD";
    const ref = c.ref !== undefined ? String(r[c.ref] ?? "").trim() : "";

    const week = toWeekMonday(dateStr);
    // Use balance as tiebreaker when available (it changes every row), else row index
    const balStr = c.balance !== undefined ? String(r[c.balance] ?? "") : String(i);
    const uid  = hashTxn([entity, dateStr, description, debit.toFixed(2), credit.toFixed(2), ref, balStr]);
    const cat  = suggestCategory({ details: description }) ?? (net < 0 ? "operating_out" : "financing_in");

    txns.push({
      uid, entity, date: dateStr, week,
      account:     description || "Bank",
      details:     description || ref,
      contra:      "",
      debit, credit, net,
      cat, currency,
      journalNo:   ref,
      sourceFile:  filename,
      sourceSheet: sheetName,
    });
  }

  return txns.length > 0 ? txns : null;
}

// ─── BANK LEUMI (SPECIFIC FORMAT) ─────────────────────────────────────────────
// Kept separate because it needs special column semantics (transType, journalNo)
export function parseIsraeliBankSheet(
  rows:      unknown[][],
  filename:  string,
  sheetName: string,
): Transaction[] | null {
  let headerRow = -1;

  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = rows[i] as string[];
    if (!r) continue;
    const c0 = String(r[0] || "");
    if (c0 === "Date" && String(r[2] || "").toLowerCase().includes("transaction")) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) return null;

  const entity = entityFromFilename(filename);
  const txns: Transaction[] = [];

  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] as any[];
    if (!r || r.every((v: unknown) => v === null || v === undefined || v === "")) continue;

    const dateStr = parseAnyDate(r[0]);
    if (!dateStr) continue;

    const transType = String(r[2] || "").trim();
    const details   = String(r[3] || "").trim().replace(/^for:\s*/i, "").trim();
    const debit     = Math.abs(parseNum(r[6]));
    const credit    = Math.abs(parseNum(r[7]));
    if (debit === 0 && credit === 0) continue;

    const net  = credit - debit;
    const ref  = String(r[4] || "");
    const week = toWeekMonday(dateStr);
    const uid  = hashTxn([entity, dateStr, ref, debit.toFixed(2), credit.toFixed(2), transType.slice(0, 8)]);
    const cat  = classifyIsraeliBankTxn(transType, details);

    txns.push({
      uid, entity, date: dateStr, week,
      account:     transType,
      details:     details || transType,
      contra:      transType,
      debit, credit, net,
      cat, currency: "NIS",
      journalNo:   ref,
      sourceFile:  filename,
      sourceSheet: sheetName,
    });
  }
  return txns.length > 0 ? txns : null;
}

// ─── LEGACY INTERNAL FORMAT (last resort) ─────────────────────────────────────
function parseLegacySheet(
  ws:        XLSX.WorkSheet,
  entity:    string,
  filename:  string,
  sheetName: string,
): Transaction[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  if (rows.length < 2) return [];

  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const r = rows[i] as string[];
    if (r && (String(r[0]).includes("חשבון") || String(r[0]).toLowerCase().includes("account"))) {
      headerIdx = i;
      break;
    }
  }

  const txns: Transaction[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as any[];
    if (!r || !r[3]) continue;
    const dateStr = parseAnyDate(r[3]);
    if (!dateStr) continue;

    const debit  = Math.abs(parseNum(r[12]));
    const credit = Math.abs(parseNum(r[13]));
    if (debit === 0 && credit === 0) continue;

    const journalNo = String(r[10] || "");
    const accountNo = String(r[0]  || "");
    const details   = String(r[7] || "");
    const contra    = String(r[9] || "");
    const category  = String(r[16] || r[11] || "");
    const currency  = String(r[15] || "USD");
    const uid       = hashTxn([entity, accountNo, dateStr, journalNo, debit.toFixed(2), credit.toFixed(2)]);
    const week      = toWeekMonday(dateStr);

    txns.push({
      uid, entity, date: dateStr, week,
      account:     String(r[1] || accountNo),
      details:     details || contra,
      contra,
      debit, credit,
      net:         debit - credit,
      cat:         classify(category, details),
      currency,
      journalNo,
      sourceFile:  filename,
      sourceSheet: sheetName,
    });
  }
  return txns;
}

// ─── SHEET DISPATCHER ─────────────────────────────────────────────────────────
// Try parsers in priority order; fall through to next on null/empty result.
function parseSheet(
  ws:        XLSX.WorkSheet,
  entity:    string,
  filename:  string,
  sheetName: string,
): Transaction[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  // 1. Bank Leumi specific (hard-coded column positions)
  const leumi = parseIsraeliBankSheet(rows, filename, sheetName);
  if (leumi !== null) return leumi;

  // 2. Generic header-detection engine (handles CA_Movements, Hapoalim, HSBC, etc.)
  const generic = parseGenericSheet(rows, filename, sheetName);
  if (generic !== null) return generic;

  // 3. Legacy internal format (last resort)
  return parseLegacySheet(ws, entity, filename, sheetName);
}

// ─── DIAGNOSTICS ──────────────────────────────────────────────────────────────
export interface ParseDiagnostic {
  sheetName: string;
  firstRows: string[][];
  detectedFormat: string;
}

// ─── PARSE XLSX / XLS WORKBOOK ────────────────────────────────────────────────
export function parseWorkbook(
  buffer: Uint8Array,
  filename: string,
): { txns: Transaction[]; diagnostics: ParseDiagnostic[] } {
  const entity = entityFromFilename(filename);
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  let txns: Transaction[] = [];
  const diagnostics: ParseDiagnostic[] = [];

  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, defval: null }) as unknown[][];

    // Detect which format was matched (for diagnostics)
    const leumiMatch   = parseIsraeliBankSheet(rows, filename, sn) !== null;
    const genericMatch = !leumiMatch && detectHeaderRow(rows) !== null;
    const formatName   = leumiMatch ? "Bank Leumi" : genericMatch ? "Generic (auto-detected)" : "Legacy / Unknown";

    const sheetTxns = parseSheet(wb.Sheets[sn], entity, filename, sn);
    txns = txns.concat(sheetTxns);

    if (sheetTxns.length === 0) {
      diagnostics.push({
        sheetName: sn,
        firstRows: rows.slice(0, 6).map(r =>
          (r as unknown[]).slice(0, 10).map(v =>
            (v === null || v === undefined) ? "" : String(v)
          )
        ),
        detectedFormat: formatName,
      });
    }
  }
  return { txns, diagnostics };
}

// ─── PARSE SVB / GENERIC CSV ──────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQ = !inQ; continue; }
    if (line[i] === "," && !inQ) { out.push(cur.trim()); cur = ""; continue; }
    cur += line[i];
  }
  out.push(cur.trim());
  return out;
}

export function parseSVBCsv(text: string, filename: string): Transaction[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return [];

  const txns: Transaction[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 11)            continue;
    if (cols[5] !== "T")             continue;
    if (cols[0] === "File Totals")   continue;
    if (!/\d{2}\/\d{2}\/\d{4}/.test(cols[0])) continue;

    const [mm, dd, yyyy] = cols[0].split("/");
    const dateStr  = `${yyyy}-${mm}-${dd}`;
    const currency = cols[8] || "USD";
    const credit   = Math.abs(parseNum(cols[9]));
    const debit    = Math.abs(parseNum(cols[10]));
    if (credit === 0 && debit === 0) continue;

    const net      = credit - debit;
    const tranType = cols[6] || "";
    const bankRef  = cols[11] || "";
    const desc     = cols[14] || "";
    const notes    = cols[23] || "";
    const entityRaw = cols[4] || "";

    let entity: string = entityFromFilename(filename);
    const eRaw = entityRaw.toLowerCase();
    if      (eRaw.includes("corneat"))  entity = "Corneat";
    else if (eRaw.includes("holmes"))   entity = "Holmes Place PT";
    else if (eRaw.includes("orange"))   entity = "Orange Space";
    else if (eRaw.includes("tribute"))  entity = "Tribute Brands";

    const week = toWeekMonday(dateStr);
    const uid  = hashTxn([entity, dateStr, bankRef, debit.toFixed(2), credit.toFixed(2), tranType.slice(0, 8)]);

    const all = `${tranType} ${desc} ${notes}`.toLowerCase();
    let cat: Category = "other";
    if (tranType.toLowerCase().includes("book transfer")) cat = "intercompany";
    else if (tranType.toLowerCase().includes("deposit"))  cat = "financing_in";
    else {
      const match = CAT_KEYWORDS.find(r => r.words.some(w => all.includes(w)));
      cat = match ? match.cat : "operating_out";
    }

    txns.push({
      uid, entity, date: dateStr, week,
      account:     cols[3] || "SVB",
      details:     desc || notes || tranType,
      contra:      tranType,
      debit, credit, net,
      cat, currency,
      journalNo:   bankRef,
      sourceFile:  filename,
      sourceSheet: "SVB",
    });
  }
  return txns;
}

// Also try parsing generic CSV (tab or comma separated with headers)
export function parseGenericCsv(text: string, filename: string): Transaction[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // Detect separator (comma vs semicolon vs tab)
  const sep = lines[0].includes("\t") ? "\t"
    : lines[0].includes(";")          ? ";"
    : ",";

  const splitLine = (l: string) => sep === ","
    ? parseCsvLine(l)
    : l.split(sep).map(c => c.replace(/^"|"$/g, "").trim());

  const headerCells = splitLine(lines[0]).map(h => h.toLowerCase().trim());

  // Build colMap using FIELD_ALIASES
  const colMap: ColMap = {};
  for (let j = 0; j < headerCells.length; j++) {
    const cell = headerCells[j];
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some(a => cell === a || cell.startsWith(a))) {
        if (!(field in colMap)) (colMap as Record<string, number>)[field] = j;
        break;
      }
    }
  }

  const hasAmount = colMap.amount !== undefined || colMap.debit !== undefined || colMap.credit !== undefined;
  if (colMap.date === undefined || !hasAmount) return [];

  const entity = entityFromFilename(filename);
  const txns: Transaction[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const dateStr = parseAnyDate(colMap.date !== undefined ? cols[colMap.date] : undefined);
    if (!dateStr) continue;

    let debit = 0, credit = 0;
    if (colMap.debit !== undefined || colMap.credit !== undefined) {
      debit  = Math.abs(parseNum(colMap.debit  !== undefined ? cols[colMap.debit]  : "0"));
      credit = Math.abs(parseNum(colMap.credit !== undefined ? cols[colMap.credit] : "0"));
    } else if (colMap.amount !== undefined) {
      const raw = parseNum(cols[colMap.amount]);
      const typeStr = colMap.type !== undefined ? cols[colMap.type].toLowerCase() : "";
      if (typeStr.startsWith("deb") || typeStr === "dr") { debit = Math.abs(raw); }
      else if (typeStr.startsWith("cre") || typeStr === "cr") { credit = Math.abs(raw); }
      else { if (raw < 0) debit = Math.abs(raw); else credit = raw; }
    }

    if (debit === 0 && credit === 0) continue;
    const description = colMap.description !== undefined ? cols[colMap.description] ?? "" : "";
    const currency    = colMap.currency    !== undefined ? cols[colMap.currency]    || "USD" : "USD";
    const ref         = colMap.ref         !== undefined ? cols[colMap.ref]         ?? "" : "";

    const net  = credit - debit;
    const week = toWeekMonday(dateStr);
    const balStr = colMap.balance !== undefined ? cols[colMap.balance] ?? String(i) : String(i);
    const uid  = hashTxn([entity, dateStr, String(description), debit.toFixed(2), credit.toFixed(2), ref, balStr]);

    txns.push({
      uid, entity, date: dateStr, week,
      account: String(description) || "Bank",
      details: String(description) || ref,
      contra: "",
      debit, credit, net,
      cat: suggestCategory({ details: String(description) }) ?? (net < 0 ? "operating_out" : "financing_in"),
      currency,
      journalNo: ref,
      sourceFile: filename,
      sourceSheet: "CSV",
    });
  }
  return txns;
}

// ─── MERGE (dedup by uid) ─────────────────────────────────────────────────────
export function mergeTxns(
  existing: Transaction[],
  incoming: Transaction[],
): { merged: Transaction[]; added: number } {
  const map = new Map(existing.map(t => [t.uid, t]));
  let added = 0;
  for (const t of incoming) {
    if (!map.has(t.uid)) { map.set(t.uid, t); added++; }
  }
  return { merged: [...map.values()], added };
}
