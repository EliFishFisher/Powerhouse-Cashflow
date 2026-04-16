"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppData } from "@/hooks/use-app-data";
import { computeActiveTxns } from "@/lib/cashflow";
import { applyRule, extractPhrases, suggestCategory } from "@/lib/classify";
import { makeClassificationRule } from "@/lib/factories";
import { ALL_CATS, CAT_LABELS, CAT_COLORS, CAT_BG, ENTITIES } from "@/lib/constants";
import type { Category } from "@/lib/constants";

// Portfolio companies (excludes "Consolidated" which is a derived view)
const COMPANY_ENTITIES = ENTITIES.filter(e => e !== "Consolidated");
import type { ClassificationRule } from "@/lib/types";

type RuleField = ClassificationRule["field"];

const FIELD_LABELS: Record<RuleField, string> = {
  any:     "Any field",
  details: "Description",
  contra:  "Contra",
  account: "Account",
};

const EMPTY_FORM = {
  label:    "",
  keywords: [] as string[],
  field:    "any" as RuleField,
  cat:      "operating_out" as Category,
  enabled:  true,
  entities: [] as string[],   // empty = all companies
};

const inputStyle: React.CSSProperties = {
  width: "100%", height: 34, fontSize: 12, borderRadius: 6,
  border: "1px solid #e2e8f0", paddingLeft: 10, paddingRight: 10,
  outline: "none", background: "#fff", boxSizing: "border-box",
};

