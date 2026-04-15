"use client";

import { useEffect } from "react";
import { fmt } from "@/lib/format";
import { CAT_LABELS, CAT_COLORS, CAT_BG, ENT_COLOR } from "@/lib/constants";
import type { Transaction } from "@/lib/types";

interface Props {
  open:      boolean;
  onClose:   () => void;
  txns:      Transaction[];
  title:     string;
  weekLabel: string;
  entity:    string;
}

export function TransactionDrawer({ open, onClose, txns, title, weekLabel, entity }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const totalIn  = txns.filter(t => t.net > 0).reduce((s, t) => s + t.net, 0);
  const totalOut = txns.filter(t => t.net < 0).reduce((s, t) => s + t.net, 0);
  const net      = txns.reduce((s, t) => s + t.net, 0);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm"
        />
      )}

      {/* Panel */}
      <div
        className="fixed bottom-0 right-0 top-0 z-50 flex flex-col overflow-hidden bg-white shadow-2xl transition-all duration-300"
        style={{ width: open ? 520 : 0 }}
      >
        {open && (
          <>
            {/* Header */}
            <div className="shrink-0 border-b border-slate-700 bg-slate-950 px-5 py-4">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    Transaction Drill-Down
                  </div>
                  <div className="text-[15px] font-bold text-slate-100">{title}</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>📅 {weekLabel}</span>
                    <span>·</span>
                    <span>🏢 {entity}</span>
                    <span>·</span>
                    <span className="font-semibold text-blue-400">USD</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-md border border-white/15 bg-white/7 px-2.5 py-1.5 text-base text-slate-200 hover:bg-white/15 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { l: "Inflows",  v: `+${fmt(totalIn)}`,              c: "#22c55e", bg: "rgba(34,197,94,0.15)" },
                  { l: "Outflows", v: `(${fmt(Math.abs(totalOut))})`,  c: "#f87171", bg: "rgba(239,68,68,0.15)" },
                  { l: "Net",      v: (net >= 0 ? "+" : "") + fmt(net), c: net >= 0 ? "#22c55e" : "#f87171", bg: net >= 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)" },
                ].map(s => (
                  <div key={s.l} className="rounded-lg p-2 text-center" style={{ background: s.bg }}>
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{s.l}</div>
                    <div className="mt-0.5 text-xs font-bold" style={{ color: s.c }}>USD {s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto">
              {txns.length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-slate-400">No transactions found</div>
              ) : (
                txns.map((t, i) => {
                  const ck = t.cat === "intercompany"
                    ? (t.net > 0 ? "intercompany_in" : "intercompany_out")
                    : t.cat;
                  return (
                    <div
                      key={t.uid || i}
                      className="flex items-center gap-3 border-b border-slate-50 px-5 py-2.5 transition-colors hover:bg-slate-50"
                    >
                      {/* Colour bar */}
                      <div
                        className="h-9 w-1 shrink-0 rounded"
                        style={{ background: t.net > 0 ? "#22c55e" : t.net < 0 ? "#ef4444" : "#e2e8f0" }}
                      />

                      {/* Details */}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-slate-800">
                          {t.details || t.contra || "—"}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
                          <span>📅 {t.date}</span>
                          <span>🏦 {t.account}</span>
                          {entity === "Consolidated" && (
                            <span className="font-semibold" style={{ color: ENT_COLOR[t.entity] || "#64748b" }}>
                              • {t.entity}
                            </span>
                          )}
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                            style={{ background: CAT_BG[ck] || "#f1f5f9", color: CAT_COLORS[ck] || "#64748b" }}
                          >
                            {CAT_LABELS[ck] || t.cat}
                          </span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="shrink-0 text-right">
                        <div
                          className="text-[13px] font-bold"
                          style={{ color: t.net > 0 ? "#16a34a" : t.net < 0 ? "#dc2626" : "#94a3b8" }}
                        >
                          {t.net > 0 ? "+" : ""}{fmt(t.net)}
                        </div>
                        <div className="mt-0.5 text-[9px] text-slate-400">
                          <span className="font-bold text-blue-500">{t.currency}</span>
                          {t.debit  > 0 && <span className="ml-1 text-green-600">Dr {fmt(t.debit)}</span>}
                          {t.credit > 0 && <span className="ml-1 text-red-600">Cr {fmt(t.credit)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="shrink-0 flex justify-between border-t border-slate-100 bg-slate-50 px-5 py-2 text-[10px] text-slate-400">
              <span>{txns.length} transaction{txns.length !== 1 ? "s" : ""}</span>
              <span>Dr = Cash In · Cr = Cash Out</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
