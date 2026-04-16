"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { AppData, FxRates, BankBalance, Subsidiary } from "@/lib/types";
import type { Category } from "@/lib/constants";
import type { ClassificationRule } from "@/lib/types";

export interface CompanyEntry {
  entity_name: string;
  user_id:     string;
  data:        AppData;
}

const EMPTY: AppData = {
  transactions:  [],
  meta:          { files: [], totalTxns: 0 },
  excluded:      [],
  overrides:     {},
  adjustments:   [],
  manualEntries: [],
  reconStatus:   { lastRun: null, errorCount: 0, warningCount: 0, issues: [] },
  rules:         [],
  bankBalances:  [],
  subsidiaries:  [],
};

function mergeCompanyData(companies: CompanyEntry[]): AppData {
  return {
    transactions:  companies.flatMap(c => c.data.transactions  ?? []),
    adjustments:   companies.flatMap(c => c.data.adjustments   ?? []),
    manualEntries: companies.flatMap(c => c.data.manualEntries ?? []),
    // Each company has its own rules — merge all of them
    rules:         companies.flatMap(c => c.data.rules         ?? []),
    excluded:      companies.flatMap(c => c.data.excluded      ?? []),
    overrides:     Object.assign({}, ...companies.map(c => c.data.overrides ?? {})),
    // Bank balances merged from all companies
    bankBalances:  companies.flatMap(c => c.data.bankBalances  ?? []),
    // Subsidiaries: take from whichever company row has them (admin row typically)
    subsidiaries:  companies.flatMap(c => c.data.subsidiaries  ?? []),
    meta: {
      files:     companies.flatMap(c => c.data.meta?.files ?? []),
      totalTxns: companies.reduce((s, c) => s + (c.data.meta?.totalTxns ?? 0), 0),
    },
    reconStatus: companies[0]?.data.reconStatus ?? EMPTY.reconStatus,
  };
}

// Default FX rates (1 USD = X foreign). User can override via the currency selector.
const DEFAULT_FX_RATES: FxRates = { ILS: 3.72, EUR: 0.92, GBP: 0.79, CHF: 0.88, JPY: 149, CAD: 1.36, AUD: 1.53 };

function loadFxFromStorage(): FxRates {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem("ph_fx_rates") : null;
    return raw ? { ...DEFAULT_FX_RATES, ...JSON.parse(raw) } : DEFAULT_FX_RATES;
  } catch { return DEFAULT_FX_RATES; }
}

function loadCcyFromStorage(): string {
  try {
    return (typeof window !== "undefined" && localStorage.getItem("ph_reporting_ccy")) || "USD";
  } catch { return "USD"; }
}

