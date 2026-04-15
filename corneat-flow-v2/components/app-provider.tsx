"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { computeActiveTxns } from "@/lib/cashflow";
import { makeAdjustment, makeManualEntry } from "@/lib/factories";
import { convertToUSD } from "@/lib/format";
import { runReconciliation, makeEmptyReconStatus } from "@/lib/reconcile";
import type { Transaction, ClassificationRule, ManualEntry, FxRates, ReconStatus, AppData } from "@/lib/types";
import type { Category } from "@/lib/constants";

// ─── CONTEXT TYPES ────────────────────────────────────────────────────────────
interface AppState {
  // raw data
  transactions:  Transaction[];
  adjustments:   Transaction[];
  manualEntries: ManualEntry[];
  rules:         ClassificationRule[];
  meta:          AppData["meta"];
  reconStatus:   ReconStatus;

  // derived
  activeTxns: Transaction[];
  excluded:   Set<string>;
  overrides:  Record<string, Category>;
  fxRates:    FxRates;

  // status
  loading:    boolean;
  serverOk:   boolean;

  // helpers
  toUSD: (amount: number, currency: string) => number;

  // actions
  loadData:           () => Promise<void>;
  saveTransactions:   (txns: Transaction[], meta: AppData["meta"]) => Promise<void>;
  toggleExclude:      (uid: string) => void;
  toggleExcludeMany:  (uids: string[], include: boolean) => void;
  setCatOverride:     (uid: string, cat: Category) => void;
  saveRules:          (rules: ClassificationRule[]) => Promise<void>;
  addAdjustment:      (data: Parameters<typeof makeAdjustment>[0]) => string;
  addManualEntry:     (data: Parameters<typeof makeManualEntry>[0]) => void;
  deleteManualEntry:  (uid: string) => void;
  rerunReconciliation:() => void;
  clearAll:           () => Promise<void>;
  setFxRates:         (r: FxRates) => void;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

// ─── PROVIDER ─────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [adjustments,   setAdjustments]   = useState<Transaction[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [rules,         setRules]         = useState<ClassificationRule[]>([]);
  const [meta,          setMeta]          = useState<AppData["meta"]>({ files: [], totalTxns: 0 });
  const [reconStatus,   setReconStatus]   = useState<ReconStatus>(makeEmptyReconStatus());
  const [excluded,      setExcluded]      = useState<Set<string>>(new Set());
  const [overrides,     setOverrides]     = useState<Record<string, Category>>({});
  const [fxRates,       setFxRates]       = useState<FxRates>({});
  const [loading,       setLoading]       = useState(true);
  const [serverOk,      setServerOk]      = useState(false);

  // ── Load all data on mount ─────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const d = await apiClient.getData();
      setTransactions(d.transactions);
      setAdjustments(d.adjustments);
      setManualEntries(d.manualEntries);
      setRules(d.rules);
      setMeta(d.meta);
      setReconStatus(d.reconStatus || makeEmptyReconStatus());
      setExcluded(new Set(d.excluded));
      setOverrides(d.overrides);
      setServerOk(true);
    } catch {
      setServerOk(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── FX rates (every 60s) ──────────────────────────────────────────────────
  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS,EUR,GBP");
        const j   = await res.json();
        if (j.rates) setFxRates(j.rates);
      } catch { /* silent */ }
    };
    fetch_();
    const id = setInterval(fetch_, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Active transactions (memoised) ───────────────────────────────────────
  const activeTxns = useMemo(
    () => computeActiveTxns(transactions, adjustments, excluded, overrides, rules, fxRates),
    [transactions, adjustments, excluded, overrides, rules, fxRates],
  );

  const toUSD = useCallback(
    (amount: number, currency: string) => convertToUSD(amount, currency, fxRates),
    [fxRates],
  );

  // ── Actions ───────────────────────────────────────────────────────────────
  const saveTransactions = useCallback(async (txns: Transaction[], newMeta: AppData["meta"]) => {
    setTransactions(txns);
    setMeta(newMeta);
    await apiClient.saveTransactions(txns);
    await apiClient.saveMeta(newMeta);
  }, []);

  const toggleExclude = useCallback((uid: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      apiClient.saveExcluded([...next]);
      return next;
    });
  }, []);

  const toggleExcludeMany = useCallback((uids: string[], include: boolean) => {
    setExcluded(prev => {
      const next = new Set(prev);
      uids.forEach(uid => (include ? next.delete(uid) : next.add(uid)));
      apiClient.saveExcluded([...next]);
      return next;
    });
  }, []);

  const setCatOverride = useCallback((uid: string, cat: Category) => {
    setOverrides(prev => {
      const next = { ...prev, [uid]: cat };
      apiClient.saveOverrides(next);
      return next;
    });
  }, []);

  const saveRules = useCallback(async (newRules: ClassificationRule[]) => {
    setRules(newRules);
    await apiClient.saveRules(newRules);
  }, []);

  const addAdjustment = useCallback((data: Parameters<typeof makeAdjustment>[0]): string => {
    const adj = makeAdjustment(data);
    setAdjustments(prev => {
      const next = [...prev, adj];
      apiClient.saveAdjustments(next);
      return next;
    });
    return adj.uid;
  }, []);

  const addManualEntry = useCallback((data: Parameters<typeof makeManualEntry>[0]) => {
    const entry = makeManualEntry(data);
    setManualEntries(prev => {
      const next = [...prev, entry];
      apiClient.saveManualEntries(next);
      return next;
    });
  }, []);

  const deleteManualEntry = useCallback((uid: string) => {
    setManualEntries(prev => {
      const next = prev.filter(e => e.uid !== uid);
      apiClient.saveManualEntries(next);
      return next;
    });
  }, []);

  const rerunReconciliation = useCallback(() => {
    const issues = runReconciliation([...transactions, ...adjustments], excluded, overrides);
    const status: ReconStatus = {
      lastRun:      new Date().toISOString(),
      errorCount:   issues.filter(i => i.severity === "error").length,
      warningCount: issues.filter(i => i.severity === "warning").length,
      issues,
    };
    setReconStatus(status);
    apiClient.saveReconStatus(status);
  }, [transactions, adjustments, excluded, overrides]);

  const clearAll = useCallback(async () => {
    await apiClient.clearAll();
    setTransactions([]); setAdjustments([]); setManualEntries([]);
    setRules([]); setMeta({ files: [], totalTxns: 0 });
    setReconStatus(makeEmptyReconStatus());
    setExcluded(new Set()); setOverrides({});
  }, []);

  const value: AppState = {
    transactions, adjustments, manualEntries, rules, meta, reconStatus,
    activeTxns, excluded, overrides, fxRates,
    loading, serverOk,
    toUSD, loadData,
    saveTransactions, toggleExclude, toggleExcludeMany,
    setCatOverride, saveRules,
    addAdjustment, addManualEntry, deleteManualEntry,
    rerunReconciliation, clearAll, setFxRates,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
