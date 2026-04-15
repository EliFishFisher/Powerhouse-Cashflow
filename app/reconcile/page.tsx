"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { runReconciliation } from "@/lib/reconcile";
import { makeAdjustment } from "@/lib/factories";
import { apiClient } from "@/lib/api-client";
import { fmt } from "@/lib/format";
import { CAT_LABELS, CAT_COLORS, CAT_BG, ENT_COLOR, ALL_CATS, ENTITIES } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { ReconIssue, Transaction } from "@/lib/types";

const SEV_CONFIG = {
  error:   { label: "Error",   bg: "#fef2f2", border: "#fecaca", dot: "#ef4444", text: "#991b1b" },
  warning: { label: "Warning", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b", text: "#92400e" },
  info:    { label: "Info",    bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6", text: "#1e40af" },
};

// ─── Bank balance helpers ──────────────────────────────────────────────────────
function computeEntityNet(transactions: import("@/lib/types").Transaction[], entity: string) {
  return transactions
    .filter(t => t.entity === entity || t.entity.startsWith(entity))
    .reduce((sum, t) => sum + t.net, 0);
}

function getLatestBalance(
  bankBalances: import("@/lib/types").BankBalance[],
  entity: string,
  currency: string,
) {
  return [...bankBalances]
    .filter(b => (b.entity === entity || b.subsidiary) && b.currency === currency)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

export default function ReconcilePage() {
  const {
    data, loading, serverOk, fxRates,
    excluded, overrides,
    toggleExclude, setCatOverride,
  } = useAppData();

  const [severityFilter, setSeverityFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const [fixing,   setFixing]   = useState<string | null>(null);   // issue id being fixed
  const [adjOpen,  setAdjOpen]  = useState<string | null>(null);   // issue id with adj panel open
  const [adjForm,  setAdjForm]  = useState({
    entity:      "Corneat",
    date:        new Date().toISOString().slice(0, 10),
    description: "",
    amount:      "",
    cat:         "other" as Category,
  });
  const [running,  setRunning]  = useState(false);
  const [lastRun,  setLastRun]  = useState<string | null>(data.reconStatus?.lastRun ?? null);

  // ── Run / re-run reconciliation ───────────────────────────────────────────
  const issues = useMemo(
    () =>
      runReconciliation(
        [...data.transactions, ...data.adjustments],
        excluded,
        overrides,
      ),
    [data.transactions, data.adjustments, excluded, overrides],
  );

  const runAndSave = useCallback(async () => {
    setRunning(true);
    try {
      const now = new Date().toISOString();
      await apiClient.saveReconStatus({
        lastRun:      now,
        errorCount:   issues.filter(i => i.severity === "error").length,
        warningCount: issues.filter(i => i.severity === "warning").length,
        issues,
      });
      setLastRun(now);
    } finally {
      setRunning(false);
    }
  }, [issues]);

  // ── Apply a quick-fix ─────────────────────────────────────────────────────
  const applyFix = useCallback(async (issue: ReconIssue) => {
    if (!issue.fix) return;
    setFixing(issue.id);
    try {
      if (issue.fix.type === "reclassify" && issue.fix.cat) {
        setCatOverride(issue.fix.uid, issue.fix.cat);
      } else if (issue.fix.type === "exclude") {
        toggleExclude(issue.fix.uid);
      }
    } finally {
      setFixing(null);
    }
  }, [setCatOverride, toggleExclude]);

  // ── Add adjustment from reconcile panel ───────────────────────────────────
  const handleAddAdj = useCallback(async (issueId: string) => {
    const amt = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(amt) || amt === 0) {
      alert("Please fill in description and a non-zero amount.");
      return;
    }
    const adj = makeAdjustment({ ...adjForm, amount: amt });
    const next = [...data.adjustments, adj] as Transaction[];
    await apiClient.saveAdjustments(next);
    setAdjOpen(null);
    setAdjForm(f => ({ ...f, description: "", amount: "" }));
    window.location.reload();
  }, [adjForm, data.adjustments]);

  // ── Filtered issues ───────────────────────────────────────────────────────
  const filtered = useMemo(
    () =>
      severityFilter === "all"
        ? issues
        : issues.filter(i => i.severity === severityFilter),
    [issues, severityFilter],
  );

  const errorCount   = issues.filter(i => i.severity === "error").length;
  const warningCount = issues.filter(i => i.severity === "warning").length;
  const infoCount    = issues.filter(i => i.severity === "info").length;

  // ── Guard states ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-1 items-center justify-center">
      <p className="animate-pulse text-sm text-slate-400">Loading…</p>
    </div>
  );

  if (!serverOk) return (
    <div className="flex flex-1 items-center justify-center">
      <div className="space-y-2 text-center">
        <div className="text-2xl">⚠️</div>
        <p className="text-sm font-semibold text-red-600">Server offline</p>
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col" style={{ background: "#f8fafc" }}>

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 flex flex-wrap items-center gap-4">

        {/* Summary chips */}
        {(["error", "warning", "info"] as const).map(sev => {
          const cfg = SEV_CONFIG[sev];
          const count = sev === "error" ? errorCount : sev === "warning" ? warningCount : infoCount;
          return (
            <button key={sev} onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
              style={{
                display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px",
                borderRadius: 6, border: `1px solid ${severityFilter === sev ? cfg.border : "#e2e8f0"}`,
                background: severityFilter === sev ? cfg.bg : "#fff",
                cursor: "pointer", fontSize: 11, fontWeight: 600, color: cfg.text,
                transition: "all 0.15s",
              }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.dot, display: "inline-block" }} />
              {count} {cfg.label}{count !== 1 ? "s" : ""}
            </button>
          );
        })}

        {issues.length === 0 && (
          <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
            ✓ All clear — no issues found
          </span>
        )}

        {/* Last run */}
        {lastRun && (
          <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 4 }}>
            Last saved {new Date(lastRun).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}
          </span>
        )}

        {/* Run button */}
        <button onClick={runAndSave} disabled={running} style={{
          marginLeft: "auto", height: 30, padding: "0 14px", fontSize: 12, fontWeight: 600,
          background: running ? "#94a3b8" : "#1e293b", color: "#fff",
          border: "none", borderRadius: 6, cursor: running ? "wait" : "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {running ? "Saving…" : "💾 Save snapshot"}
        </button>
      </div>

      {/* ── Bank Balance Comparison ────────────────────────────────────────── */}
      {data.bankBalances.length > 0 && (
        <BankBalanceComparison
          bankBalances={data.bankBalances}
          transactions={[...data.transactions, ...data.adjustments]}
          excluded={excluded}
        />
      )}

      {/* ── Issue list ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>
              {issues.length === 0 ? "✅" : "🔍"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
              {issues.length === 0
                ? "No reconciliation issues found"
                : `No ${severityFilter}s — try a different filter`}
            </div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {issues.length === 0
                ? "Your cashflow data looks clean"
                : `There are ${issues.length} issue${issues.length !== 1 ? "s" : ""} in other categories`}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(issue => {
              const cfg = SEV_CONFIG[issue.severity];
              const isAdjOpen = adjOpen === issue.id;
              const isFixing  = fixing  === issue.id;

              return (
                <div key={issue.id} style={{
                  background: "#fff", border: `1px solid ${cfg.border}`,
                  borderLeft: `3px solid ${cfg.dot}`,
                  borderRadius: 8, overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}>
                  {/* Issue header */}
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {/* Severity dot */}
                      <span style={{
                        marginTop: 3, width: 8, height: 8, borderRadius: "50%",
                        background: cfg.dot, flexShrink: 0, display: "inline-block",
                      }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Title row */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                            {issue.title}
                          </span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 6px",
                            background: cfg.bg, color: cfg.text,
                            textTransform: "uppercase", letterSpacing: "0.06em",
                          }}>
                            {cfg.label}
                          </span>
                        </div>

                        {/* Description */}
                        <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                          {issue.description}
                        </div>

                        {/* Advice */}
                        {issue.adjustmentAdvice && (
                          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6, fontStyle: "italic" }}>
                            💡 {issue.adjustmentAdvice}
                          </div>
                        )}

                        {/* Affected transactions */}
                        {issue.transactions.length > 0 && (
                          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {issue.transactions.map(uid => {
                              const txn = [...data.transactions, ...data.adjustments].find(t => t.uid === uid);
                              if (!txn) return null;
                              return (
                                <div key={uid} style={{
                                  fontSize: 10, background: "#f8fafc", border: "1px solid #e2e8f0",
                                  borderRadius: 5, padding: "3px 8px", color: "#64748b",
                                  display: "flex", alignItems: "center", gap: 5,
                                }}>
                                  <span style={{ color: ENT_COLOR[txn.entity] || "#64748b", fontWeight: 600 }}>
                                    {txn.entity}
                                  </span>
                                  <span>·</span>
                                  <span>{txn.date}</span>
                                  <span>·</span>
                                  <span style={{ fontWeight: 600, color: txn.net > 0 ? "#16a34a" : "#dc2626" }}>
                                    {txn.net > 0 ? "+" : ""}{fmt(txn.net)}
                                  </span>
                                  <span style={{
                                    fontSize: 9, fontWeight: 600, borderRadius: 999, padding: "1px 5px",
                                    background: CAT_BG[txn.cat] || "#f1f5f9",
                                    color:      CAT_COLORS[txn.cat] || "#64748b",
                                  }}>
                                    {CAT_LABELS[txn.cat] || txn.cat}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action bar */}
                  <div style={{
                    padding: "8px 16px", borderTop: `1px solid ${cfg.border}`,
                    background: cfg.bg, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                  }}>
                    {/* Quick fix */}
                    {issue.fix && (
                      <button onClick={() => applyFix(issue)} disabled={isFixing} style={{
                        height: 28, padding: "0 12px", fontSize: 11, fontWeight: 600,
                        background: "#1e293b", color: "#fff", border: "none",
                        borderRadius: 5, cursor: isFixing ? "wait" : "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <span>⚡</span> {isFixing ? "Applying…" : issue.fixLabel}
                      </button>
                    )}

                    {/* Add adjustment */}
                    {issue.suggestedAdjCat && (
                      <button onClick={() => {
                        setAdjOpen(isAdjOpen ? null : issue.id);
                        if (!isAdjOpen) {
                          setAdjForm(f => ({
                            ...f,
                            cat:         issue.suggestedAdjCat as Category,
                            description: issue.suggestedAdjDesc || "",
                            amount:      issue.suggestedAdjAmount != null
                              ? String(issue.suggestedAdjAmount)
                              : "",
                          }));
                        }
                      }} style={{
                        height: 28, padding: "0 12px", fontSize: 11, fontWeight: 600,
                        background: isAdjOpen ? "#f1f5f9" : "#fff",
                        color: "#475569",
                        border: "1px solid #e2e8f0", borderRadius: 5, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        <span>+</span> {isAdjOpen ? "Cancel adjustment" : "Add adjustment"}
                      </button>
                    )}

                    {!issue.fix && !issue.suggestedAdjCat && (
                      <span style={{ fontSize: 11, color: "#94a3b8", fontStyle: "italic" }}>
                        {issue.fixLabel}
                      </span>
                    )}
                  </div>

                  {/* Adjustment inline form */}
                  {isAdjOpen && (
                    <div style={{
                      padding: "14px 16px", borderTop: "1px solid #e2e8f0",
                      background: "#fafbfd",
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                        New Adjustment Entry
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                        {/* Entity */}
                        <div>
                          <div style={adjLabelStyle}>Entity</div>
                          <select value={adjForm.entity} onChange={e => setAdjForm(f => ({ ...f, entity: e.target.value }))}
                            style={adjInputStyle}>
                            {ENTITIES.filter(e => e !== "Consolidated").map(e => (
                              <option key={e} value={e}>{e}</option>
                            ))}
                          </select>
                        </div>
                        {/* Date */}
                        <div>
                          <div style={adjLabelStyle}>Date</div>
                          <input type="date" value={adjForm.date}
                            onChange={e => setAdjForm(f => ({ ...f, date: e.target.value }))}
                            style={adjInputStyle} />
                        </div>
                        {/* Description */}
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={adjLabelStyle}>Description</div>
                          <input value={adjForm.description} placeholder="Adjustment description"
                            onChange={e => setAdjForm(f => ({ ...f, description: e.target.value }))}
                            style={adjInputStyle} />
                        </div>
                        {/* Amount */}
                        <div>
                          <div style={adjLabelStyle}>Amount (USD)</div>
                          <input type="number" value={adjForm.amount} placeholder="e.g. 5000 or -5000"
                            onChange={e => setAdjForm(f => ({ ...f, amount: e.target.value }))}
                            style={adjInputStyle} />
                        </div>
                        {/* Category */}
                        <div>
                          <div style={adjLabelStyle}>Category</div>
                          <select value={adjForm.cat} onChange={e => setAdjForm(f => ({ ...f, cat: e.target.value as Category }))}
                            style={adjInputStyle}>
                            {ALL_CATS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
                          </select>
                        </div>
                      </div>
                      <button onClick={() => handleAddAdj(issue.id)} style={{
                        height: 30, padding: "0 14px", fontSize: 12, fontWeight: 600,
                        background: "#1e293b", color: "#fff", border: "none",
                        borderRadius: 5, cursor: "pointer",
                      }}>
                        Add Adjustment
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, borderTop: "1px solid #e2e8f0", background: "#fff",
        padding: "5px 20px", fontSize: 10, color: "#94a3b8",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span>
          {issues.length} issue{issues.length !== 1 ? "s" : ""} total ·{" "}
          {errorCount} error{errorCount !== 1 ? "s" : ""} ·{" "}
          {warningCount} warning{warningCount !== 1 ? "s" : ""}
        </span>
        <span>Reconciliation runs live — issues update as you edit transactions</span>
      </div>
    </div>
  );
}

// ─── Bank Balance Comparison Panel ────────────────────────────────────────────
function BankBalanceComparison({
  bankBalances,
  transactions,
  excluded,
}: {
  bankBalances:  import("@/lib/types").BankBalance[];
  transactions:  import("@/lib/types").Transaction[];
  excluded:      Set<string>;
}) {
  // Group by entity + subsidiary + currency — show the latest snapshot for each
  const activeTxns = transactions.filter(t => !excluded.has(t.uid));

  // Collect unique keys: entity+subsidiary+currency
  const seen = new Map<string, import("@/lib/types").BankBalance>();
  for (const b of [...bankBalances].sort((a, z) => z.date.localeCompare(a.date))) {
    const key = `${b.entity}|${b.subsidiary ?? ""}|${b.currency}`;
    if (!seen.has(key)) seen.set(key, b);
  }
  const rows = [...seen.values()];

  function fmtN(n: number, ccy: string) {
    const sign = n >= 0 ? "+" : "";
    return sign + new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + " " + ccy;
  }

  return (
    <div style={{ flexShrink: 0, borderBottom: "1px solid #e2e8f0", background: "#f0f9ff", padding: "12px 20px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
        🏦 Bank Balance Snapshots
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {rows.map(b => {
          const entityKey = b.subsidiary ?? b.entity;
          // Sum net for all transactions matching this entity/subsidiary
          const computedNet = activeTxns
            .filter(t => t.entity === entityKey || t.entity === b.entity)
            .reduce((s, t) => s + t.net, 0);
          const gap        = b.balance - computedNet;
          const pct        = computedNet !== 0 ? Math.abs(gap / computedNet) * 100 : 100;
          const isClose    = Math.abs(gap) < 500;

          return (
            <div key={`${b.uid}`} style={{
              background: "#fff", border: `1px solid ${isClose ? "#bbf7d0" : "#fde68a"}`,
              borderLeft: `3px solid ${isClose ? "#22c55e" : "#f59e0b"}`,
              borderRadius: 8, padding: "10px 14px", minWidth: 240,
            }}>
              {/* Entity name */}
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>
                {b.subsidiary ?? b.entity}
                {b.accountNo && (
                  <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: "#94a3b8" }}>
                    Acct {b.accountNo}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", fontSize: 11 }}>
                <span style={{ color: "#64748b" }}>Bank (as of {b.date})</span>
                <span style={{ fontWeight: 700, color: "#0f172a" }}>
                  {new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(b.balance)} {b.currency}
                </span>

                <span style={{ color: "#64748b" }}>Computed net</span>
                <span style={{ fontWeight: 600, color: computedNet >= 0 ? "#16a34a" : "#dc2626" }}>
                  {fmtN(computedNet, b.currency)}
                </span>

                <span style={{ color: "#64748b" }}>Gap</span>
                <span style={{
                  fontWeight: 700,
                  color: isClose ? "#16a34a" : Math.abs(gap) > 10000 ? "#dc2626" : "#d97706",
                }}>
                  {isClose ? "✓ Reconciled" : fmtN(gap, b.currency)}
                  {!isClose && pct < 100 && (
                    <span style={{ marginLeft: 4, fontSize: 9, color: "#94a3b8", fontWeight: 400 }}>
                      ({pct.toFixed(1)}% variance)
                    </span>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: "#64748b" }}>
        Computed net = sum of all uploaded transactions for each entity. Upload more bank statements to close the gap.
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const adjLabelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4,
};

const adjInputStyle: React.CSSProperties = {
  width: "100%", height: 30, fontSize: 12, borderRadius: 5,
  border: "1px solid #e2e8f0", paddingLeft: 8, background: "#fff",
  outline: "none", boxSizing: "border-box",
};
