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

export function DrillDownDrawer({ open, onClose, txns, title, weekLabel, entity }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const totalIn  = txns.filter(t => t.net > 0).reduce((s, t) => s + t.net, 0);
  const totalOut = txns.filter(t => t.net < 0).reduce((s, t) => s + t.net, 0);
  const net      = txns.reduce((s, t) => s + t.net, 0);

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/50 z-40 backdrop-blur-sm"
        />
      )}
      <div
        className="fixed top-0 right-0 bottom-0 bg-white z-50 flex flex-col shadow-2xl transition-all duration-250"
        style={{ width: open ? 520 : 0, overflow: "hidden" }}
      >
        {open && (
          <>
            {/* Header */}
            <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest mb-1">
                    Transaction Drill-Down
                  </div>
                  <div className="text-[15px] font-bold text-slate-100">{title}</div>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                    <span>📅 {weekLabel}</span>
                    <span>·</span>
                    <span>🏢 {entity}</span>
                    <span>·</span>
                    <span className="text-blue-400 font-semibold">USD</span>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="bg-white/10 border border-white/20 text-slate-200 rounded-md px-2.5 py-1.5 text-base hover:bg-white/20 transition-colors"
                >
                  ✕
                </button>
              </div>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: "Inflows",  v: `+${fmt(totalIn)}`,              c: "#22c55e", bg: "rgba(34,197,94,0.15)"  },
                  { l: "Outflows", v: `(${fmt(Math.abs(totalOut))})`,  c: "#f87171", bg: "rgba(239,68,68,0.15)"  },
                  { l: "Net",      v: (net >= 0 ? "+" : "") + fmt(net),
                    c: net >= 0 ? "#22c55e" : "#f87171",
                    bg: net >= 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)" },
                ].map(s => (
                  <div key={s.l} className="rounded-lg p-2 text-center" style={{ background: s.bg }}>
                    <div className="text-[9px] text-slate-400 font-semibold uppercase">{s.l}</div>
                    <div className="text-xs font-bold mt-0.5" style={{ color: s.c }}>USD {s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transaction list */}
            <div className="overflow-y-auto flex-1">
              {txns.length === 0 ? (
                <div className="p-10 text-center text-slate-400 text-sm">No transactions found</div>
              ) : (
                txns.map((t, i) => {
                  const ck = t.cat === "intercompany"
                    ? (t.net > 0 ? "intercompany_in" : "intercompany_out")
                    : t.cat;
                  return (
                    <div
                      key={t.uid || i}
                      className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    >
                      <div
                        className="w-1 h-9 rounded-full shrink-0"
                        style={{ background: t.net > 0 ? "#22c55e" : t.net < 0 ? "#ef4444" : "#e2e8f0" }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">
                          {t.details || t.contra || "—"}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                          <span>📅 {t.date}</span>
                          <span>🏦 {t.account}</span>
                          {entity === "Consolidated" && (
                            <span className="font-semibold" style={{ color: ENT_COLOR[t.entity] }}>
                              • {t.entity}
                            </span>
                          )}
                          <span
                            className="px-1.5 py-px rounded-full text-[9px] font-semibold"
                            style={{ background: CAT_BG[ck] || "#f1f5f9", color: CAT_COLORS[ck] || "#64748b" }}
                          >
                            {CAT_LABELS[ck] || t.cat}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-[13px] font-bold"
                          style={{ color: t.net > 0 ? "#16a34a" : t.net < 0 ? "#dc2626" : "#94a3b8" }}
                        >
                          {t.net > 0 ? "+" : ""}{fmt(t.net)}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          <span className="font-bold text-blue-500">{t.currency}</span>
                          {t.debit  > 0 && <span className="ml-1 text-emerald-600">Dr {fmt(t.debit)}</span>}
                          {t.credit > 0 && <span className="ml-1 text-red-600">Cr {fmt(t.credit)}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-2 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-between text-[10px] text-slate-400">
              <span>{txns.length} transaction{txns.length !== 1 ? "s" : ""}</span>
              <span>Dr = Cash In · Cr = Cash Out</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
