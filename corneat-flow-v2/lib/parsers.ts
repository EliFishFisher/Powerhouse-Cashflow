// This module runs on the client only (file parsing uses browser APIs)
import * as XLSX from "xlsx";
import { classify, classifyIsraeliBankTxn, CAT_KEYWORDS } from "./classify";
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

// ─── WEEK MONDAY ─────────────────────────────────────────────────────────────
function toWeekMonday(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  return mon.toISOString().slice(0, 10);
}

// ─── BANK LEUMI EXCEL ─────────────────────────────────────────────────────────
export function parseIsraeliBankSheet(
  rows:      unknown[][],
  filename:  string,
  sheetName: string,
): Transaction[] | null {
  let accountInfoRow = -1;
  let headerRow = -1;

  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const r = rows[i] as string[];
    if (!r) continue;
    const c0 = String(r[0] || "");
    if (c0.includes("Account number")) accountInfoRow = i;
    if (c0 === "Date" && String(r[2] || "").toLowerCase().includes("transaction")) headerRow = i;
  }
  if (headerRow < 0) return null;

  let entity = entityFromFilename(filename);
  // Account number → entity mapping: update these with your Bank Leumi account numbers
  // if (accountInfoRow >= 0) {
  //   const info = String((rows[accountInfoRow] as string[])[0] || "");
  //   if      (info.includes("XXXXX")) entity = "Corneat";
  //   else if (info.includes("YYYYY")) entity = "Holmes Place PT";
  // }

  const txns: Transaction[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] as any[];
    if (!r || r.every((v: unknown) => v === null || v === undefined || v === "")) continue;

    let dateStr: string;
    const dateVal = r[0];
    if (dateVal instanceof Date) {
      dateStr = dateVal.toISOString().slice(0, 10);
    } else if (typeof dateVal === "number" && dateVal > 20000) {
      dateStr = new Date(Math.round((dateVal - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
    } else if (typeof dateVal === "string" && /\d{2}\.\d{2}\.\d{4}/.test(dateVal)) {
      const [dd, mm, yyyy] = dateVal.split(".");
      dateStr = `${yyyy}-${mm}-${dd}`;
    } else {
      continue;
    }

    const transType = String(r[2] || "").trim();
    const details   = String(r[3] || "").trim().replace(/^for:\s*/i, "").trim();
    const debit     = parseFloat(String(r[6] || "").replace(/,/g, "")) || 0;
    const credit    = parseFloat(String(r[7] || "").replace(/,/g, "")) || 0;
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
  return txns;
}

// ─── LEGACY INTERNAL FORMAT ───────────────────────────────────────────────────
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
    const date =
      typeof r[3] === "number"
        ? new Date(Math.round((r[3] - 25569) * 86400 * 1000))
        : new Date(r[3]);
    if (isNaN(date.getTime())) continue;

    const debit  = parseFloat(r[12]) || 0;
    const credit = parseFloat(r[13]) || 0;
    if (debit === 0 && credit === 0) continue;

    const journalNo = String(r[10] || "");
    const accountNo = String(r[0]  || "");
    const dateStr   = date.toISOString().slice(0, 10);
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

function parseSheet(
  ws:        XLSX.WorkSheet,
  entity:    string,
  filename:  string,
  sheetName: string,
): Transaction[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });
  const israeli = parseIsraeliBankSheet(rows as unknown[][], filename, sheetName);
  if (israeli !== null) return israeli;
  return parseLegacySheet(ws, entity, filename, sheetName);
}

// ─── PARSE XLSX WORKBOOK ──────────────────────────────────────────────────────
export function parseWorkbook(buffer: Uint8Array, filename: string): Transaction[] {
  const entity = entityFromFilename(filename);
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  let all: Transaction[] = [];
  for (const sn of wb.SheetNames) {
    all = all.concat(parseSheet(wb.Sheets[sn], entity, filename, sn));
  }
  return all;
}

// ─── PARSE SVB CSV ────────────────────────────────────────────────────────────
export function parseSVBCsv(text: string, filename: string): Transaction[] {
  function parseLine(line: string): string[] {
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

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return [];

  const txns: Transaction[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length < 11)            continue;
    if (cols[5] !== "T")             continue;
    if (cols[0] === "File Totals")   continue;
    if (!/\d{2}\/\d{2}\/\d{4}/.test(cols[0])) continue;

    const [mm, dd, yyyy] = cols[0].split("/");
    const dateStr  = `${yyyy}-${mm}-${dd}`;
    const currency = cols[8] || "USD";
    const credit   = parseFloat(cols[9].replace(/,/g, "")) || 0;
    const debit    = parseFloat(cols[10].replace(/,/g, "")) || 0;
    if (credit === 0 && debit === 0) continue;

    const net      = credit - debit;
    const tranType = cols[6] || "";
    const bankRef  = cols[11] || "";
    const desc     = cols[14] || "";
    const notes    = cols[23] || "";
    const entityRaw = cols[4] || "";

    let entity: string = entityFromFilename(filename);
    // Override from SVB account name field if recognisable
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
