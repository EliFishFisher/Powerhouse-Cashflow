"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { computeActiveTxns, buildWeekly, addBalances } from "@/lib/cashflow";
import { exportWeeklyExtract } from "@/lib/export";
import { makeManualEntry } from "@/lib/factories";
import { apiClient } from "@/lib/api-client";
import { fmt } from "@/lib/format";
import { ALL_CATS, CAT_LABELS, CAT_COLORS, CAT_BG, ENT_COLOR, ENTITIES } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { ManualEntry } from "@/lib/types";

const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, fontSize: 12, borderRadius: 6,
  border: "1px solid #e2e8f0", paddingLeft: 10, outline: "none",
  background: "#fff", boxSizing: "border-box",
};

export default function ForecastPage() {
  const {
    data, loading, serverOk, fxRates, excluded, overrides,
  } = useAppData();

  const [entity,    setEntity]    = useState("Consolidated");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ManualEntry | null>(null);
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [form,      setForm]      = useState({
    entity:      "Corneat",
    month:       new Date().toISOString().slice(0, 7),
    description: "",
    amount:      "",
    cat:         "financing_in" as Category,
  });

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeTxns = useMemo(
    () =>
      computeActiveTxns(
        data.transactions, data.adjustments,
        excluded, overrides, data.rules, fxRates,
      ),
    [data.transactions, data.adjustments, excluded, overrides, data.rules, fxRates],
  );

  const historicalRows = useMemo(() => {
    const sub =
      entity === "Consolidated"
        ? activeTxns.filter(t => t.cat !== "fx_conversion")
        : activeTxns.filter(t => t.entity === entity && t.cat !== "fx_conversion");
    const weeks = [...new Set(sub.map(t => t.week))].sort();
    return addBalances(buildWeekly(sub, entity, weeks), 0);
  }, [activeTxns, entity]);

  const projection = useMemo(() => {
    const last8 = historicalRows.slice(-8);
    const avgWeekly =
      last8.length ? last8.reduce((s, r) => s + r.net, 0) / last8.length : 0;
    const lastBal =
      historicalRows.length
        ? historicalRows[historicalRows.length - 1].closing_bal
        : 0;

    // Next 12 Mondays
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dow = today.getDay() || 7;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() - (dow - 1));
    const futureWeeks = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(thisMonday);
      d.setDate(thisMonday.getDate() + (i + 1) * 7);
      return d.toISOString().slice(0, 10);
    });

    // Manual entries → weekly contribution
    const manSub = data.manualEntries.filter(e =>
      entity === "Consolidated" ? true : e.entity === entity,
    );
    const manByWeek: Record<string, number> = {};
    futureWeeks.forEach(wk => {
      const ym = wk.slice(0, 7);
      manByWeek[wk] = manSub
        .filter(e => e.month === ym)
        .reduce((s, e) => s + (e.amount || 0) / 4.33, 0);
    });

    let bal = lastBal;
    const weeks = futureWeeks.map(wk => {
      const projected = parseFloat((avgWeekly + (manByWeek[wk] || 0)).toFixed(2));
      bal = parseFloat((bal + projected).toFixed(2));
      return { wk, projected, balance: bal, manualContrib: manByWeek[wk] || 0 };
    });

    return { avgWeekly, lastBal, weeks };
  }, [historicalRows, data.manualEntries, entity]);

  const entryList = useMemo(
    () =>
      [...data.manualEntries]
        .filter(e => entity === "Consolidated" ? true : e.entity === entity)
        .sort((a, b) => a.month.localeCompare(b.month)),
    [data.manualEntries, entity],
  );

  // ── Chart scaling ─────────────────────────────────────────────────────────
  const maxAbs = useMemo(
    () => Math.max(...projection.weeks.map(w => Math.abs(w.projected)), 1),
    [projection],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAdd = useCallback(() => {
    setEditEntry(null);
    setForm({
      entity:      entity === "Consolidated" ? "Corneat" : entity,
      month:       new Date().toISOString().slice(0, 7),
      description: "",
      amount:      "",
      cat:         "financing_in",
    });
    setPanelOpen(true);
  }, [entity]);

  const openEdit = useCallback((e: ManualEntry) => {
    setEditEntry(e);
    setForm({
      entity:      e.entity,
      month:       e.month,
      description: e.description,
      amount:      String(e.amount),
      cat:         e.cat,
    });
    setPanelOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    const amt = parseFloat(form.amount);
    if (!form.description.trim() || isNaN(amt) || amt === 0) {
      alert("Please fill in description and a non-zero amount.");
      return;
    }
    setSaving(true);
    try {
      let next: ManualEntry[];
      if (editEntry) {
        next = data.manualEntries.map(e =>
          e.uid === editEntry.uid
            ? { ...e, entity: form.entity, month: form.month, description: form.description, amount: amt, cat: form.cat }
            : e,
        );
      } else {
        next = [
          ...data.manualEntries,
          makeManualEntry({
            entity: form.entity, month: form.month,
            description: form.description, amount: amt, cat: form.cat,
          }),
        ];
      }
      await apiClient.saveManualEntries(next);
      setPanelOpen(false);
      setEditEntry(null);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }, [form, editEntry, data.manualEntries]);

  const handleDelete = useCallback(async (uid: string) => {
    await apiClient.saveManualEntries(data.manualEntries.filter(e => e.uid !== uid));
    setDeleteId(null);
    window.location.reload();
  }, [data.manualEntries]);

  const fmtWeek = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" });

  // ── Guard states ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-1 items-center justify-center">
      <p className="animate-pulse text-sm text-slate-400">Loading forecast…</p>
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

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex flex-wrap items-center gap-4 border-b border-slate-200 bg-white px-5 py-3">
        <select value={entity} onChange={e => setEntity(e.target.value)}
          style={{ height: 30, fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0", paddingLeft: 8, background: "#f8fafc" }}>
          {ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        {/* Quick stats */}
        <div style={{ display: "flex", gap: 20, fontSize: 11, color: "#64748b" }}>
          <span>
            Avg weekly:{" "}
            <strong style={{ color: projection.avgWeekly >= 0 ? "#16a34a" : "#dc2626" }}>
              {projection.avgWeekly >= 0 ? "+" : ""}{fmt(projection.avgWeekly)}
            </strong>
          </span>
          <span>
            Last actual balance:{" "}
            <strong style={{ color: "#1e293b" }}>{fmt(projection.lastBal)}</strong>
          </span>
          <span>
            12-wk outlook:{" "}
            <strong style={{ color: projection.weeks[11]?.balance >= 0 ? "#1e293b" : "#dc2626" }}>
              {fmt(projection.weeks[11]?.balance ?? 0)}
            </strong>
          </span>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={openAdd} style={{
            height: 30, padding: "0 14px", fontSize: 12, fontWeight: 600,
            background: "#1e293b", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            <span style={{ fontSize: 15 }}>+</span> Add Entry
          </button>
          <button
            onClick={() => exportWeeklyExtract(activeTxns, entity, fxRates, data.manualEntries)}
            style={{
              height: 30, padding: "0 14px", fontSize: 12, fontWeight: 600,
              background: "#fff", color: "#475569", border: "1px solid #e2e8f0",
              borderRadius: 6, cursor: "pointer",
            }}
          >
            ↓ Export xlsx
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>

        {/* ── Chart + table ──────────────────────────────────────────────── */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e8edf2", padding: "18px 20px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>
            12-Week Cash Flow Projection — {entity} (USD)
          </div>

          {/* Bar chart — zero-centered */}
          <div style={{ position: "relative", height: 120, display: "flex", alignItems: "stretch", gap: 4 }}>
            {/* Zero line */}
            <div style={{
              position: "absolute", top: "50%", left: 0, right: 0,
              borderTop: "1px dashed #e2e8f0", zIndex: 1,
            }} />

            {projection.weeks.map(w => {
              const pct     = (Math.abs(w.projected) / maxAbs) * 48; // max 48% of half-height
              const isPos   = w.projected >= 0;
              const hasManual = Math.abs(w.manualContrib) > 0.5;
              return (
                <div
                  key={w.wk}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}
                  title={`${fmtWeek(w.wk)}: ${w.projected >= 0 ? "+" : ""}${fmt(w.projected)} · Balance: ${fmt(w.balance)}`}
                >
                  {/* Positive bar (upper half) */}
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    {isPos && (
                      <div style={{
                        width: "60%", margin: "0 auto", height: `${pct}%`,
                        background: hasManual ? "#3b82f6" : "#22c55e",
                        borderRadius: "3px 3px 0 0", minHeight: 2,
                        alignSelf: "flex-end",
                      }} />
                    )}
                  </div>
                  {/* Negative bar (lower half) */}
                  <div style={{ flex: 1, display: "flex", alignItems: "flex-start", width: "100%" }}>
                    {!isPos && (
                      <div style={{
                        width: "60%", margin: "0 auto", height: `${pct}%`,
                        background: hasManual ? "#8b5cf6" : "#ef4444",
                        borderRadius: "0 0 3px 3px", minHeight: 2,
                      }} />
                    )}
                  </div>
                  {/* Week label */}
                  <div style={{ fontSize: 8, color: "#94a3b8", textAlign: "center", marginTop: 3, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                    {fmtWeek(w.wk)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 14, fontSize: 10, color: "#64748b", marginTop: 10, marginBottom: 14 }}>
            <span><span style={{ color: "#22c55e", fontWeight: 700 }}>■</span> Baseline inflow</span>
            <span><span style={{ color: "#ef4444", fontWeight: 700 }}>■</span> Baseline outflow</span>
            <span><span style={{ color: "#3b82f6", fontWeight: 700 }}>■</span> Manual entry (in)</span>
            <span><span style={{ color: "#8b5cf6", fontWeight: 700 }}>■</span> Manual entry (out)</span>
          </div>

          {/* Data table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
              <thead>
                <tr>
                  <Th>Week of</Th>
                  {projection.weeks.map(w => <Th key={w.wk} right>{fmtWeek(w.wk)}</Th>)}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #f8fafc" }}>
                  <Td lbl>Projected net</Td>
                  {projection.weeks.map(w => (
                    <Td key={w.wk} right color={w.projected >= 0 ? "#16a34a" : "#dc2626"} bold>
                      {w.projected >= 0 ? "+" : ""}{fmt(w.projected)}
                    </Td>
                  ))}
                </tr>
                <tr>
                  <Td lbl>Proj. balance</Td>
                  {projection.weeks.map(w => (
                    <Td key={w.wk} right color={w.balance >= 0 ? "#1e293b" : "#ef4444"}>
                      {fmt(w.balance)}
                    </Td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Manual entries ─────────────────────────────────────────────── */}
        <div style={{ padding: "16px 20px" }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Manual Forecast Entries
            </div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
              Add known future cash flows to refine the baseline projection. Each entry is spread evenly across ~4.33 weeks in its month.
            </div>
          </div>

          {entryList.length === 0 ? (
            <div style={{
              border: "1px dashed #e2e8f0", borderRadius: 8,
              padding: "28px 20px", textAlign: "center", color: "#94a3b8", fontSize: 12,
            }}>
              No manual entries yet.{" "}
              <button onClick={openAdd} style={{ color: "#3b82f6", background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Add one
              </button>{" "}
              to layer known upcoming cash flows onto the projection.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {entryList.map(entry => (
                <div key={entry.uid} style={{
                  background: "#fff", border: "1px solid #e8edf3", borderRadius: 7,
                  padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                  transition: "box-shadow 0.15s",
                }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = "none")}
                >
                  {/* Month badge */}
                  <div style={{
                    flexShrink: 0, width: 50, textAlign: "center",
                    background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 0",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
                      {MONTH_NAMES[parseInt(entry.month.slice(5, 7), 10) - 1]}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                      {entry.month.slice(0, 4)}
                    </div>
                  </div>

                  {entity === "Consolidated" && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, flexShrink: 0,
                      color: ENT_COLOR[entry.entity] || "#64748b",
                    }}>
                      {entry.entity}
                    </span>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>
                      {entry.description}
                    </div>
                    <div style={{ marginTop: 3 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "1px 7px",
                        background: CAT_BG[entry.cat] || "#f1f5f9",
                        color:      CAT_COLORS[entry.cat] || "#64748b",
                      }}>
                        {CAT_LABELS[entry.cat] || entry.cat}
                      </span>
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: entry.amount >= 0 ? "#16a34a" : "#dc2626",
                    }}>
                      {entry.amount >= 0 ? "+" : ""}{fmt(entry.amount)}
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 1 }}>
                      ≈ {fmt(entry.amount / 4.33)}/wk
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <ActionBtn onClick={() => openEdit(entry)} title="Edit">✏️</ActionBtn>
                    <ActionBtn onClick={() => setDeleteId(entry.uid)} title="Delete" danger>🗑</ActionBtn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Add / Edit panel ───────────────────────────────────────────────── */}
      {panelOpen && (
        <>
          <div onClick={() => { setPanelOpen(false); setEditEntry(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50, width: 400,
            background: "#fff", boxShadow: "-4px 0 40px rgba(0,0,0,0.12)",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ background: "#0f172a", padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                {editEntry ? "Edit Entry" : "New Entry"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>
                {editEntry ? "Update forecast entry" : "Add forecast entry"}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
              <FormField label="Entity">
                <select value={form.entity} onChange={e => setForm(f => ({ ...f, entity: e.target.value }))} style={inputStyle}>
                  {ENTITIES.filter(e => e !== "Consolidated").map(e => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Month">
                <input type="month" value={form.month}
                  onChange={e => setForm(f => ({ ...f, month: e.target.value }))}
                  style={inputStyle} />
              </FormField>

              <FormField label="Description">
                <input value={form.description} placeholder="e.g. Expected NIH grant payment"
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  style={inputStyle} />
              </FormField>

              <FormField label="Amount (USD)" hint="positive = inflow · negative = outflow">
                <input type="number" value={form.amount} placeholder="e.g. 50000 or -12000"
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  style={inputStyle} />
              </FormField>

              <FormField label="Category">
                <select value={form.cat}
                  onChange={e => setForm(f => ({ ...f, cat: e.target.value as Category }))}
                  style={inputStyle}>
                  {ALL_CATS.filter(c => c !== "fx_conversion").map(c => (
                    <option key={c} value={c}>{CAT_LABELS[c] || c}</option>
                  ))}
                </select>
                {form.cat && (
                  <div style={{ marginTop: 7 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, borderRadius: 999, padding: "3px 10px",
                      background: CAT_BG[form.cat] || "#f1f5f9",
                      color:      CAT_COLORS[form.cat] || "#64748b",
                    }}>
                      {CAT_LABELS[form.cat] || form.cat}
                    </span>
                  </div>
                )}
              </FormField>
            </div>

            <div style={{ padding: "14px 20px", borderTop: "1px solid #f1f5f9", background: "#fafbfd", display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, height: 36, background: saving ? "#94a3b8" : "#1e293b", color: "#fff",
                border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
              }}>
                {saving ? "Saving…" : editEntry ? "Save Changes" : "Add Entry"}
              </button>
              <button onClick={() => { setPanelOpen(false); setEditEntry(null); }} style={{
                height: 36, padding: "0 16px", background: "#fff", color: "#64748b",
                border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, cursor: "pointer",
              }}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirm ──────────────────────────────────────────────────── */}
      {deleteId && (() => {
        const entry = data.manualEntries.find(e => e.uid === deleteId);
        return (
          <>
            <div onClick={() => setDeleteId(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(2px)" }} />
            <div style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              zIndex: 70, background: "#fff", borderRadius: 12, padding: "24px 28px", width: 360,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
                Remove forecast entry?
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
                <strong>"{entry?.description}"</strong> will be removed and the projection will revert to the baseline for that month.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleDelete(deleteId)} style={{
                  flex: 1, height: 34, background: "#ef4444", color: "#fff",
                  border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Remove</button>
                <button onClick={() => setDeleteId(null)} style={{
                  height: 34, padding: "0 16px", background: "#fff", border: "1px solid #e2e8f0",
                  borderRadius: 6, fontSize: 13, color: "#64748b", cursor: "pointer",
                }}>Cancel</button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ActionBtn({ children, onClick, title, danger = false }: {
  children: React.ReactNode; onClick: () => void; title?: string; danger?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 28, height: 28, borderRadius: 6, border: "1px solid #e2e8f0",
      background: "#fff", cursor: "pointer", fontSize: 13,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background  = danger ? "#fef2f2" : "#f8fafc";
        (e.currentTarget as HTMLElement).style.borderColor = danger ? "#fecaca" : "#cbd5e1";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background  = "#fff";
        (e.currentTarget as HTMLElement).style.borderColor = "#e2e8f0";
      }}
    >
      {children}
    </button>
  );
}

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ marginBottom: 6, display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
        {hint && <span style={{ fontSize: 10, color: "#94a3b8" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "5px 8px", fontSize: 9, fontWeight: 700, color: "#94a3b8",
      textTransform: "uppercase", letterSpacing: "0.07em",
      textAlign: right ? "right" : "left", whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

function Td({ children, lbl, right, color, bold }: {
  children: React.ReactNode;
  lbl?: boolean; right?: boolean; color?: string; bold?: boolean;
}) {
  return (
    <td style={{
      padding: "5px 8px", fontSize: 11, whiteSpace: "nowrap",
      textAlign: right ? "right" : "left",
      color: color ?? (lbl ? "#64748b" : "#1e293b"),
      fontWeight: bold ? 700 : lbl ? 600 : 400,
    }}>
      {children}
    </td>
  );
}
