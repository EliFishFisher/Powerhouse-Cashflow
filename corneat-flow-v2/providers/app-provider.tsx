"use client";

import {
  createContext, useContext, useState, useEffect,
  useCallback, useMemo, useRef,
} from "react";
import { apiClient } from "@/lib/api-client";
import { computeActiveTxns } from "@/lib/cashflow";
import { runReconciliation } from "@/lib/reconcile";
import { makeAdjustment, makeManualEntry } from "@/lib/factories";
import { mergeTxns } from "@/lib/parsers";
import { convertToUSD } from "@/lib/format";
import type { Transaction, ManualEntry, ClassificationRule, ReconStatus, FxRates, AppData } from "@/lib/types";
import type { Category } from "@/lib/constants";

interface AppContextValue {
  // Raw data
  transactions:  Transaction[];
  adjustments:   Transaction[];
  manualEntries: ManualEntry[];
  rules:         ClassificationRule[];
  loadedMeta:    { files: string[]; totalTxns: number };
  excluded:      Set<string>;
  catOverrides:  Record<string, Category>;
  reconStatus:   ReconStatus;
  // Derived
  activeTxns:    Transaction[];
  fxRates:       FxRates;
  // Status
  serverOk:      boolean;
  loading:       boolean;
  // Actions
  handleLoad:       (incoming: Transaction[], files: File[]) => Promise<{ added: number; dupes: number; total: number }>;
  handleToggle:     (uid: string) => void;
  handleToggleAll:  (uids: string[], include: boolean) => void;
  handleCatOverride:(uid: string, cat: Category) => void;
  handleAddAdjustment: (data: Parameters<typeof makeAdjustment>[0]) => string;
  handleSaveManualEntry: (data: Parameters<typeof makeManualEntry>[0]) => void;
  handleDeleteManualEntry: (uid: string) => void;
  handleSaveRules:  (rules: ClassificationRule[]) => void;
  handleRerun:      () => void;
  handleClear:      () => void;
  setFxRates:       (rates: FxRates) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [adjustments,   setAdjustments]   = useState<Transaction[]>([]);
  const [manualEntries, setManualEntries] = useState<ManualEntry[]>([]);
  const [rules,         setRules]         = useState<ClassificationRule[]>([]);
  const [loadedMeta,    setLoadedMeta]    = useState({ files: [] as string[], totalTxns: 0 });
  const [excluded,      setExcluded]      = useState(new Set<string>());
  const [catOverrides,  setCatOverrides]  = useState<Record<string, Category>>({});
  const [reconStatus,   setReconStatus]   = useState<ReconStatus>({ lastRun: null, errorCount: 0, warningCount: 0, issues: [] });
  const [fxRates,       setFxRates]       = useState<FxRates>({});
  const [serverOk,      setServerOk]      = useState(false);
  const [loading,       setLoading]       = useState(true);

  // ── Load on startup ────────────────────────────────────────────────────────
  useEffect(() => {
    apiClient.getData()
      .then(d => {
        const excl = new Set<string>(d.excluded || []);
        const over = d.overrides || {};
        setTransactions(d.transactions || []);
        setAdjustments(d.adjustments  || []);
        setManualEntries(d.manualEntries || []);
        setRules(d.rules || []);
        setLoadedMeta(d.meta || { files: [], totalTxns: 0 });
        setExcluded(excl);
        setCatOverrides(over);
        setReconStatus(d.reconStatus || { lastRun: null, errorCount: 0, warningCount: 0, issues: [] });
        setServerOk(true);
        // Auto-reconcile on load
        const allTxns = [...(d.transactions || []), ...(d.adjustments || [])];
        const issues  = runReconciliation(allTxns, excl, over);
        const status  = {
          lastRun:      new Date().toISOString(),
          errorCount:   issues.filter(i => i.severity === "error").length,
          warningCount: issues.filter(i => i.severity === "warning").length,
          issues,
        };
        setReconStatus(status);
        apiClient.saveReconStatus(status);
      })
      .catch(() => setServerOk(false))
      .finally(() => setLoading(false));
  }, []);

