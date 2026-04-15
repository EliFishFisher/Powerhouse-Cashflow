"use client";

import { useState, useRef, useEffect } from "react";
import type { FxRates } from "@/lib/types";

const CURRENCIES = [
  { code: "USD", symbol: "$",  label: "US Dollar"       },
  { code: "ILS", symbol: "₪",  label: "Israeli Shekel"  },
  { code: "EUR", symbol: "€",  label: "Euro"            },
  { code: "GBP", symbol: "£",  label: "British Pound"   },
  { code: "CHF", symbol: "₣",  label: "Swiss Franc"     },
  { code: "JPY", symbol: "¥",  label: "Japanese Yen"    },
  { code: "CAD", symbol: "C$", label: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar" },
];

interface Props {
  reportingCurrency: string;
  fxRates:           FxRates;
  onChangeCurrency:  (ccy: string)   => void;
  onChangeRates:     (rates: FxRates) => void;
}

export function CurrencySelector({ reportingCurrency, fxRates, onChangeCurrency, onChangeRates }: Props) {
  const [open,  setOpen]  = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);

  // Sync draft when popover opens
  useEffect(() => {
    if (open) {
      const d: Record<string, string> = {};
      CURRENCIES.forEach(c => {
        if (c.code !== "USD") d[c.code] = String(fxRates[c.code] ?? "");
      });
      setDraft(d);
    }
  }, [open, fxRates]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const apply = () => {
    const next: FxRates = { ...fxRates };
    CURRENCIES.forEach(c => {
      if (c.code !== "USD") {
        const v = parseFloat(draft[c.code] ?? "");
        if (!isNaN(v) && v > 0) next[c.code] = v;
      }
    });
    onChangeRates(next);
    setOpen(false);
  };

  const cur = CURRENCIES.find(c => c.code === reportingCurrency) ?? CURRENCIES[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 hover:bg-blue-500/20 transition-colors cursor-pointer"
        title="Change reporting currency"
      >
        <span className="text-[10px] font-bold text-blue-300">{cur.symbol} {cur.code}</span>
        <span className="text-[9px] text-slate-500">Reporting</span>
        <span className="text-[8px] text-blue-400/60">▾</span>
      </button>

      {/* Popover */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 200,
          background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10,
          width: 290, boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
          padding: "14px 16px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>
            Reporting Currency
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CURRENCIES.map(c => {
              const isSelected = reportingCurrency === c.code;
              return (
                <div key={c.code} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Radio + label */}
                  <button
                    onClick={() => onChangeCurrency(c.code)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", gap: 7,
                      background: isSelected ? "rgba(59,130,246,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${isSelected ? "#3b82f6" : "#1e293b"}`,
                      borderRadius: 6, padding: "5px 8px", cursor: "pointer", transition: "all 0.15s",
                    }}
                  >
                    <span style={{
                      width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
                      border: `2px solid ${isSelected ? "#3b82f6" : "#334155"}`,
                      background: isSelected ? "#3b82f6" : "transparent",
                      display: "inline-block",
                    }} />
                    <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 400, color: isSelected ? "#93c5fd" : "#94a3b8" }}>
                      {c.symbol} {c.code}
                    </span>
                    <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>
                      {c.label}
                    </span>
                  </button>

                  {/* Rate input (not shown for USD) */}
                  {c.code !== "USD" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: 9, color: "#475569" }}>$1=</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft[c.code] ?? ""}
                        onChange={e => setDraft(d => ({ ...d, [c.code]: e.target.value }))}
                        placeholder="rate"
                        style={{
                          width: 56, height: 26, fontSize: 11, fontWeight: 600,
                          background: "#1e293b", border: "1px solid #334155",
                          borderRadius: 5, color: "#e2e8f0", paddingLeft: 6, paddingRight: 4,
                          outline: "none",
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            <button
              onClick={apply}
              style={{
                flex: 1, height: 30, background: "#3b82f6", color: "#fff",
                border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Apply
            </button>
            <button
              onClick={() => setOpen(false)}
              style={{
                height: 30, padding: "0 12px", background: "transparent", color: "#64748b",
                border: "1px solid #1e293b", borderRadius: 6, fontSize: 11, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>

          <div style={{ marginTop: 8, fontSize: 9, color: "#334155" }}>
            Rates saved locally · Enter 1 USD = X {reportingCurrency !== "USD" ? reportingCurrency : "foreign"}
          </div>
        </div>
      )}
    </div>
  );
}