export function useAppData() {
  const [data,               setData]               = useState<AppData>(EMPTY);
  const [loading,            setLoading]            = useState(true);
  const [serverOk,           setServerOk]           = useState(false);
  const [fxRates,            setFxRatesState]       = useState<FxRates>(DEFAULT_FX_RATES);
  const [reportingCurrency,  setReportingCurrencyS] = useState<string>("USD");
  const [excluded,           setExcluded]           = useState<Set<string>>(new Set());
  const [overrides,          setOverrides]          = useState<Record<string, Category>>({});
  const [isAdmin,            setIsAdmin]            = useState(false);
  const [companies,          setCompanies]          = useState<CompanyEntry[]>([]);

  // Load persisted FX prefs on first mount, then fetch live rates
  useEffect(() => {
    setFxRatesState(loadFxFromStorage());
    setReportingCurrencyS(loadCcyFromStorage());

    // Fetch live rates from our server-side proxy (avoids CORS)
    // Skip if cached rates are still fresh (< 23h old)
    const fetchLiveRates = async () => {
      try {
        const res = await fetch("/api/fx-rates");
        if (!res.ok) return;
        const json = await res.json() as { rates: Record<string, number>; fetchedAt: number };
        if (json.rates && Object.keys(json.rates).length > 0) {
          setFxRatesState(prev => ({ ...prev, ...json.rates }));
          try { localStorage.setItem("ph_fx_rates", JSON.stringify({ ...loadFxFromStorage(), ...json.rates })); } catch {}
          try { localStorage.setItem("ph_fx_fetched_at", String(json.fetchedAt)); } catch {}
        }
      } catch { /* silently ignore — fallback rates remain active */ }
    };

    // Only re-fetch if last live fetch was > 23h ago
    const lastFetch = typeof window !== "undefined" ? Number(localStorage.getItem("ph_fx_fetched_at") || 0) : 0;
    if (Date.now() - lastFetch > 23 * 60 * 60 * 1000) {
      fetchLiveRates();
    }
  }, []);

  // Reporting rate: multiply a USD amount by this to get the display currency amount
  const reportingRate = reportingCurrency === "USD" ? 1 : (fxRates[reportingCurrency] ?? 1);

  const setFxRates = useCallback((rates: FxRates) => {
    setFxRatesState(rates);
    try { localStorage.setItem("ph_fx_rates", JSON.stringify(rates)); } catch {}
  }, []);

  const setReportingCurrency = useCallback((ccy: string) => {
    setReportingCurrencyS(ccy);
    try { localStorage.setItem("ph_reporting_ccy", ccy); } catch {}
  }, []);

  // ── Core fetch logic (shared by mount + refresh) ──────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const d = await apiClient.getData();

      if (d.isAdmin && d.companies) {
        const cos = d.companies as CompanyEntry[];
        setIsAdmin(true);
        setCompanies(cos);
        const merged = mergeCompanyData(cos);
        setData(merged);
        setExcluded(new Set(merged.excluded));
        setOverrides(merged.overrides);
      } else {
        setIsAdmin(false);
        setCompanies([]);
        if (!d.reconStatus)   d.reconStatus   = { lastRun: null, errorCount: 0, warningCount: 0, issues: [] };
        if (!d.adjustments)   d.adjustments   = [];
        if (!d.manualEntries) d.manualEntries = [];
        if (!d.rules)         d.rules         = [];
        if (!d.bankBalances)  d.bankBalances  = [];
        if (!d.subsidiaries)  d.subsidiaries  = [];
        setData(d);
        setExcluded(new Set(d.excluded));
        setOverrides(d.overrides);
      }
      setServerOk(true);
    } catch {
      setServerOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load all data on mount ────────────────────────────────────────────────
  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Refresh function (called after uploads) ───────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchData();
  }, [fetchData]);

  // FX rates intentionally disabled — external API blocked/CORS restricted

  // ── Exclude toggle ────────────────────────────────────────────────────────
  const toggleExclude = useCallback((uid: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      apiClient.saveExcluded([...next]);
      return next;
    });
  }, []);

  // ── Category override ─────────────────────────────────────────────────────
  const setCatOverride = useCallback((uid: string, cat: Category) => {
    setOverrides(prev => {
      const next = { ...prev, [uid]: cat };
      apiClient.saveOverrides(next);
      return next;
    });
  }, []);

  const removeCatOverride = useCallback((uid: string) => {
    setOverrides(prev => {
      const next = { ...prev };
      delete next[uid];
      apiClient.saveOverrides(next);
      return next;
    });
  }, []);

  const saveTransactions = useCallback(async (txns: AppData["transactions"], targetEntity?: string) => {
    setData(d => ({ ...d, transactions: txns }));
    await apiClient.saveTransactions(txns, targetEntity);
  }, []);

  // ── Rules — per entity for admin ──────────────────────────────────────────
  // When targetEntity is provided (admin), saves only to that company's row.
  // The local state is updated optimistically.
  const saveRules = useCallback(async (rules: ClassificationRule[], targetEntity?: string) => {
    if (isAdmin && targetEntity && companies.length > 0) {
      // Optimistic update: replace the targeted company's rules in local state
      const updatedCompanies = companies.map(c =>
        c.entity_name === targetEntity ? { ...c, data: { ...c.data, rules } } : c
      );
      setCompanies(updatedCompanies);
      setData(mergeCompanyData(updatedCompanies));
    } else {
      setData(d => ({ ...d, rules }));
    }
    await apiClient.saveRules(rules, targetEntity);
  }, [isAdmin, companies]);

  // ── Bank Balances ─────────────────────────────────────────────────────────
  const saveBankBalances = useCallback(async (
    incoming: BankBalance[],
    targetEntity?: string,
  ) => {
    // Merge incoming with existing, deduplicating by uid
    const existing = targetEntity
      ? (companies.find(c => c.entity_name === targetEntity)?.data.bankBalances ?? [])
      : data.bankBalances;
    const map = new Map(existing.map(b => [b.uid, b]));
    for (const b of incoming) map.set(b.uid, b);
    const merged = [...map.values()];

    if (isAdmin && targetEntity) {
      const updatedCompanies = companies.map(c =>
        c.entity_name === targetEntity ? { ...c, data: { ...c.data, bankBalances: merged } } : c
      );
      setCompanies(updatedCompanies);
      setData(mergeCompanyData(updatedCompanies));
    } else {
      setData(d => ({ ...d, bankBalances: merged }));
    }
    await apiClient.saveBankBalances(merged, targetEntity);
  }, [isAdmin, companies, data.bankBalances]);

  // ── Subsidiaries ──────────────────────────────────────────────────────────
  const saveSubsidiaries = useCallback(async (subs: Subsidiary[]) => {
    setData(d => ({ ...d, subsidiaries: subs }));
    if (isAdmin && companies.length > 0) {
      // Persist subsidiaries in the admin's own row (first company = Consolidated)
      // We target the admin row by not passing targetEntity (saves to admin's own user_id)
    }
    await apiClient.saveSubsidiaries(subs);
  }, [isAdmin, companies]);

  const clearAll = useCallback(async () => {
    await apiClient.clearAll();
    setData(EMPTY);
    setExcluded(new Set());
    setOverrides({});
  }, []);

  return {
    data, loading, serverOk,
    fxRates, setFxRates,
    reportingCurrency, reportingRate, setReportingCurrency,
    excluded, overrides,
    isAdmin, companies,
    toggleExclude, setCatOverride, removeCatOverride,
    saveTransactions, saveRules, saveBankBalances, saveSubsidiaries,
    clearAll, refresh,
  };
}
