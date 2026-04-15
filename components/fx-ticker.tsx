"use client";

import { useState, useEffect, useCallback } from "react";
import type { FxRates } from "@/types";

const FX_PAIRS = [
  { quote: "ILS" as keyof FxRates, label: "USD/ILS", flag: "🇮🇱", dp: 3 },
  { quote: "EUR" as keyof FxRates, label: "USD/EUR", flag: "🇪🇺", dp: 4 },
  { quote: "GBP" as keyof FxRates, label: "USD/GBP", flag: "🇬🇧", dp: 4 },
];

interface Props {
  onRates?: (rates: FxRates) => void;
}

export function FxTicker({ onRates }: Props) {
  const [rates,     setRates]     = useState<FxRates>({});
  const [prevRates, setPrevRates] = useState<FxRates>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [status,    setStatus]    = useState<"loading" | "ok" | "error">("loading");

  const fetchRates = useCallback(async () => {
    try {
      const res  = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS,EUR,GBP");
      const data = await res.json();
      if (data.rates) {
        setPrevRates(r => Object.keys(r).length ? r : data.rates);
        setRates(prev => { setPrevRates(prev); return data.rates; });
        setUpdatedAt(new Date());
        setStatus("ok");
        onRates?.(data.rates);
      }
    } catch {
      setStatus("error");
    }
  }, [onRates]);

  useEffect(() => {
    fetchRates();
    const id = setInterval(fetchRates, 60_000);
    return () => clearInterval(id);
  }, [fetchRates]);

  if (status === "loading" || status === "error") {
    return null;
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1">
      {FX_PAIRS.map(({ quote, label, flag, dp }) => {
        const rate = rates[quote];
        const prev = prevRates[quote];
        const dir  = prev && rate ? (rate > prev ? "up" : rate < prev ? "down" : "flat") : "flat";

        return (
          <div
            key={quote}
            className="flex items-center gap-1.5 border-r border-white/10 px-2 last:border-r-0"
          >
            <span className="text-[11px]">{flag}</span>
            <span className="text-[9px] font-semibold text-slate-500">{label}</span>
            <span className={`font-mono text-[11px] font-bold ${
              dir === "up"   ? "text-green-400" :
              dir === "down" ? "text-red-400"   : "text-slate-400"
            }`}>
              {rate ? rate.toFixed(dp) : "—"}
            </span>
            <span className={`text-[9px] ${
              dir === "up"   ? "text-green-400" :
              dir === "down" ? "text-red-400"   : "text-slate-500"
            }`}>
              {dir === "up" ? "▲" : dir === "down" ? "▼" : "—"}
            </span>
          </div>
        );
      })}

      {updatedAt && (
        <span className="ml-1 text-[8px] text-slate-600">
          {updatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}

      <button
        onClick={fetchRates}
        title="Refresh rates"
        className="ml-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
      >
        ↻
      </button>
    </div>
  );
}
