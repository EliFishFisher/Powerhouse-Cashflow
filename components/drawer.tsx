"use client";

import { useEffect, useState, useCallback } from "react";
import { fmt } from "@/lib/format";
import { CAT_LABELS, CAT_COLORS, CAT_BG, ENT_COLOR, ALL_CATS } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { Transaction } from "@/lib/types";

interface Props {
  open:            boolean;
  onClose:         () => void;
  txns:            Transaction[];
  title:           string;
  weekLabel:       string;
  entity:          string;
  overrides?:      Record<string, Category>;
  onReclassify?:   (uid: string, cat: Category) => void;
  onExclude?:      (uid: string) => void;
  excluded?:       Set<string>;
}

export function Drawer({
  open, onClose, txns, title, weekLabel, entity,
  overrides = {}, onReclassify, onExclude, excluded = new Set(),
}: Props) {
  const [selected, setSelected] = useState<Transaction | null>(null);
  const [catDraft,  setCatDraft]  = useState<Category>("other");
  const [saving,    setSaving]    = useState(false);

  // Close inner panel on drawer close
  useEffect(() => { if (!open) setSelected(null); }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, selected]);

  const openDetail = useCallback((t: Transaction) => {
    setSelected(t);
    setCatDraft((overrides[t.uid] ?? t.cat) as Category);
  }, [overrides]);

  const handleSaveCat = useCallback(async () => {
    if (!selected || !onReclassify) return;
    setSaving(true);
    try { onReclassify(selected.uid, catDraft); setSelected(null); }
    finally { setSaving(false); }
  }, [selected, catDraft, onReclassify]);

  const handleExclude = useCallback(() => {
    if (!selected || !onExclude) return;
    onExclude(selected.uid);
    setSelected(null);
  }, [selected, onExclude]);

  const totalIn  = txns.filter(t => t.net > 0).reduce((s, t) => s + t.net, 0);
  const totalOut = txns.filter(t => t.net < 0).reduce((s, t) => s + t.net, 0);
  const net      = txns.reduce((s, t) => s + t.net, 0);

  return (
    <>
      {open && (
        <div onClick={() => { if (selected) setSelected(null); else onClose(); }}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" />
      )}

      <div
        className="fixed right-0 top-0 bottom-0 z-50 flex bg-white shadow-2xl transition-[width] duration-300"
        style={{ width: open ? 520 : 0, overflow: "hidden" }}
      >
        {open && (
          <div className="flex flex-col w-full relative">

            {/* ── Header ───────────────────────────────────────────────────── */}
            <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-5 pb-3 pt-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Transaction Drill-Down
                  </div>
                  <div className="text-[15px] font-bold text-slate-100">{title}</div>
                  <div className="mt-1 flex gap-2.5 text-[11px] text-slate-400">
                    <span>📅 {weekLabel}</span>
                    <span>·</span>
                    <span>🏢 {entity}</span>
                    <span>·</span>
                    <span className="font-semibold text-blue-400">USD</span>
                  </div>
                </div>
                <button onClick={onClose}
                  className="rounded border border-white/15 bg-white/7 px-2 py-1 text-base text-slate-200 hover:bg-white/15">
                  ✕
                </button>
              </div>

              {/* KPI mini-cards */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { l: "Inflows",  v: `+${fmt(totalIn)}`,               c: "#22c55e", bg: "rgba(34,197,94,0.15)"  },
                  { l: "Outflows", v: `(${fmt(Math.abs(totalOut))})`,   c: "#f87171", bg: "rgba(239,68,68,0.15)" },
                  { l: "Net",      v: (net >= 0 ? "+" : "") + fmt(net), c: net >= 0 ? "#22c55e" : "#f87171", bg: net >= 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)" },
                ].map(s => (
                  <div key={s.l} className="rounded-lg px-3 py-1.5 text-center" style={{ background: s.bg }}>
                    <div className="text-[9px] font-semibold uppercase text-slate-400">{s.l}</div>
                    <div className="mt-0.5 text-xs font-bold" style={{ color: s.c }}>USD {s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Transaction list ─────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">
              {txns.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-400">No transactions found</div>
              ) : (
                txns.map((t, i) => {
                  const effCat = (overrides[t.uid] ?? t.cat) as Category;
                  const ck = effCat === "intercompany" ? (t.net > 0 ? "intercompany_in" : "intercompany_out") : effCat;
                  const isExcluded = excluded.has(t.uid);
                  const isSelected = selected?.uid === t.uid;
                  return (
                    <div
                      key={t.uid || i}
                      onClick={() => openDetail(t)}
                      className="flex items-center gap-2.5 border-b border-slate-50 px-5 py-2.5 transition-colors cursor-pointer"
                      style={{
                        background: isSelected ? "#f0f9ff" : isExcluded ? "#f8fafc" : undefined,
                        opacity: isExcluded ? 0.45 : 1,
                      }}
                    >
                      <div className="h-9 w-1 shrink-0 rounded-full"
                        style={{ background: t.net > 0 ? "#22c55e" : t.net < 0 ? "#ef4444" : "#e2e8f0" }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-800">
                          {t.details || t.contra || "—"}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                          <span>📅 {t.date}</span>
                          {t.account && t.account !== t.details && <span>🏦 {t.account}</span>}
                          {entity === "Consolidated" && (
                            <span className="font-semibold" style={{ color: ENT_COLOR[t.entity] }}>
                              • {t.entity}
                            </span>
                          )}
                          <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: CAT_BG[ck] || "#f1f5f9", color: CAT_COLORS[ck] || "#64748b" }}>
                            {CAT_LABELS[effCat] || effCat}
                          </span>
                          {isExcluded && (
                            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">EXCLUDED</span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-bold"
                          style={{ color: t.net > 0 ? "#16a34a" : t.net < 0 ? "#dc2626" : "#94a3b8" }}>
                          {t.net > 0 ? "+" : ""}{fmt(t.net)}
                        </div>
                        <div className="mt-0.5 text-[9px] text-slate-400">
                          <span className="font-bold text-blue-500">{t.currency}</span>
                        </div>
                      </div>
                      {/* Chevron hint */}
                      <span className="text-slate-300 text-xs shrink-0">›</span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex justify-between border-t border-slate-100 bg-slate-50 px-5 py-2 text-[10px] text-slate-400">
              <span>{txns.length} transaction{txns.length !== 1 ? "s" : ""}</span>
              <span>Click any row for details & reclassify</span>
            </div>

            {/* ── Transaction Detail panel — slides over the list ───────────── */}
            <div
              className="absolute inset-0 flex flex-col bg-white transition-transform duration-250"
              style={{ transform: selected ? "translateX(0)" : "translateX(100%)" }}
            >
              {selected && <TxnDetail
                txn={selected}
                effCat={catDraft}
                saving={saving}
                isExcluded={excluded.has(selected.uid)}
                canEdit={!!onReclassify}
                canExclude={!!onExclude}
                onBack={() => setSelected(null)}
                onCatChange={setCatDraft}
                onSave={handleSaveCat}
                onExclude={handleExclude}
              />}
            </div>

          </div>
        )}
      </div>
    </>
  );
}

// ─── Transaction Detail Sub-panel ─────────────────────────────────────────────
function TxnDetail({
  txn, effCat, saving, isExcluded, canEdit, canExclude,
  onBack, onCatChange, onSave, onExclude,
}: {
  txn:        Transaction;
  effCat:     Category;
  saving:     boolean;
  isExcluded: boolean;
  canEdit:    boolean;
  canExclude: boolean;
  onBack:     () => void;
  onCatChange:(c: Category) => void;
  onSave:     () => void;
  onExclude:  () => void;
}) {
  const ck = effCat === "intercompany" ? (txn.net > 0 ? "intercompany_in" : "intercompany_out") : effCat;

  const fields: [string, string][] = [
    ["Date",        txn.date],
    ["Entity",      txn.entity],
    ["Account",     txn.account],
    ["Contra",      txn.contra].filter(([,v]) => v) as [string,string],
    ["Currency",    txn.currency],
    ["Reference",   txn.journalNo],
    ["Source file", txn.sourceFile],
    ["Sheet",       txn.sourceSheet],
  ].filter((row): row is [string, string] => Array.isArray(row) && !!row[1]);

  return (
    <div className="flex flex-col h-full">

      {/* Sub-header */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-5 pb-3 pt-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack}
            className="rounded border border-white/15 bg-white/7 px-2 py-1 text-xs text-slate-300 hover:bg-white/15 flex items-center gap-1">
            ‹ Back
          </button>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Transaction Detail
          </div>
        </div>

        {/* Amount display */}
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-black" style={{ color: txn.net > 0 ? "#22c55e" : "#f87171" }}>
            {txn.net > 0 ? "+" : ""}{fmt(txn.net)}
          </span>
          <span className="text-sm font-bold text-blue-400">{txn.currency}</span>
        </div>

        {/* Description */}
        <div className="mt-1 text-sm font-semibold text-slate-100 leading-snug">
          {txn.details || txn.contra || txn.account || "—"}
        </div>

        {/* Current category badge */}
        <div className="mt-2">
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ background: CAT_BG[ck] || "#f1f5f9", color: CAT_COLORS[ck] || "#64748b" }}>
            {CAT_LABELS[effCat] || effCat}
          </span>
          {isExcluded && (
            <span className="ml-2 rounded-full bg-slate-700 px-2.5 py-1 text-[10px] font-bold text-slate-300">
              EXCLUDED
            </span>
          )}
        </div>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

        {/* Amounts breakdown */}
        <div>
          <SectionLabel>Amounts</SectionLabel>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {[
              { l: "Debit (in)",  v: txn.debit,  c: "#16a34a" },
              { l: "Credit (out)", v: txn.credit, c: "#dc2626" },
              { l: "Net",          v: txn.net,    c: txn.net >= 0 ? "#16a34a" : "#dc2626" },
            ].map(({ l, v, c }) => (
              <div key={l} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center">
                <div className="text-[9px] uppercase tracking-wide text-slate-400">{l}</div>
                <div className="mt-0.5 text-xs font-bold" style={{ color: c }}>
                  {v > 0 ? "" : v < 0 ? "(" : ""}{fmt(Math.abs(v))}{v < 0 ? ")" : ""}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Details table */}
        <div>
          <SectionLabel>Details</SectionLabel>
          <div className="mt-2 rounded-lg border border-slate-100 overflow-hidden">
            {fields.map(([label, value]) => (
              <div key={label} className="flex border-b border-slate-50 last:border-b-0">
                <div className="w-28 shrink-0 bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500">{label}</div>
                <div className="flex-1 px-3 py-2 text-xs text-slate-700 break-all">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Reclassify */}
        {canEdit && (
          <div>
            <SectionLabel>Change Category</SectionLabel>
            <div className="mt-2 space-y-2">
              <select
                value={effCat}
                onChange={e => onCatChange(e.target.value as Category)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-400"
              >
                {ALL_CATS.map(c => (
                  <option key={c} value={c}>{CAT_LABELS[c] || c}</option>
                ))}
              </select>

              {/* Preview badge */}
              {(() => {
                const pk = effCat === "intercompany" ? (txn.net > 0 ? "intercompany_in" : "intercompany_out") : effCat;
                return (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>Preview:</span>
                    <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold"
                      style={{ background: CAT_BG[pk] || "#f1f5f9", color: CAT_COLORS[pk] || "#64748b" }}>
                      {CAT_LABELS[effCat] || effCat}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </div>

      {/* Action footer */}
      <div className="shrink-0 border-t border-slate-100 bg-slate-50 px-5 py-3 space-y-2">
        {canEdit && (
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full rounded-lg py-2.5 text-sm font-bold text-white transition-colors"
            style={{ background: saving ? "#94a3b8" : "#1e293b" }}
          >
            {saving ? "Saving…" : "Save Category"}
          </button>
        )}

        {canExclude && (
          <button
            onClick={onExclude}
            className="w-full rounded-lg border py-2 text-xs font-semibold transition-colors"
            style={{
              borderColor: isExcluded ? "#22c55e" : "#fecaca",
              color:       isExcluded ? "#16a34a" : "#dc2626",
              background:  isExcluded ? "#f0fdf4" : "#fef2f2",
            }}
          >
            {isExcluded ? "✓ Restore transaction" : "Exclude from cashflow"}
          </button>
        )}

        <p className="text-center text-[9px] text-slate-400">
          Category changes take effect immediately in the cashflow view
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
      {children}
    </div>
  );
}