export default function RulesPage() {
  const {
    data, loading, serverOk, fxRates, excluded, overrides,
    isAdmin, companies, saveRules,
  } = useAppData();

  // Admin: which company's rules are being viewed/edited (no global "All" tab)
  const [activeEntity, setActiveEntity] = useState<string>(COMPANY_ENTITIES[0]);

  const [search,    setSearch]    = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [panelOpen, setPanelOpen] = useState(false);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [kwInput,   setKwInput]   = useState("");
  const [deleteId,  setDeleteId]  = useState<string | null>(null);
  const [saving,            setSaving]            = useState(false);
  const [dismissed,         setDismissed]         = useState<Set<string>>(new Set());
  const [suggestOpen,       setSuggestOpen]        = useState(true);
  const [expandedSuggestion,setExpandedSuggestion] = useState<string | null>(null);
  const migrationRan = useRef(false);

  // ── One-time migration: move entity-scoped rules from admin row → company rows ──
  // Rules created before full isolation had entities:["Orange Space"] stored in
  // the admin's data.rules. This effect runs once after data loads and moves them
  // to the correct company row, then clears admin's row.
  useEffect(() => {
    if (!isAdmin || loading || migrationRan.current) return;
    const scopedRules = data.rules.filter(r => (r.entities ?? []).length > 0);
    if (!scopedRules.length) { migrationRan.current = true; return; }

    migrationRan.current = true;

    (async () => {
      // Group rules by target entity
      const byEntity = new Map<string, typeof scopedRules>();
      scopedRules.forEach(rule => {
        (rule.entities ?? []).forEach(entity => {
          if (!byEntity.has(entity)) byEntity.set(entity, []);
          // Store in company row without the entity scope (they're now isolated)
          byEntity.get(entity)!.push({ ...rule, entities: [] });
        });
      });

      // Write each company's new rules (deduplicate by uid)
      for (const [entity, rules] of byEntity) {
        const co = companies.find(c => c.entity_name === entity);
        const existing = co?.data.rules ?? [];
        const existingUids = new Set(existing.map(r => r.uid));
        const toAdd = rules.filter(r => !existingUids.has(r.uid));
        if (toAdd.length) await saveRules([...existing, ...toAdd], entity);
      }

      // Clear admin's row (remove the now-migrated entity-scoped rules; keep truly global ones)
      const globalRules = data.rules.filter(r => (r.entities ?? []).length === 0);
      await saveRules(globalRules, undefined);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, loading, data.rules.length]);   // trigger once when data is ready

  // ── Auto-open from drawer "Turn into rule" link ────────────────────────────
  const router = useRouter();
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const keyword = params.get("keyword");
    const cat     = params.get("cat") as Category | null;
    if (keyword) {
      setEditId(null);
      setKwInput("");
      setForm({
        label:    keyword.length > 40 ? keyword.slice(0, 40) : keyword,
        keywords: [keyword.toLowerCase()],
        field:    "details" as RuleField,
        cat:      (cat && (ALL_CATS as readonly string[]).includes(cat)) ? cat : "operating_out",
        enabled:  true,
        entities: [],
      });
      setPanelOpen(true);
      // Clean the URL so refreshing doesn't re-open the panel
      router.replace("/rules");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);   // run once on mount only

  // ── Derived ───────────────────────────────────────────────────────────────
  // Each company has fully isolated rules stored in its own row.
  const rulesForEntity = useMemo(() => {
    if (!isAdmin) return data.rules;
    return companies.find(c => c.entity_name === activeEntity)?.data.rules ?? [];
  }, [isAdmin, activeEntity, companies, data.rules]);

  const sorted = useMemo(
    () => [...rulesForEntity].sort((a, b) => a.priority - b.priority),
    [rulesForEntity],
  );

  const filtered = useMemo(() => {
    let rs = sorted;
    if (catFilter !== "All") rs = rs.filter(r => r.cat === catFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rs = rs.filter(
        r =>
          r.label.toLowerCase().includes(q) ||
          r.keywords.some(k => k.toLowerCase().includes(q)),
      );
    }
    return rs;
  }, [sorted, catFilter, search]);

  // Live match counts against active transactions (scoped to active entity if selected)
  const allTxns = useMemo(() => {
    const all = computeActiveTxns(
      data.transactions, data.adjustments, excluded, overrides, [], fxRates,
    );
    if (isAdmin && activeEntity !== "All") {
      return all.filter(t => t.entity === activeEntity);
    }
    return all;
  }, [data.transactions, data.adjustments, excluded, overrides, fxRates, isAdmin, activeEntity]);

  const matchCounts = useMemo(() => {
    const c: Record<string, number> = {};
    sorted.forEach(r => {
      c[r.uid] = allTxns.filter(t => applyRule(r, t)).length;
    });
    return c;
  }, [sorted, allTxns]);

  // ── Rule suggestions: patterns in transactions not already covered ─────────
  const suggestions = useMemo(() => {
    if (!allTxns.length) return [];

    // Only look at transactions that no existing enabled rule covers
    const enabledRules = sorted.filter(r => r.enabled);
    const unmatched = allTxns.filter(t => !enabledRules.some(r => applyRule(r, t)));

    // Count each keyword/phrase across unmatched transactions
    const counts = new Map<string, { count: number; cat: Category }>();
    unmatched.forEach(t => {
      const guessedCat = (suggestCategory(t) || t.cat) as Category;
      const seen = new Set<string>();
      // Only extract from the description field
      extractPhrases({ details: t.details }).forEach(phrase => {
        if (seen.has(phrase) || phrase.length < 3) return;
        seen.add(phrase);
        const prev = counts.get(phrase);
        if (prev) prev.count++;
        else counts.set(phrase, { count: 1, cat: guessedCat });
      });
    });

    return [...counts.entries()]
      .filter(([kw, v]) => v.count >= 2 && !dismissed.has(kw))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 7)
      .map(([keyword, { count, cat }]) => ({ keyword, count, cat }));
  }, [allTxns, sorted, dismissed]);

  // Transactions matching each suggestion keyword (for inline breakdown)
  const suggestionTxnsMap = useMemo(() => {
    const map = new Map<string, typeof allTxns>();
    suggestions.forEach(s => {
      map.set(s.keyword, allTxns.filter(t =>
        (t.details || "").toLowerCase().includes(s.keyword) ||
        (t.contra  || "").toLowerCase().includes(s.keyword) ||
        (t.account || "").toLowerCase().includes(s.keyword),
      ));
    });
    return map;
  }, [suggestions, allTxns]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const openAdd = useCallback((prefill?: { keyword: string; cat: Category }) => {
    setEditId(null);
    setKwInput("");
    setForm(prefill
      ? { label: prefill.keyword, keywords: [prefill.keyword], field: "details" as RuleField, cat: prefill.cat, enabled: true, entities: [] }
      : EMPTY_FORM,
    );
    setPanelOpen(true);
  }, []);

  const openEdit = useCallback((rule: ClassificationRule) => {
    setEditId(rule.uid);
    setKwInput("");
    setForm({
      label:    rule.label,
      keywords: [...rule.keywords],
      field:    rule.field,
      cat:      rule.cat,
      enabled:  rule.enabled,
      entities: rule.entities ?? [],
    });
    setPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setEditId(null);
    setKwInput("");
  }, []);

  // The entity whose row we are currently editing (undefined = admin's own row)
  const saveTarget = isAdmin && activeEntity !== "All" ? activeEntity : undefined;

  // Helper: returns the rules array + save target for the current view.
  // Admin always operates on the selected company's own row.
  // Non-admin operates on their own row (saveTarget = undefined).
  const resolveSource = useCallback(() => {
    if (isAdmin) {
      const co = companies.find(c => c.entity_name === activeEntity);
      return { rules: co?.data.rules ?? [], tgt: saveTarget };
    }
    return { rules: data.rules, tgt: undefined as string | undefined };
  }, [isAdmin, activeEntity, data.rules, companies, saveTarget]);

  const handleSave = useCallback(async () => {
    const pendingKw = kwInput.trim().toLowerCase();
    const keywords = [...form.keywords, ...(pendingKw ? [pendingKw] : [])]
      .map(k => k.trim().toLowerCase())
      .filter(Boolean);
    if (!form.label.trim() || keywords.length === 0) {
      alert("Please provide a rule name and at least one keyword.");
      return;
    }
    setSaving(true);
    try {
      const updated = { label: form.label.trim(), keywords, field: form.field, cat: form.cat, enabled: form.enabled, entities: form.entities };
      const { rules: src, tgt } = resolveSource();
      if (editId) {
        await saveRules(src.map(r => r.uid === editId ? { ...r, ...updated } : r), tgt);
      } else {
        await saveRules([...src, makeClassificationRule(updated)], tgt);
      }
      closePanel();
    } finally {
      setSaving(false);
    }
  }, [form, editId, data.rules, companies, activeEntity, saveRules, saveTarget, resolveSource, closePanel, kwInput]);

  const handleToggle = useCallback(async (uid: string) => {
    const { rules: src, tgt } = resolveSource();
    await saveRules(src.map(r => r.uid === uid ? { ...r, enabled: !r.enabled } : r), tgt);
  }, [resolveSource, saveRules]);

  const handleDelete = useCallback(async (uid: string) => {
    const { rules: src, tgt } = resolveSource();
    await saveRules(src.filter(r => r.uid !== uid), tgt);
    setDeleteId(null);
  }, [resolveSource, saveRules]);

  const handleMove = useCallback(async (uid: string, dir: "up" | "down") => {
    const { rules: src, tgt } = resolveSource();
    const arr = [...src].sort((a, b) => a.priority - b.priority);
    const idx  = arr.findIndex(r => r.uid === uid);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= arr.length) return;
    const pa = arr[idx].priority;
    const pb = arr[swap].priority;
    await saveRules(
      src.map(r => {
        if (r.uid === arr[idx].uid)  return { ...r, priority: pb };
        if (r.uid === arr[swap].uid) return { ...r, priority: pa };
        return r;
      }),
      tgt,
    );
  }, [resolveSource, saveRules]);

  // ── Guard states ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-1 items-center justify-center">
      <p className="animate-pulse text-sm text-slate-400">Loading rules…</p>
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
      <div className="shrink-0 flex flex-col border-b border-slate-200 bg-white">

        {/* Company tabs — admin only (one tab per company, fully isolated) */}
        {isAdmin && companies.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: "1px solid #f1f5f9", paddingLeft: 20, paddingRight: 20 }}>
            {COMPANY_ENTITIES.map(entity => {
              const isActive = activeEntity === entity;
              const count    = (companies.find(c => c.entity_name === entity)?.data.rules ?? []).length;
              return (
                <button
                  key={entity}
                  onClick={() => setActiveEntity(entity)}
                  style={{
                    height: 36, padding: "0 14px", fontSize: 11, fontWeight: isActive ? 700 : 500,
                    background: "none", border: "none", cursor: "pointer",
                    borderBottom: `2px solid ${isActive ? "#3b82f6" : "transparent"}`,
                    color: isActive ? "#1d4ed8" : "#64748b",
                    display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
                    marginBottom: -1,
                  }}
                >
                  {entity}
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    background: isActive ? "#dbeafe" : "#f1f5f9",
                    color: isActive ? "#1d4ed8" : "#94a3b8",
                    borderRadius: 999, padding: "1px 6px",
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#94a3b8", pointerEvents: "none" }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or keyword…"
            style={{ paddingLeft: 28, height: 30, fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0", width: 230, background: "#f8fafc", outline: "none" }}
          />
        </div>

        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ height: 30, fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0", paddingLeft: 8, background: "#f8fafc" }}>
          <option value="All">All categories</option>
          {ALL_CATS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
        </select>

        <span style={{ fontSize: 11, color: "#64748b" }}>
          <strong style={{ color: "#1e293b" }}>{filtered.length}</strong>
          {" "}rule{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== sorted.length && ` of ${sorted.length}`}
          {" "}·{" "}
          <strong style={{ color: "#1e293b" }}>{sorted.filter(r => r.enabled).length}</strong> enabled
        </span>

        <button onClick={() => openAdd()} style={{
          marginLeft: "auto", height: 30, padding: "0 14px", fontSize: 12, fontWeight: 600,
          background: "#1e293b", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Rule
        </button>
        </div>{/* end inner flex row */}
      </div>{/* end toolbar */}

      {/* ── Suggested Rules ────────────────────────────────────────────────── */}
      {suggestions.length > 0 && (
        <div style={{ flexShrink: 0, background: "#fffbeb", borderBottom: "2px solid #fde68a" }}>
          {/* Header row */}
          <div
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 20px", cursor: "pointer" }}
            onClick={() => setSuggestOpen(o => !o)}
          >
            <span style={{ fontSize: 15 }}>💡</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#92400e" }}>Suggested Rules</span>
            <span style={{ fontSize: 10, fontWeight: 700, background: "#fde68a", color: "#92400e", borderRadius: 999, padding: "1px 7px" }}>
              {suggestions.length}
            </span>
            <span style={{ fontSize: 10, color: "#b45309", opacity: 0.8 }}>
              Patterns in{" "}
              <strong>{activeEntity === "All" ? "all companies'" : `${activeEntity}'s`}</strong>
              {" "}transactions — click a row to preview matches
            </span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: "#b45309" }}>
              {suggestOpen ? "▲ hide" : "▼ show"}
            </span>
          </div>

          {suggestOpen && (
            <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
              {suggestions.map(s => {
                const isExpanded = expandedSuggestion === s.keyword;
                const matchTxns  = suggestionTxnsMap.get(s.keyword) ?? [];
                return (
                  <div key={s.keyword} style={{
                    background: "#fff", border: `1px solid ${isExpanded ? "#f59e0b" : "#fde68a"}`,
                    borderRadius: 7, overflow: "hidden",
                    boxShadow: isExpanded ? "0 2px 8px rgba(245,158,11,0.12)" : "none",
                  }}>
                    {/* Main row — clickable to expand */}
                    <div
                      onClick={() => setExpandedSuggestion(isExpanded ? null : s.keyword)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", cursor: "pointer" }}
                    >
                      {/* Expand chevron */}
                      <span style={{ fontSize: 10, color: "#b45309", display: "inline-block", transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>›</span>

                      {/* Keyword */}
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        "{s.keyword}"
                      </span>

                      {/* Match count */}
                      <span style={{ fontSize: 10, color: "#64748b", flexShrink: 0 }}>
                        {s.count} match{s.count !== 1 ? "es" : ""}
                      </span>

                      {/* Suggested category badge */}
                      <span style={{
                        fontSize: 10, fontWeight: 600, borderRadius: 999, padding: "2px 9px",
                        flexShrink: 0, whiteSpace: "nowrap",
                        background: CAT_BG[s.cat]    || "#f1f5f9",
                        color:      CAT_COLORS[s.cat] || "#64748b",
                      }}>
                        {CAT_LABELS[s.cat] || s.cat}
                      </span>

                      {/* Add Rule button */}
                      <button
                        onClick={e => { e.stopPropagation(); openAdd({ keyword: s.keyword, cat: s.cat }); }}
                        style={{ height: 26, padding: "0 11px", fontSize: 11, fontWeight: 600, background: "#1e293b", color: "#fff", border: "none", borderRadius: 5, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}
                      >
                        + Add Rule
                      </button>

                      {/* Dismiss */}
                      <button
                        onClick={e => { e.stopPropagation(); setDismissed(d => new Set([...d, s.keyword])); }}
                        title="Dismiss suggestion"
                        style={{ width: 26, height: 26, background: "none", border: "1px solid #e2e8f0", borderRadius: 5, cursor: "pointer", fontSize: 12, color: "#94a3b8", flexShrink: 0 }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Expanded transaction breakdown */}
                    {isExpanded && (
                      <div style={{ borderTop: "1px solid #fde68a", background: "#fffdf5" }}>
                        <div style={{ padding: "6px 14px 4px", fontSize: 10, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Matching transactions ({matchTxns.length})
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid #fde68a" }}>
                              {["Date", "Entity", "Description", "Amount"].map(h => (
                                <th key={h} style={{ padding: "4px 14px", textAlign: h === "Amount" ? "right" : "left", fontWeight: 700, fontSize: 9, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {matchTxns.slice(0, 8).map((t, i) => (
                              <tr key={t.uid} style={{ background: i % 2 === 0 ? "transparent" : "#fffbeb", borderBottom: "1px solid #fef3c7" }}>
                                <td style={{ padding: "4px 14px", color: "#64748b", whiteSpace: "nowrap" }}>{t.date}</td>
                                <td style={{ padding: "4px 14px", color: "#92400e", fontWeight: 600, whiteSpace: "nowrap" }}>{t.entity}</td>
                                <td style={{ padding: "4px 14px", color: "#1e293b", maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.details || t.contra || t.account || "—"}</td>
                                <td style={{ padding: "4px 14px", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: t.net > 0 ? "#16a34a" : "#dc2626" }}>
                                  {t.net > 0 ? "+" : ""}{t.net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t.currency}
                                </td>
                              </tr>
                            ))}
                            {matchTxns.length > 8 && (
                              <tr>
                                <td colSpan={4} style={{ padding: "5px 14px", fontSize: 10, color: "#b45309", fontStyle: "italic" }}>
                                  … and {matchTxns.length - 8} more
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Rule list ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚙️</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
              {sorted.length === 0 ? "No rules yet" : "No rules match your filters"}
            </div>
            {sorted.length === 0 && (
              <div style={{ fontSize: 12 }}>
                Click <strong>+ Add Rule</strong> to auto-classify future transactions
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(rule => {
              const sortedIdx = sorted.findIndex(r => r.uid === rule.uid);
              const isFirst   = sortedIdx === 0;
              const isLast    = sortedIdx === sorted.length - 1;
              const count     = matchCounts[rule.uid] ?? 0;

              return (
                <div key={rule.uid} style={{
                  background: rule.enabled ? "#fff" : "#f8fafc",
                  border: `1px solid ${rule.enabled ? "#e2e8f0" : "#eaeff5"}`,
                  borderRadius: 8, padding: "11px 14px",
                  opacity: rule.enabled ? 1 : 0.6,
                  display: "flex", alignItems: "center", gap: 12,
                  transition: "opacity 0.15s, box-shadow 0.15s",
                }}
                  onMouseEnter={e => rule.enabled && ((e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)")}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = "none")}
                >
                  {/* Priority move buttons */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                    <button onClick={() => handleMove(rule.uid, "up")} disabled={isFirst}
                      style={{ border: "none", background: "none", cursor: isFirst ? "default" : "pointer", fontSize: 10, color: isFirst ? "#e2e8f0" : "#94a3b8", lineHeight: 1, padding: "1px 3px" }}>▲</button>
                    <button onClick={() => handleMove(rule.uid, "down")} disabled={isLast}
                      style={{ border: "none", background: "none", cursor: isLast ? "default" : "pointer", fontSize: 10, color: isLast ? "#e2e8f0" : "#94a3b8", lineHeight: 1, padding: "1px 3px" }}>▼</button>
                  </div>

                  {/* Priority number */}
                  <div style={{ width: 22, textAlign: "center", fontSize: 10, fontWeight: 700, color: "#d1d5db", flexShrink: 0 }}>
                    #{sortedIdx + 1}
                  </div>

                  {/* Enable toggle */}
                  <Toggle checked={rule.enabled} onChange={() => handleToggle(rule.uid)} />

                  {/* Category badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "3px 9px",
                    whiteSpace: "nowrap", flexShrink: 0,
                    background: CAT_BG[rule.cat]    || "#f1f5f9",
                    color:      CAT_COLORS[rule.cat] || "#64748b",
                  }}>
                    {CAT_LABELS[rule.cat] || rule.cat}
                  </span>

                  {/* Label + keywords + entity scope */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{rule.label}</div>
                    <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, color: "#94a3b8", marginRight: 2 }}>
                        {FIELD_LABELS[rule.field]}:
                      </span>
                      {rule.keywords.map(kw => (
                        <span key={kw} style={{
                          fontSize: 10, background: "#f1f5f9", color: "#475569",
                          border: "1px solid #e8edf3", borderRadius: 4, padding: "1px 6px",
                        }}>{kw}</span>
                      ))}
                    </div>
                    {/* Entity scope chips */}
                    {rule.entities && rule.entities.length > 0 && (
                      <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>Applies to:</span>
                        {rule.entities.map(e => (
                          <span key={e} style={{
                            fontSize: 10, fontWeight: 600,
                            background: "#ede9fe", color: "#6d28d9",
                            border: "1px solid #ddd6fe", borderRadius: 4, padding: "1px 6px",
                          }}>{e}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Match count */}
                  <div style={{ textAlign: "center", flexShrink: 0, minWidth: 52 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2, color: count > 0 ? "#1e293b" : "#d1d5db" }}>
                      {count}
                    </div>
                    <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      matches
                    </div>
                  </div>

                  {/* Edit / Delete */}
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <ActionBtn onClick={() => openEdit(rule)} title="Edit rule">✏️</ActionBtn>
                    <ActionBtn onClick={() => setDeleteId(rule.uid)} title="Delete rule" danger>🗑</ActionBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit panel ───────────────────────────────────────────────── */}
      {panelOpen && (
        <>
          <div onClick={closePanel} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 50, width: 420,
            background: "#fff", boxShadow: "-4px 0 40px rgba(0,0,0,0.12)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{ background: "#0f172a", padding: "16px 20px", borderBottom: "1px solid #1e293b" }}>
              <div style={{ fontSize: 10, color: "#475569", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                {editId ? "Edit Rule" : "New Rule"}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>
                {editId ? "Update classification rule" : "Create classification rule"}
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>

              <FormField label="Rule name">
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Payroll payments"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Keywords" hint="press Enter or + to add">
                {/* Tag input box */}
                <div style={{
                  display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center",
                  border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 6px",
                  background: "#fff", minHeight: 38, cursor: "text",
                }}
                  onClick={e => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}
                >
                  {/* Existing keyword chips */}
                  {form.keywords.map((kw, i) => (
                    <span key={i} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      background: "#f1f5f9", border: "1px solid #e2e8f0",
                      borderRadius: 4, padding: "2px 6px 2px 8px",
                      fontSize: 11, color: "#334155", fontWeight: 500,
                    }}>
                      {kw}
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, keywords: f.keywords.filter((_, j) => j !== i) })); }}
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", border: "none", background: "#cbd5e1", color: "#64748b", cursor: "pointer", fontSize: 10, lineHeight: 1, padding: 0 }}
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {/* Text input + add button */}
                  <div style={{ display: "flex", alignItems: "center", flex: 1, minWidth: 120, gap: 4 }}>
                    <input
                      value={kwInput}
                      onChange={e => setKwInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const kw = kwInput.trim().toLowerCase();
                          if (kw && !form.keywords.includes(kw)) setForm(f => ({ ...f, keywords: [...f.keywords, kw] }));
                          setKwInput("");
                        } else if (e.key === "Backspace" && kwInput === "" && form.keywords.length > 0) {
                          setForm(f => ({ ...f, keywords: f.keywords.slice(0, -1) }));
                        }
                      }}
                      placeholder={form.keywords.length === 0 ? "e.g. salary, rent, deel…" : "Add another…"}
                      style={{ flex: 1, border: "none", outline: "none", fontSize: 12, background: "transparent", minWidth: 80, height: 24 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const kw = kwInput.trim().toLowerCase();
                        if (kw && !form.keywords.includes(kw)) setForm(f => ({ ...f, keywords: [...f.keywords, kw] }));
                        setKwInput("");
                      }}
                      style={{
                        height: 24, padding: "0 8px", fontSize: 11, fontWeight: 700,
                        background: kwInput.trim() ? "#3b82f6" : "#e2e8f0",
                        color: kwInput.trim() ? "#fff" : "#94a3b8",
                        border: "none", borderRadius: 4, cursor: kwInput.trim() ? "pointer" : "default",
                        transition: "background 0.15s, color 0.15s", flexShrink: 0,
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              </FormField>

              <FormField label="Match in field">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["any", "details", "contra", "account"] as RuleField[]).map(f => (
                    <button key={f} onClick={() => setForm(p => ({ ...p, field: f }))}
                      style={{
                        height: 28, padding: "0 12px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                        border: `1px solid ${form.field === f ? "#3b82f6" : "#e2e8f0"}`,
                        background: form.field === f ? "#eff6ff" : "#fff",
                        color: form.field === f ? "#1d4ed8" : "#475569",
                        fontWeight: form.field === f ? 600 : 400,
                      }}>
                      {FIELD_LABELS[f]}
                    </button>
                  ))}
                </div>
              </FormField>

              <FormField label="Assign to category">
                <select value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value as Category }))}
                  style={{ ...inputStyle, paddingLeft: 8 }}>
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

              <FormField label="Company scope" hint="leave blank to apply to all companies">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {COMPANY_ENTITIES.map(ent => {
                    const selected = form.entities.includes(ent);
                    return (
                      <button
                        key={ent}
                        type="button"
                        onClick={() =>
                          setForm(f => ({
                            ...f,
                            entities: selected
                              ? f.entities.filter(e => e !== ent)
                              : [...f.entities, ent],
                          }))
                        }
                        style={{
                          height: 28, padding: "0 12px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                          border: `1px solid ${selected ? "#7c3aed" : "#e2e8f0"}`,
                          background: selected ? "#ede9fe" : "#fff",
                          color: selected ? "#6d28d9" : "#475569",
                          fontWeight: selected ? 700 : 400,
                          transition: "all 0.15s",
                        }}
                      >
                        {ent}
                      </button>
                    );
                  })}
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: "#94a3b8" }}>
                  {form.entities.length === 0
                    ? "✦ Applies to all companies"
                    : `Applies to: ${form.entities.join(", ")}`}
                </div>
              </FormField>

              <FormField label="Status">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Toggle checked={form.enabled} onChange={() => setForm(f => ({ ...f, enabled: !f.enabled }))} />
                  <span style={{ fontSize: 12, color: form.enabled ? "#16a34a" : "#94a3b8" }}>
                    {form.enabled ? "Enabled — will run on all transactions" : "Disabled — rule is paused"}
                  </span>
                </div>
              </FormField>

            </div>

            {/* Footer */}
            <div style={{ padding: "14px 20px", borderTop: "1px solid #f1f5f9", background: "#fafbfd", display: "flex", gap: 8 }}>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 1, height: 36, background: saving ? "#94a3b8" : "#1e293b", color: "#fff",
                border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer",
              }}>
                {saving ? "Saving…" : editId ? "Save Changes" : "Create Rule"}
              </button>
              <button onClick={closePanel} style={{
                height: 36, padding: "0 16px", background: "#fff", color: "#64748b",
                border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, cursor: "pointer",
              }}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirmation ─────────────────────────────────────────────── */}
      {deleteId && (() => {
        const rule = rulesForEntity.find(r => r.uid === deleteId);
        return (
          <>
            <div onClick={() => setDeleteId(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(2px)" }} />
            <div style={{
              position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
              zIndex: 70, background: "#fff", borderRadius: 12, padding: "24px 28px",
              width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>Delete rule?</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
                <strong>"{rule?.label}"</strong> will be permanently removed and future transactions will no longer be auto-classified by it.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => handleDelete(deleteId)} style={{
                  flex: 1, height: 34, background: "#ef4444", color: "#fff",
                  border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>Delete</button>
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{
      width: 36, height: 20, borderRadius: 999, border: "none", flexShrink: 0,
      background: checked ? "#22c55e" : "#e2e8f0",
      position: "relative", cursor: "pointer", transition: "background 0.2s",
    }}>
      <span style={{
        position: "absolute", top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: "50%", background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
      }} />
    </button>
  );
}

function ActionBtn({
  children, onClick, title, danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 30, height: 30, borderRadius: 6, border: "1px solid #e2e8f0",
      background: "#fff", cursor: "pointer", fontSize: 13,
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.15s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background    = danger ? "#fef2f2" : "#f8fafc";
        (e.currentTarget as HTMLElement).style.borderColor   = danger ? "#fecaca" : "#cbd5e1";
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

function FormField({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ marginBottom: 7, display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {label}
        </span>
        {hint && <span style={{ fontSize: 10, color: "#94a3b8" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}