  // ── FX rates auto-refresh ─────────────────────────────────────────────────
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const res  = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS,EUR,GBP");
        const json = await res.json();
        if (json.rates) setFxRates(json.rates);
      } catch { /* silent */ }
    };
    fetchRates();
    const id = setInterval(fetchRates, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Active transactions ───────────────────────────────────────────────────
  const activeTxns = useMemo(() =>
    computeActiveTxns(transactions, adjustments, excluded, catOverrides, rules, fxRates),
    [transactions, adjustments, excluded, catOverrides, rules, fxRates]
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleLoad = useCallback(async (incoming: Transaction[], files: File[]) => {
    const { merged, added } = mergeTxns(transactions, incoming);
    const dupes   = incoming.length - added;
    const newMeta = {
      files:     [...new Set([...(loadedMeta.files || []), ...files.map(f => f.name)])],
      totalTxns: merged.length,
    };
    setTransactions(merged);
    setLoadedMeta(newMeta);
    await apiClient.saveTransactions(merged);
    await apiClient.saveMeta(newMeta);
    return { added, dupes, total: merged.length };
  }, [transactions, loadedMeta]);

  const handleToggle = useCallback((uid: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      apiClient.saveExcluded([...next]);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((uids: string[], include: boolean) => {
    setExcluded(prev => {
      const next = new Set(prev);
      uids.forEach(uid => include ? next.delete(uid) : next.add(uid));
      apiClient.saveExcluded([...next]);
      return next;
    });
  }, []);

  const handleCatOverride = useCallback((uid: string, cat: Category) => {
    setCatOverrides(prev => {
      const next = { ...prev, [uid]: cat };
      apiClient.saveOverrides(next);
      return next;
    });
  }, []);

  const handleAddAdjustment = useCallback((data: Parameters<typeof makeAdjustment>[0]) => {
    const adj = makeAdjustment(data);
    setAdjustments(prev => {
      const next = [...prev, adj];
      apiClient.saveAdjustments(next);
      return next;
    });
    return adj.uid;
  }, []);

  const handleSaveManualEntry = useCallback((data: Parameters<typeof makeManualEntry>[0]) => {
    const entry = makeManualEntry(data);
    setManualEntries(prev => {
      const next = [...prev, entry];
      apiClient.saveManualEntries(next);
      return next;
    });
  }, []);

  const handleDeleteManualEntry = useCallback((uid: string) => {
    setManualEntries(prev => {
      const next = prev.filter(e => e.uid !== uid);
      apiClient.saveManualEntries(next);
      return next;
    });
  }, []);

  const handleSaveRules = useCallback((newRules: ClassificationRule[]) => {
    setRules(newRules);
    apiClient.saveRules(newRules);
  }, []);

  const handleRerun = useCallback(() => {
    const allTxns = [...transactions, ...adjustments];
    const issues  = runReconciliation(allTxns, excluded, catOverrides);
    const status  = {
      lastRun:      new Date().toISOString(),
      errorCount:   issues.filter(i => i.severity === "error").length,
      warningCount: issues.filter(i => i.severity === "warning").length,
      issues,
    };
    setReconStatus(status);
    apiClient.saveReconStatus(status);
  }, [transactions, adjustments, excluded, catOverrides]);

  const handleClear = useCallback(async () => {
    await apiClient.clearAll();
    setTransactions([]); setAdjustments([]); setManualEntries([]);
    setRules([]); setLoadedMeta({ files: [], totalTxns: 0 });
    setExcluded(new Set()); setCatOverrides({});
    setReconStatus({ lastRun: null, errorCount: 0, warningCount: 0, issues: [] });
  }, []);

  return (
    <AppContext.Provider value={{
      transactions, adjustments, manualEntries, rules,
      loadedMeta, excluded, catOverrides, reconStatus,
      activeTxns, fxRates, serverOk, loading,
      handleLoad, handleToggle, handleToggleAll, handleCatOverride,
      handleAddAdjustment, handleSaveManualEntry, handleDeleteManualEntry,
      handleSaveRules, handleRerun, handleClear, setFxRates,
    }}>
      {children}
    </AppContext.Provider>
  );
}
