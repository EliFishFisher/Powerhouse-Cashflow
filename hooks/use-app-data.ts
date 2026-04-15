"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { AppData, FxRates } from "@/lib/types";
import type { Category } from "@/lib/constants";

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
};

function mergeCompanyData(companies: CompanyEntry[]): AppData {
  return {
    transactions:  companies.flatMap(c => c.data.transactions  ?? []),
    adjustments:   companies.flatMap(c => c.data.adjustments   ?? []),
    manualEntries: companies.flatMap(c => c.data.manualEntries ?? []),
    rules:         companies[0]?.data.rules         ?? [],
    excluded:      companies.flatMap(c => c.data.excluded      ?? []),
    overrides:     Object.assign({}, ...companies.map(c => c.data.overrides ?? {})),
    meta: {
      files:     companies.flatMap(c => c.data.meta?.files ?? []),
      totalTxns: companies.reduce((s, c) => s + (c.data.meta?.totalTxns ?? 0), 0),
    },
    reconStatus: companies[0]?.data.reconStatus ?? EMPTY.reconStatus,
  };
}

export function useAppData() {
  const [data,      setData]      = useState<AppData>(EMPTY);
  const [loading,   setLoading]   = useState(true);
  const [serverOk,  setServerOk]  = useState(false);
  const [fxRates,   setFxRates]   = useState<FxRates>({});
  const [excluded,  setExcluded]  = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, Category>>({});
  const [isAdmin,   setIsAdmin]   = useState(false);
  const [companies, setCompanies] = useState<CompanyEntry[]>([]);

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

  const saveRules = useCallback(async (rules: AppData["rules"]) => {
    setData(d => ({ ...d, rules }));
    await apiClient.saveRules(rules);
  }, []);

  const clearAll = useCallback(async () => {
    await apiClient.clearAll();
    setData(EMPTY);
    setExcluded(new Set());
    setOverrides({});
  }, []);

  return {
    data, loading, serverOk, fxRates, setFxRates,
    excluded, overrides,
    isAdmin, companies,
    toggleExclude, setCatOverride, removeCatOverride,
    saveTransactions, saveRules, clearAll, refresh,
  };
}
