"use client";

import { useCallback, useState } from "react";
import { parseWorkbook, parseSVBCsv, parseGenericCsv, mergeTxns } from "@/lib/parsers";
import { apiClient } from "@/lib/api-client";
import { ENTITIES } from "@/lib/constants";
import type { Transaction } from "@/lib/types";
import type { CompanyEntry } from "@/hooks/use-app-data";

interface Props {
  transactions: Transaction[];
  meta:         { files: string[]; totalTxns: number };
  serverOk:     boolean;
  isAdmin:      boolean;
  companies:    CompanyEntry[];
  onLoaded:     () => void;
  onClear:      () => void;
}

const COMPANY_ENTITIES = ENTITIES.filter(e => e !== "Consolidated");

export function FileLoader({ transactions, meta, serverOk, isAdmin, companies, onLoaded, onClear }: Props) {
  const [dragging,      setDragging]      = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [targetEntity,  setTargetEntity]  = useState<string>(COMPANY_ENTITIES[0] ?? "");
  const [pendingFiles,  setPendingFiles]  = useState<File[] | null>(null);
  const [status,        setStatus]        = useState<{ added: number; dupes: number; total: number; errors: string[]; step?: string } | null>(null);

  const processFiles = useCallback(async (files: File[], entityOverride?: string) => {
    const entity = entityOverride ?? targetEntity;
    setLoading(true);
    setStatus({ added: 0, dupes: 0, total: 0, errors: [], step: `Reading ${files.length} file(s)…` });

    try {
      let allNew: Transaction[] = [];
      const errors: string[] = [];

      for (const file of files) {
        const isXlsx = /\.(xlsx|xls)$/i.test(file.name);
        const isCsv  = /\.csv$/i.test(file.name);
        if (!isXlsx && !isCsv) { errors.push(`${file.name}: unsupported format (use .xlsx or .csv)`); continue; }
        try {
          if (isXlsx) {
            const buf = await file.arrayBuffer();
            const { txns: parsed, diagnostics } = parseWorkbook(new Uint8Array(buf), file.name);
            if (parsed.length === 0 && diagnostics.length > 0) {
              for (const d of diagnostics) {
                const preview = d.firstRows
                  .map((r, i) => `Row ${i}: [${r.filter(Boolean).join(" | ")}]`)
                  .join("\n");
                errors.push(`"${file.name}" sheet "${d.sheetName}" (${d.detectedFormat}): 0 transactions found.\nHeaders seen:\n${preview}`);
              }
            }
            allNew = allNew.concat(parsed);
          } else {
            const text = await file.text();
            const firstLine = text.slice(0, 100);
            if (firstLine.includes("From:") || text.split("\n")[1]?.includes("Bank ID")) {
              allNew = allNew.concat(parseSVBCsv(text, file.name));
            } else {
              const parsed = parseGenericCsv(text, file.name);
              if (parsed.length > 0) {
                allNew = allNew.concat(parsed);
              } else {
                errors.push(`${file.name}: CSV format not recognised. Expected columns: Date, Amount (or Debit/Credit), Description.`);
              }
            }
          }
        } catch (e) {
          errors.push(`${file.name}: ${(e as Error).message}`);
        }
      }

      if (allNew.length === 0 && errors.length === 0) {
        errors.push("No transactions found. Please upload a Bank Leumi .xlsx/.xls export or SVB .csv export.");
      }

      setStatus({ added: 0, dupes: 0, total: 0, errors, step: `Parsed ${allNew.length} rows — deduplicating…` });

      if (isAdmin && entity) {
        allNew = allNew.map(t => ({ ...t, entity }));
      }

      let baseTxns = transactions;
      if (isAdmin && entity) {
        const company = companies.find(c => c.entity_name === entity);
        baseTxns = company?.data.transactions ?? [];
      }

      const { merged, added } = mergeTxns(baseTxns, allNew);
      const dupes = allNew.length - added;

      const newMeta = {
        files:     [...new Set([...(meta.files || []), ...files.map(f => f.name)])],
        totalTxns: merged.length,
      };

      const saveEntity = isAdmin ? entity : undefined;
      setStatus({ added, dupes, total: merged.length, errors, step: `Saving ${merged.length} transactions to server…` });

      await apiClient.saveTransactions(merged, saveEntity);
      await apiClient.saveMeta(newMeta, saveEntity);

      setStatus({ added, dupes, total: merged.length, errors });
      await new Promise(r => setTimeout(r, 1500));
      onLoaded();

    } catch (e) {
      const msg = (e as Error).message ?? "Unknown error";
      setStatus({ added: 0, dupes: 0, total: 0, errors: [`❌ ${msg}`] });
    } finally {
      setLoading(false);
    }
  }, [transactions, meta, isAdmin, targetEntity, companies, onLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const files = [...e.dataTransfer.files];
    if (isAdmin) {
      setPendingFiles(files);
    } else {
      processFiles(files);
    }
  }, [processFiles, isAdmin]);

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = [...e.target.files];
      if (isAdmin) {
        setPendingFiles(files);
      } else {
        processFiles(files);
      }
    }
    e.target.value = "";
  };

  return (
    <div className="border-b border-slate-200 bg-white px-5 py-3">

      {/* Company picker modal — shown after dropping a file as admin */}
      {pendingFiles && isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-xl bg-white shadow-2xl p-6 w-80">
            <h3 className="text-sm font-bold text-slate-700 mb-1">Upload for which company?</h3>
            <p className="text-xs text-slate-400 mb-4">{pendingFiles.length} file{pendingFiles.length !== 1 ? "s" : ""} selected</p>
            <div className="flex flex-col gap-2">
              {COMPANY_ENTITIES.map(e => (
                <button key={e}
                  onClick={() => {
                    setTargetEntity(e);
                    const files = pendingFiles;
                    setPendingFiles(null);
                    processFiles(files, e);
                  }}
                  className="rounded-lg px-4 py-2.5 text-sm font-semibold bg-slate-100 hover:bg-blue-600 hover:text-white transition-colors text-slate-700 text-left">
                  {e}
                </button>
              ))}
            </div>
            <button onClick={() => setPendingFiles(null)}
              className="mt-4 w-full text-xs text-slate-400 hover:text-slate-600 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start gap-4">
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => document.getElementById("file-input-v2")?.click()}
          className={`flex flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-5 py-3 transition-colors ${
            dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-300"
          }`}
        >
          <span className="text-2xl">📂</span>
          <div>
            <div className="text-sm font-semibold text-slate-700">
              {loading
                ? `Processing files for ${isAdmin ? targetEntity : "your account"}…`
                : "Drop bank extract files here or click to browse"}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              Accepts .xlsx / .xls (Bank Leumi) · .csv (SVB) · Auto-detects currency
            </div>
            <div className="mt-0.5 text-xs font-semibold">
              {serverOk
                ? <span className="text-green-600">✅ Connected — data synced to Supabase</span>
                : <span className="text-red-600">⚠️ Cannot reach server</span>}
            </div>
          </div>
          <input id="file-input-v2" type="file" multiple accept=".xlsx,.xls,.csv" className="hidden" onChange={onInput} />
        </div>

        <div className="w-52 shrink-0">
          <div className="mb-2 flex gap-2">
            <div className="flex-1 rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-center">
              <div className="text-lg font-bold text-green-600">{meta.totalTxns || 0}</div>
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Transactions</div>
            </div>
            <div className="flex-1 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-center">
              <div className="text-lg font-bold text-blue-600">{meta.files?.length || 0}</div>
              <div className="text-[9px] uppercase tracking-wide text-slate-400">Files Loaded</div>
            </div>
          </div>
          {(meta.files?.length || 0) > 0 && (
            <div className="mb-2 max-h-16 overflow-y-auto text-[10px] text-slate-500">
              {meta.files.map((f, i) => (
                <div key={i} className="flex items-center gap-1 truncate">
                  <span className="text-green-500">✓</span>{f}
                </div>
              ))}
            </div>
          )}
          <button onClick={onClear}
            className="w-full rounded border border-red-200 bg-red-50 py-1 text-[10px] font-semibold text-red-700 hover:bg-red-100">
            🗑 Clear All Data
          </button>
        </div>
      </div>

      {status && (
        <div className={`mt-2 rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap ${
          status.errors.length ? "border-red-200 bg-red-50 text-red-700"
          : status.step      ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-green-200 bg-green-50 text-green-700"
        }`}>
          {status.step && !status.errors.length && (
            <div className="mb-1 font-semibold">⏳ {status.step}</div>
          )}
          {!status.step && status.added > 0 && <span>✅ {status.added} new transaction{status.added !== 1 ? "s" : ""} added{isAdmin ? ` to ${targetEntity}` : ""} · </span>}
          {!status.step && status.dupes > 0 && <span>⏭ {status.dupes} duplicate{status.dupes !== 1 ? "s" : ""} skipped · </span>}
          {!status.step && status.total > 0 && <span>Total: {status.total}</span>}
          {!status.step && status.added === 0 && status.dupes === 0 && status.total === 0 && !status.errors.length && <span>No new transactions found</span>}
          {status.errors.map((e, i) => <div key={i} className="mt-1 font-mono">{e}</div>)}
        </div>
      )}
    </div>
  );
}
