"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { computeActiveTxns } from "@/lib/cashflow";
import { fmt } from "@/lib/format";
import {
  ALL_CATS,
  CAT_LABELS,
  CAT_COLORS,
  CAT_BG,
  ENT_COLOR,
  ENTITIES,
} from "@/lib/constants";
import type { Category } from "@/lib/constants";

type SortCol = "date" | "amount" | "entity";
type StatusFilter = "all" | "active" | "excluded";

export default function TransactionsPage() {
  const {
    data,
    loading,
    serverOk,
    fxRates,
    excluded,
    overrides,
    toggleExclude,
    setCatOverride,
    removeCatOverride,
  } = useAppData();

  const [search,        setSearch]        = useState("");
  const [entityFilter,  setEntityFilter]  = useState("All");
  const [catFilter,     setCatFilter]     = useState("All");
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>("all");
  const [sortBy,        setSortBy]        = useState<SortCol>("date");
  const [sortDir,       setSortDir]       = useState<"asc" | "desc">("desc");
  const [overrideOpen,  setOverrideOpen]  = useState<string | null>(null);

  // ── All raw rows (transactions + adjustments) ─────────────────────────────
  const allRaw = useMemo(
    () => [...data.transactions, ...data.adjustments],
    [data.transactions, data.adjustments],
  );

  // ── Active txns: applies rules / overrides / FX conversion ───────────────
  const activeTxns = useMemo(
    () =>
      computeActiveTxns(
        data.transactions,
        data.adjustments,
        excluded,
        overrides,
        data.rules,
        fxRates,
      ),
    [data.transactions, data.adjustments, excluded, overrides, data.rules, fxRates],
  );

  // uid → computed category (for rows that are NOT excluded)
  const catMap = useMemo(() => {
    const m = new Map<string, Category>();
    activeTxns.forEach(t => m.set(t.uid, t.cat));
    return m;
  }, [activeTxns]);

  // ── Combined displayable rows ─────────────────────────────────────────────
  const allDisplayed = useMemo(
    () =>
      allRaw.map(t => ({
        ...t,
        cat: (overrides[t.uid] ?? catMap.get(t.uid) ?? t.cat) as Category,
        isExcluded: excluded.has(t.uid),
      })),
    [allRaw, catMap, overrides, excluded],
  );

  // ── Filters + sort ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = allDisplayed;

    if (statusFilter === "active")   rows = rows.filter(r => !r.isExcluded);
    if (statusFilter === "excluded") rows = rows.filter(r =>  r.isExcluded);
    if (entityFilter !== "All")      rows = rows.filter(r => r.entity === entityFilter);
    if (catFilter    !== "All")      rows = rows.filter(r => r.cat    === catFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        r =>
          (r.details   || "").toLowerCase().includes(q) ||
          (r.contra    || "").toLowerCase().includes(q) ||
          (r.account   || "").toLowerCase().includes(q) ||
          (r.journalNo || "").toLowerCase().includes(q),
      );
    }

    return [...rows].sort((a, b) => {
      let v = 0;
      if (sortBy === "date")   v = a.date.localeCompare(b.date);
      if (sortBy === "amount") v = Math.abs(a.net) - Math.abs(b.net);
      if (sortBy === "entity") v = a.entity.localeCompare(b.entity);
      return sortDir === "asc" ? v : -v;
    });
  }, [allDisplayed, statusFilter, entityFilter, catFilter, search, sortBy, sortDir]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = filtered.filter(r => !r.isExcluded);
    return {
      shown:    filtered.length,
      totalIn:  active.filter(r => r.net > 0).reduce((s, r) => s + r.net, 0),
      totalOut: active.filter(r => r.net < 0).reduce((s, r) => s + r.net, 0),
      net:      active.reduce((s, r) => s + r.net, 0),
    };
  }, [filtered]);

  const toggleSort = useCallback(
    (col: SortCol) => {
      if (sortBy === col) setSortDir(d => (d === "asc" ? "desc" : "asc"));
      else { setSortBy(col); setSortDir("desc"); }
    },
    [sortBy],
  );

  const arrow = (col: SortCol) =>
    sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  // ── Guard states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="animate-pulse text-sm text-slate-400">Loading transactions…</p>
      </div>
    );
  }

  if (!serverOk) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="space-y-2 text-center">
          <div className="text-2xl">⚠️</div>
          <p className="text-sm font-semibold text-red-600">Server offline</p>
          <p className="text-xs text-slate-400">Make sure the data server is running</p>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col" style={{ background: "#f8fafc" }}>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3"
        style={{ minHeight: 52 }}
      >
        {/* Search */}
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#94a3b8", pointerEvents: "none" }}>
            🔍
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search description, contra, account…"
            style={{
              paddingLeft: 28, paddingRight: 10, height: 30, fontSize: 12,
              borderRadius: 6, border: "1px solid #e2e8f0", outline: "none",
              width: 270, background: "#f8fafc",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#94a3b8" }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Entity */}
        <Select value={entityFilter} onChange={setEntityFilter}>
          <option value="All">All entities</option>
          {ENTITIES.filter(e => e !== "Consolidated").map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </Select>

        {/* Category */}
        <Select value={catFilter} onChange={setCatFilter}>
          <option value="All">All categories</option>
          {ALL_CATS.map(c => (
            <option key={c} value={c}>{CAT_LABELS[c] || c}</option>
          ))}
        </Select>

        {/* Status toggle */}
        <div style={{ display: "flex", borderRadius: 6, border: "1px solid #e2e8f0", overflow: "hidden", background: "#f8fafc" }}>
          {(["all", "active", "excluded"] as StatusFilter[]).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              style={{
                height: 30, padding: "0 12px", fontSize: 11, fontWeight: 500,
                border: "none", cursor: "pointer",
                background: statusFilter === s ? "#1e293b" : "transparent",
                color:      statusFilter === s ? "#fff"    : "#64748b",
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* Summary stats */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18, fontSize: 11, color: "#64748b", whiteSpace: "nowrap" }}>
          <span>
            <strong style={{ color: "#1e293b" }}>{stats.shown.toLocaleString()}</strong> shown
          </span>
          <span style={{ color: "#16a34a" }}>+{fmt(stats.totalIn)}</span>
          <span style={{ color: "#dc2626" }}>{fmt(Math.abs(stats.totalOut))}</span>
          <span
            style={{ fontWeight: 700, color: stats.net >= 0 ? "#15803d" : "#b91c1c" }}
          >
            Net {stats.net >= 0 ? "+" : ""}{fmt(stats.net)}
          </span>
        </div>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "2px solid #e2e8f0" }}>
              {/* flag col */}
              <Th w={28} />
              <Th w={92}  sortable onClick={() => toggleSort("date")}>   Date{arrow("date")}</Th>
              <Th w={130} sortable onClick={() => toggleSort("entity")}> Entity{arrow("entity")}</Th>
              <Th w={140}>Account</Th>
              <Th>Description</Th>
              <Th w={168}>Category</Th>
              <Th w={46} align="center">CCY</Th>
              <Th w={90}  align="right" sortable onClick={() => toggleSort("amount")}>Dr{arrow("amount")}</Th>
              <Th w={90}  align="right">Cr</Th>
              <Th w={100} align="right">Net USD</Th>
              <Th w={38}  align="center" title="Exclude / re-include">⊘</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  style={{ padding: "70px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}
                >
                  No transactions match your filters
                </td>
              </tr>
            ) : (
              filtered.map((t, i) => {
                const ck =
                  t.cat === "intercompany"
                    ? t.net > 0
                      ? "intercompany_in"
                      : "intercompany_out"
                    : t.cat;
                const isExcl = t.isExcluded;
                const evenBg = i % 2 === 0 ? "#fff" : "#fafbfd";

                return (
                  <tr
                    key={`${t.uid}-${i}`}
                    style={{
                      background: isExcl ? "#f1f5f9" : evenBg,
                      opacity: isExcl ? 0.5 : 1,
                      borderBottom: "1px solid #f0f4f8",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => {
                      if (!isExcl)
                        (e.currentTarget as HTMLElement).style.background = "#eff6ff";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background = isExcl
                        ? "#f1f5f9"
                        : evenBg;
                    }}
                  >
                    {/* Flag */}
                    <td style={{ padding: "0 4px", textAlign: "center" }}>
                      {t.isAdjustment && (
                        <span
                          title="Manual adjustment"
                          style={{ fontSize: 8, fontWeight: 800, color: "#8b5cf6", letterSpacing: "0.03em" }}
                        >
                          ADJ
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td style={{ padding: "7px 8px", color: "#475569", whiteSpace: "nowrap" }}>
                      {t.date}
                    </td>

                    {/* Entity */}
                    <td style={{ padding: "7px 8px", whiteSpace: "nowrap" }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: ENT_COLOR[t.entity] || "#64748b",
                        }}
                      >
                        {t.entity}
                      </span>
                    </td>

                    {/* Account */}
                    <td
                      style={{
                        padding: "7px 8px", color: "#64748b",
                        maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                      title={t.account}
                    >
                      {t.account}
                    </td>

                    {/* Description */}
                    <td
                      style={{
                        padding: "7px 8px", color: "#1e293b",
                        maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}
                      title={[t.details, t.contra].filter(Boolean).join(" · ")}
                    >
                      <span style={{ textDecoration: isExcl ? "line-through" : "none" }}>
                        {t.details || t.contra || "—"}
                      </span>
                      {t.contra && t.details && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "#94a3b8" }}>
                          {t.contra}
                        </span>
                      )}
                    </td>

                    {/* Category badge + override dropdown */}
                    <td style={{ padding: "6px 8px", position: "relative" }}>
                      <button
                        onClick={() =>
                          setOverrideOpen(overrideOpen === t.uid ? null : t.uid)
                        }
                        title={
                          overrides[t.uid]
                            ? "Override active — click to change"
                            : "Click to override category"
                        }
                        style={{
                          fontSize: 10, fontWeight: 600, borderRadius: 999,
                          padding: "2px 8px", whiteSpace: "nowrap",
                          background: CAT_BG[ck]    || "#f1f5f9",
                          color:      CAT_COLORS[ck] || "#64748b",
                          border: overrides[t.uid]
                            ? `1.5px solid ${CAT_COLORS[ck] || "#64748b"}`
                            : "1px solid transparent",
                          cursor: "pointer",
                          display: "inline-flex", alignItems: "center", gap: 3,
                        }}
                      >
                        {CAT_LABELS[ck] || ck}
                        {overrides[t.uid] && (
                          <span style={{ fontSize: 8, opacity: 0.65 }}>✎</span>
                        )}
                      </button>

                      {overrideOpen === t.uid && (
                        <>
                          {/* Backdrop */}
                          <div
                            onClick={() => setOverrideOpen(null)}
                            style={{ position: "fixed", inset: 0, zIndex: 100 }}
                          />
                          {/* Dropdown */}
                          <div
                            style={{
                              position: "absolute", top: "100%", left: 0, zIndex: 200,
                              background: "#fff", border: "1px solid #e2e8f0",
                              borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
                              minWidth: 200, padding: 4,
                              maxHeight: 300, overflowY: "auto",
                            }}
                          >
                            <div
                              style={{
                                padding: "4px 10px 6px", fontSize: 9, fontWeight: 700,
                                color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em",
                              }}
                            >
                              Override Category
                            </div>

                            {ALL_CATS.filter(c => c !== "fx_conversion").map(c => (
                              <button
                                key={c}
                                onClick={() => {
                                  setCatOverride(t.uid, c);
                                  setOverrideOpen(null);
                                }}
                                style={{
                                  display: "block", width: "100%", textAlign: "left",
                                  padding: "5px 10px", fontSize: 11, borderRadius: 4,
                                  background: t.cat === c ? (CAT_BG[c] || "#f1f5f9") : "transparent",
                                  color:      t.cat === c ? (CAT_COLORS[c] || "#374151") : "#374151",
                                  border: "none", cursor: "pointer",
                                  fontWeight: t.cat === c ? 600 : 400,
                                }}
                                onMouseEnter={e =>
                                  ((e.currentTarget as HTMLElement).style.background = "#f1f5f9")
                                }
                                onMouseLeave={e =>
                                  ((e.currentTarget as HTMLElement).style.background =
                                    t.cat === c ? (CAT_BG[c] || "#f1f5f9") : "transparent")
                                }
                              >
                                {CAT_LABELS[c] || c}
                              </button>
                            ))}

                            {overrides[t.uid] && (
                              <>
                                <div style={{ height: 1, background: "#f1f5f9", margin: "4px 6px" }} />
                                <button
                                  onClick={() => {
                                    removeCatOverride(t.uid);
                                    setOverrideOpen(null);
                                  }}
                                  style={{
                                    display: "block", width: "100%", textAlign: "left",
                                    padding: "5px 10px", fontSize: 11, borderRadius: 4,
                                    background: "transparent", color: "#ef4444",
                                    border: "none", cursor: "pointer",
                                  }}
                                  onMouseEnter={e =>
                                    ((e.currentTarget as HTMLElement).style.background = "#fef2f2")
                                  }
                                  onMouseLeave={e =>
                                    ((e.currentTarget as HTMLElement).style.background = "transparent")
                                  }
                                >
                                  ✕ Remove override
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </td>

                    {/* CCY */}
                    <td
                      style={{
                        padding: "7px 8px", textAlign: "center",
                        fontSize: 10, fontWeight: 700, color: "#3b82f6",
                      }}
                    >
                      {t.currency}
                    </td>

                    {/* Dr */}
                    <td
                      style={{
                        padding: "7px 8px", textAlign: "right",
                        fontWeight: 500, color: "#16a34a", whiteSpace: "nowrap",
                      }}
                    >
                      {t.debit > 0 ? fmt(t.debit) : ""}
                    </td>

                    {/* Cr */}
                    <td
                      style={{
                        padding: "7px 8px", textAlign: "right",
                        fontWeight: 500, color: "#dc2626", whiteSpace: "nowrap",
                      }}
                    >
                      {t.credit > 0 ? fmt(t.credit) : ""}
                    </td>

                    {/* Net USD */}
                    <td
                      style={{
                        padding: "7px 8px", textAlign: "right", fontWeight: 700,
                        whiteSpace: "nowrap",
                        color:
                          t.net > 0
                            ? "#16a34a"
                            : t.net < 0
                            ? "#dc2626"
                            : "#94a3b8",
                      }}
                    >
                      {t.net > 0 ? "+" : ""}
                      {fmt(t.net)}
                    </td>

                    {/* Exclude toggle */}
                    <td style={{ padding: "7px 6px", textAlign: "center" }}>
                      <button
                        onClick={() => toggleExclude(t.uid)}
                        title={isExcl ? "Re-include in cashflow" : "Exclude from cashflow"}
                        style={{
                          border: "none", background: "none", cursor: "pointer",
                          fontSize: 14, lineHeight: 1,
                          opacity: isExcl ? 0.7 : 0.22,
                          transition: "opacity 0.15s",
                          color: isExcl ? "#ef4444" : "inherit",
                        }}
                        onMouseEnter={e =>
                          ((e.currentTarget as HTMLElement).style.opacity = "1")
                        }
                        onMouseLeave={e =>
                          ((e.currentTarget as HTMLElement).style.opacity = isExcl
                            ? "0.7"
                            : "0.22")
                        }
                      >
                        {isExcl ? "👁" : "⊘"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid #e2e8f0",
          background: "#fff",
          padding: "5px 20px",
          fontSize: 10,
          color: "#94a3b8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          {allRaw.length.toLocaleString()} total ·{" "}
          {excluded.size} excluded ·{" "}
          {Object.keys(overrides).length} overrides active
        </span>
        <span>Dr = Cash In · Cr = Cash Out · click a category badge to reassign</span>
      </div>
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        height: 30, fontSize: 12, borderRadius: 6,
        border: "1px solid #e2e8f0", paddingLeft: 8, paddingRight: 24,
        background: "#f8fafc", cursor: "pointer", appearance: "auto",
      }}
    >
      {children}
    </select>
  );
}

function Th({
  children,
  w,
  align,
  sortable,
  onClick,
  title,
}: {
  children?: React.ReactNode;
  w?: number;
  align?: "center" | "right";
  sortable?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <th
      title={title}
      onClick={onClick}
      style={{
        padding: "8px 8px",
        textAlign: align ?? "left",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "#475569",
        background: "#fff",
        borderBottom: "2px solid #e2e8f0",
        width: w,
        minWidth: w,
        cursor: sortable ? "pointer" : "default",
        userSelect: sortable ? "none" : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}
