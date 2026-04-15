"use client";

import { useState, useMemo, useCallback } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { FileLoader } from "@/components/file-loader";
import { Drawer } from "@/components/drawer";
import { Sparkline } from "@/components/sparkline";
import { computeActiveTxns, buildDerived, groupDerived, addBalances, buildWeekly, groupBank } from "@/lib/cashflow";
import { getPeriodKey, periodLabel, weekLabel, isoWeek, fmt } from "@/lib/format";
import { makeAdjustment } from "@/lib/factories";
import { runReconciliation } from "@/lib/reconcile";
import { apiClient } from "@/lib/api-client";
import { CAT_LABELS, CAT_COLORS, CAT_BG, ENT_COLOR, ENTITIES, OP_SUBCATS } from "@/lib/constants";
import type { Category, ViewPeriod } from "@/lib/constants";
import type { DrawerState, Transaction } from "@/lib/types";

export default function CashflowPage() {
  const { data, loading, serverOk, fxRates, excluded, overrides, isAdmin, companies } = useAppData();

  const [entity,      setEntity]      = useState("Consolidated");
  const [viewPeriod,  setViewPeriod]  = useState<ViewPeriod>("monthly");
  const [dropOpen,    setDropOpen]    = useState(false);
  const [drawer,      setDrawer]      = useState<DrawerState | null>(null);
  const [inflowOpen,  setInflowOpen]  = useState(true);
  const [outflowOpen, setOutflowOpen] = useState(true);
  const [opSubOpen,   setOpSubOpen]   = useState(false);
  const [adjOpen,     setAdjOpen]     = useState(false);
  const [reconDismissed, setReconDismissed] = useState(false);
  const [adjForm, setAdjForm] = useState({
    entity: "Corneat",
    date: new Date().toISOString().slice(0, 10),
    description: "",
    amount: "",
    cat: "operating_out" as Category,
  });

  const activeTxns = useMemo(() =>
    computeActiveTxns(data.transactions, data.adjustments, excluded, overrides, data.rules, fxRates),
    [data.transactions, data.adjustments, excluded, overrides, data.rules, fxRates]
  );

  const weeks = useMemo(() => [...new Set(activeTxns.map(t => t.week))].sort(), [activeTxns]);

  const derived = useMemo(() => buildDerived(activeTxns, entity, weeks), [activeTxns, entity, weeks]);

  const bankDerived = useMemo(() => {
    const raw = [...data.transactions, ...data.adjustments];
    const sub = entity === "Consolidated" ? raw : raw.filter(t => t.entity === entity);
    return addBalances(weeks.map(w => ({
      week: w, cats: {},
      net: sub.filter(t => t.week === w).reduce((s, t) => s + t.net, 0),
    })), 0);
  }, [data.transactions, data.adjustments, entity, weeks]);

  const displayDerived = useMemo(() => groupDerived(derived, viewPeriod), [derived, viewPeriod]);
  const displayBank    = useMemo(() => groupBank(bankDerived, weeks, viewPeriod), [bankDerived, weeks, viewPeriod]);

  const totIn  = derived.reduce((s, d) => s + d.total_in, 0);
  const totOut = derived.reduce((s, d) => s + d.total_out, 0);
  const openingBal = derived.length ? derived[0].opening_bal : 0;
  const closingBal = derived.length ? derived[derived.length - 1].closing_bal : 0;

  const openDrawer = useCallback((week: string, cat: string, label: string) => {
    setDrawer({ week, cat, title: label });
  }, []);

  const drawerTxns = useMemo(() => {
    if (!drawer) return [];
    const { week, cat } = drawer;
    return activeTxns.filter(t => {
      const mW = viewPeriod === "weekly" ? t.week === week : getPeriodKey(t.week, viewPeriod) === week;
      const mE = entity === "Consolidated" ? true : t.entity === entity;
      const mC = (() => {
        if (t.cat === "fx_conversion") return false;
        if (cat === "intercompany_in")  return t.cat === "intercompany" && t.net > 0;
        if (cat === "intercompany_out") return t.cat === "intercompany" && t.net < 0;
        if (cat === "all_in")           return t.net > 0;
        if (cat === "all_out")          return t.net < 0;
        if (cat === "operating_out")    return t.cat === "operating_out" || (OP_SUBCATS as readonly string[]).includes(t.cat);
        return t.cat === cat;
      })();
      return mW && mE && mC;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [drawer, activeTxns, viewPeriod, entity]);

  const handleAddAdjustment = useCallback(async () => {
    const amt = parseFloat(adjForm.amount);
    if (!adjForm.description.trim() || isNaN(amt) || amt === 0) {
      alert("Please fill in description and a non-zero amount."); return;
    }
    const adj = makeAdjustment({ ...adjForm, amount: amt });
    const next = [...data.adjustments, adj];
    await apiClient.saveAdjustments(next as Transaction[]);
    const allTxns = [...data.transactions, ...next];
    const issues  = runReconciliation(allTxns, excluded, overrides);
    await apiClient.saveReconStatus({
      lastRun: new Date().toISOString(),
      errorCount: issues.filter(i => i.severity === "error").length,
      warningCount: issues.filter(i => i.severity === "warning").length,
      issues,
    });
    setAdjForm(p => ({ ...p, description: "", amount: "" }));
    setAdjOpen(false);
    window.location.reload();
  }, [adjForm, data.adjustments, data.transactions, excluded, overrides]);

  // ── Table cell helpers ─────────────────────────────────────────────────────
  const C = ({ v, week, cat, label, blue = false }: { v: number; week: string; cat: string; label: string; blue?: boolean }) => {
    const clk = !!(week && cat && v !== 0 && !blue);
    const col = blue ? "#2563eb" : v > 0 ? "#16a34a" : v < 0 ? "#dc2626" : "#94a3b8";
    const bg0 = v > 0 ? "rgba(22,163,74,0.045)" : v < 0 ? "rgba(220,38,38,0.045)" : "transparent";
    return (
      <td onClick={clk ? () => openDrawer(week, cat, label) : undefined}
        style={{ width: 130, minWidth: 130, textAlign: "right", padding: "0 11px", height: 33, fontSize: 11, fontWeight: 400, color: col, background: bg0, borderLeft: "1px solid #f0f4f8", cursor: clk ? "pointer" : "default", whiteSpace: "nowrap", position: "relative" }}
        onMouseEnter={e => { if (clk) { (e.currentTarget as HTMLElement).style.background = v > 0 ? "rgba(22,163,74,0.15)" : "rgba(220,38,38,0.15)"; (e.currentTarget as HTMLElement).style.outline = `1.5px solid ${v > 0 ? "#22c55e" : "#ef4444"}`; } }}
        onMouseLeave={e => { if (clk) { (e.currentTarget as HTMLElement).style.background = bg0; (e.currentTarget as HTMLElement).style.outline = "none"; } }}>
        {blue && <span style={{ fontSize: 8, color: "#93c5fd", marginRight: 2, fontWeight: 600 }}>USD</span>}
        {fmt(v)}{clk && v !== 0 && <span style={{ position: "absolute", top: 3, right: 3, fontSize: 7, opacity: 0.45 }}>↗</span>}
      </td>
    );
  };

  const TotCell = ({ v, week, cat, label, isOut = false }: { v: number; week: string; cat: string; label: string; isOut?: boolean }) => {
    const col = isOut ? (v < 0 ? "#b91c1c" : "#94a3b8") : (v > 0 ? "#15803d" : "#94a3b8");
    const bg0 = isOut ? (v < 0 ? "rgba(220,38,38,0.08)" : "transparent") : (v > 0 ? "rgba(22,163,74,0.09)" : "transparent");
    return (
      <td onClick={v !== 0 ? () => openDrawer(week, cat, label) : undefined}
        style={{ width: 130, minWidth: 130, textAlign: "right", padding: "0 11px", height: 40, fontSize: 12, fontWeight: 700, color: col, background: bg0, borderLeft: isOut ? "1px solid #fecaca" : "1px solid #dcfce7", cursor: v !== 0 ? "pointer" : "default", whiteSpace: "nowrap", position: "relative" }}
        onMouseEnter={e => { if (v !== 0) { (e.currentTarget as HTMLElement).style.background = isOut ? "rgba(220,38,38,0.15)" : "rgba(22,163,74,0.15)"; (e.currentTarget as HTMLElement).style.outline = `1.5px solid ${isOut ? "#ef4444" : "#22c55e"}`; } }}
        onMouseLeave={e => { if (v !== 0) { (e.currentTarget as HTMLElement).style.background = bg0; (e.currentTarget as HTMLElement).style.outline = "none"; } }}>
        {v !== 0 && <span style={{ position: "absolute", top: 3, right: 3, fontSize: 7, opacity: 0.45 }}>↗</span>}{fmt(v)}
      </td>
    );
  };

  const Lbl = ({ children, indent = 0, bold = false }: { children: React.ReactNode; indent?: number; bold?: boolean }) => (
    <td style={{ paddingLeft: 14 + indent * 14, paddingRight: 10, height: bold ? 40 : 33, fontSize: bold ? 11.5 : 10.5, fontWeight: bold ? 700 : 400, color: bold ? "#1e293b" : "#475569", borderRight: "2px solid #e2e8f0", position: "sticky", left: 0, zIndex: 5, background: "white", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
      {children}
    </td>
  );

  const SecHdr = ({ label, open, toggle, color }: { label: string; open: boolean; toggle: () => void; color: string }) => (
    <tr style={{ background: "#f8fafc", cursor: "pointer" }} onClick={toggle}>
      <td colSpan={displayDerived.length + 1} style={{ padding: "6px 14px", borderBottom: "1px solid #e8edf2", borderTop: "2px solid #e2e8f0", position: "sticky", left: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 12, color, display: "inline-block", transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform .2s" }}>▼</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#475569" }}>{label}</span>
          <span style={{ fontSize: 9, color: "#94a3b8", fontStyle: "italic" }}>{open ? "collapse" : "expand"}</span>
        </div>
      </td>
    </tr>
  );

  const reconStatus = data.reconStatus;

  if (loading) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
      <div className="text-4xl">⏳</div>
      <div className="text-base font-semibold text-slate-500">Loading data from server…</div>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-100">
      <FileLoader
        transactions={data.transactions} meta={data.meta} serverOk={serverOk}
        isAdmin={isAdmin} companies={companies}
        onLoaded={() => window.location.reload()}
        onClear={async () => { await apiClient.clearAll(); window.location.reload(); }}
      />

      {/* Recon banner */}
      {reconStatus.errorCount > 0 && !reconDismissed && data.transactions.length > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-b-2 border-red-300 bg-red-50 px-5 py-2">
          <span>⚠️</span>
          <div className="flex-1 text-xs">
            <span className="font-bold text-red-700">Reconciliation Alert — </span>
            <span className="text-red-700">{reconStatus.errorCount} error{reconStatus.errorCount !== 1 ? "s" : ""} and {reconStatus.warningCount} warning{reconStatus.warningCount !== 1 ? "s" : ""} found.</span>
          </div>
          <button onClick={() => setReconDismissed(true)} className="text-red-700 text-sm">✕</button>
        </div>
      )}
      {reconStatus.errorCount === 0 && reconStatus.lastRun && data.transactions.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-green-200 bg-green-50 px-5 py-1.5 text-xs">
          <span>✅</span><span className="font-semibold text-green-700">Reconciliation passed</span>
          <span className="text-slate-400">· {new Date(reconStatus.lastRun).toLocaleString()}</span>
        </div>
      )}

      {data.transactions.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <div className="text-5xl">📁</div>
          <div className="text-lg font-semibold text-slate-500">No transaction data loaded</div>
          <div className="text-sm">Drop your bank extract files above to get started</div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* Toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-slate-200 bg-white px-5 py-2">
            <div className="relative">
              <button onClick={() => setDropOpen(!dropOpen)} className="flex items-center gap-1.5 rounded border-[1.5px] border-blue-500 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ENT_COLOR[entity] }} />{entity}<span className="text-[8px]">▾</span>
              </button>
              {dropOpen && (
                <div className="absolute left-0 top-[calc(100%+3px)] z-50 min-w-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  {ENTITIES.map(e => (
                    <div key={e} onClick={() => { setEntity(e); setDropOpen(false); }}
                      className="flex cursor-pointer items-center gap-2 border-b border-slate-50 px-3.5 py-2 text-xs hover:bg-slate-50"
                      style={{ fontWeight: e === entity ? 600 : 400, color: e === entity ? "#1d4ed8" : "#374151", background: e === entity ? "#eff6ff" : undefined }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ENT_COLOR[e] }} />{e}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex overflow-hidden rounded border border-slate-200">
              {([["weekly","W"],["monthly","M"],["quarterly","Q"],["yearly","Y"]] as const).map(([p,lbl]) => (
                <button key={p} onClick={() => setViewPeriod(p)} className="border-r border-slate-200 px-3 py-1 text-xs last:border-r-0"
                  style={{ background: viewPeriod===p ? "#1d4ed8" : "white", color: viewPeriod===p ? "white" : "#64748b", fontWeight: viewPeriod===p ? 700 : 400 }}>
                  {lbl}
                </button>
              ))}
            </div>
            <div className="h-5 w-px bg-slate-200" />
            <span className="text-[10px] text-slate-400">
              📅 {weeks.length > 0 ? `${weekLabel(weeks[0])} – ${weekLabel(weeks[weeks.length-1])}` : "No data"}
              <span className="mx-1.5 text-slate-300">·</span>
              {displayDerived.length} {viewPeriod==="weekly"?"week":viewPeriod==="monthly"?"month":viewPeriod==="quarterly"?"quarter":"year"}{displayDerived.length!==1?"s":""}
            </span>
            {excluded.size > 0 && <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">⛔ {excluded.size} excluded</span>}
            <div className="flex-1" />
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400">💡 Click any cell to drill into transactions</span>
            <button onClick={() => setAdjOpen(o => !o)} className="flex items-center gap-1.5 rounded border border-amber-400 bg-white px-3 py-1 text-xs font-bold text-amber-700 hover:bg-amber-50">
              ✏️ Add Adjustment {adjOpen ? "▲" : "▼"}
            </button>
          </div>

          {/* Adjustment panel */}
          {adjOpen && (
            <div className="shrink-0 border-b-2 border-amber-300 bg-amber-50 px-5 py-3">
              <div className="flex flex-wrap items-end gap-2.5">
                <div>
                  <div className="mb-1 text-[9px] font-semibold uppercase text-amber-800">Entity</div>
                  <select value={adjForm.entity} onChange={e => setAdjForm(p => ({ ...p, entity: e.target.value }))}
                    className="rounded border border-amber-300 bg-white px-2 py-1.5 text-xs" style={{ minWidth: 160 }}>
                    {["Corneat","Holmes Place PT","Orange Space","Tribute Brands"].map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <div className="mb-1 text-[9px] font-semibold uppercase text-amber-800">Date</div>
                  <input type="date" value={adjForm.date} onChange={e => setAdjForm(p => ({ ...p, date: e.target.value }))}
                    className="rounded border border-amber-300 bg-white px-2 py-1.5 text-xs" />
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="mb-1 text-[9px] font-semibold uppercase text-amber-800">Description</div>
                  <input type="text" placeholder="e.g. Missing intercompany receipt" value={adjForm.description}
                    onChange={e => setAdjForm(p => ({ ...p, description: e.target.value }))}
                    className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs" />
                </div>
                <div style={{ minWidth: 140 }}>
                  <div className="mb-1 text-[9px] font-semibold uppercase text-amber-800">Amount USD</div>
                  <input type="number" placeholder="e.g. 50000 or -12000" value={adjForm.amount}
                    onChange={e => setAdjForm(p => ({ ...p, amount: e.target.value }))}
                    className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-xs" />
                </div>
                <div>
                  <div className="mb-1 text-[9px] font-semibold uppercase text-amber-800">Category</div>
                  <select value={adjForm.cat} onChange={e => setAdjForm(p => ({ ...p, cat: e.target.value as Category }))}
                    className="rounded border border-amber-300 bg-white px-2 py-1.5 text-xs" style={{ minWidth: 160 }}>
                    {(["financing_in","grant","salary","operating_out","bank_charges","intercompany","other"] as Category[]).map(c =>
                      <option key={c} value={c}>{CAT_LABELS[c]||c}</option>)}
                  </select>
                </div>
                <button onClick={handleAddAdjustment} className="rounded bg-amber-500 px-4 py-1.5 text-xs font-bold text-white hover:bg-amber-600 whitespace-nowrap">✅ Add to Cashflow</button>
                <button onClick={() => setAdjOpen(false)} className="rounded border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-800">Cancel</button>
              </div>
            </div>
          )}

          {/* KPI strip */}
          <div className="grid shrink-0 grid-cols-4 gap-0 border-b border-slate-200 bg-white">
            {[
              { label:"Opening Balance", v:openingBal, sub:weeks[0]?weekLabel(weeks[0]):"—",              color:"#2563eb" },
              { label:"Total Inflows",   v:totIn,      sub:"Financing + Grants",                          color:"#16a34a" },
              { label:"Total Outflows",  v:totOut,     sub:"Ops + Payroll",                               color:"#dc2626" },
              { label:"Closing Balance", v:closingBal, sub:weeks.length?weekLabel(weeks[weeks.length-1]):"—", color:closingBal>=0?"#2563eb":"#dc2626" },
            ].map(kpi => (
              <div key={kpi.label} className="border-r border-slate-100 px-5 py-3 last:border-r-0">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{kpi.label}</div>
                <div className="flex items-end gap-2">
                  <div>
                    <span className="mr-1 text-[9px] font-semibold text-slate-400">USD</span>
                    <span className="text-xl font-bold" style={{ color: kpi.color }}>{fmt(kpi.v)}</span>
                  </div>
                  <Sparkline data={derived} color={kpi.color} />
                </div>
                <div className="mt-0.5 text-[9px] text-slate-400">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table style={{ borderCollapse:"collapse", width:"max-content", minWidth:"100%" }}>
              <colgroup>
                <col style={{ width:210, minWidth:210 }} />
                {displayDerived.map(d => <col key={d.week} style={{ width:130, minWidth:130 }} />)}
              </colgroup>
              <thead style={{ position:"sticky", top:0, zIndex:20 }}>
                <tr style={{ background:"#0f172a" }}>
                  <th style={{ padding:"10px 12px", textAlign:"left", fontSize:10, fontWeight:700, color:"#e2e8f0", letterSpacing:"0.06em", textTransform:"uppercase", borderRight:"2px solid #334155", position:"sticky", left:0, zIndex:21, background:"#0f172a", whiteSpace:"nowrap" }}>
                    Category&nbsp;<span style={{ color:"#60a5fa", fontWeight:800 }}>/ USD</span>
                  </th>
                  {displayDerived.map((d,di) => {
                    const lbl = periodLabel(d.week, viewPeriod);
                    const parts = viewPeriod==="weekly" ? lbl.split("–") : [lbl];
                    return (
                      <th key={d.week} style={{ padding:"8px 11px", textAlign:"right", fontSize:9, fontWeight:600, borderLeft:"1px solid #1e293b", whiteSpace:"nowrap", lineHeight:1.5 }}>
                        <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:10 }}>{parts[0]?.trim()}</div>
                        {parts[1] && <div style={{ color:"#94a3b8", fontSize:9 }}>– {parts[1].trim()}</div>}
                        <div style={{ marginTop:2, fontSize:8, color:"#94a3b8", background:"rgba(255,255,255,0.08)", display:"inline-block", padding:"1px 5px", borderRadius:3 }}>
                          {viewPeriod==="weekly"?`W${isoWeek(d.week)}`:viewPeriod==="monthly"?`M${di+1}`:viewPeriod==="quarterly"?`Q${di+1}`:`Y${di+1}`}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Opening Balance */}
                <tr style={{ background:"#eff6ff" }}>
                  <Lbl bold><span style={{ fontSize:8.5, padding:"1px 5px", borderRadius:3, background:"#dbeafe", color:"#1d4ed8", marginRight:3 }}>USD</span>Opening Balance</Lbl>
                  {displayDerived.map((d,i) => <C key={i} v={d.opening_bal} week={d.week} cat="" label="" blue />)}
                </tr>

                <SecHdr label="▲ Cash Inflow" open={inflowOpen} toggle={() => setInflowOpen(!inflowOpen)} color="#22c55e" />
                <tr style={{ background:"#f0fdf4" }}>
                  <Lbl indent={1} bold><span style={{ width:3, height:14, borderRadius:2, background:"#22c55e", flexShrink:0 }} />Total Cash Inflow</Lbl>
                  {displayDerived.map((d,i) => <TotCell key={i} v={d.total_in} week={d.week} cat="all_in" label="Total Cash Inflow" />)}
                </tr>
                {inflowOpen && ["financing_in","grant","intercompany_in"].map(cat => (
                  <tr key={cat} style={{ borderBottom:"1px solid #f8fafc" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="#fafcff"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="transparent"}>
                    <Lbl indent={2}><span style={{ width:3, height:10, borderRadius:2, background:CAT_COLORS[cat]||"#94a3b8", flexShrink:0 }} />{CAT_LABELS[cat]}</Lbl>
                    {displayDerived.map((d,i) => <C key={i} v={d.derived[cat]||0} week={d.week} cat={cat} label={CAT_LABELS[cat]||cat} />)}
                  </tr>
                ))}

                <SecHdr label="▼ Cash Outflow" open={outflowOpen} toggle={() => setOutflowOpen(!outflowOpen)} color="#ef4444" />
                <tr style={{ background:"#fef2f2" }}>
                  <Lbl indent={1} bold><span style={{ width:3, height:14, borderRadius:2, background:"#ef4444", flexShrink:0 }} />Total Cash Outflow</Lbl>
                  {displayDerived.map((d,i) => <TotCell key={i} v={d.total_out} week={d.week} cat="all_out" label="Total Cash Outflow" isOut />)}
                </tr>
                {outflowOpen && (<>
                  <tr style={{ borderBottom:"1px solid #f8fafc" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="#fffafa"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="transparent"}>
                    <Lbl indent={2}><span style={{ width:3, height:10, borderRadius:2, background:CAT_COLORS.salary, flexShrink:0 }} />{CAT_LABELS.salary}</Lbl>
                    {displayDerived.map((d,i) => <C key={i} v={d.derived.salary||0} week={d.week} cat="salary" label={CAT_LABELS.salary} />)}
                  </tr>

                  {/* Operating Payments — collapsible */}
                  <tr style={{ borderBottom:"1px solid #f8fafc", cursor:"pointer" }}
                    onMouseEnter={e => { if(!opSubOpen)(e.currentTarget as HTMLElement).style.background="#fffafa"; }}
                    onMouseLeave={e => { if(!opSubOpen)(e.currentTarget as HTMLElement).style.background="transparent"; }}>
                    <Lbl indent={2}>
                      <span onClick={e => { e.stopPropagation(); setOpSubOpen(o => !o); }}
                        style={{ fontSize:9, marginRight:2, display:"inline-block", transform:opSubOpen?"rotate(0)":"rotate(-90deg)", transition:"transform .2s", cursor:"pointer", color:"#ea580c" }}>▼</span>
                      <span style={{ width:3, height:10, borderRadius:2, background:CAT_COLORS.operating_out, flexShrink:0 }} />
                      {CAT_LABELS.operating_out}
                    </Lbl>
                    {displayDerived.map((d,i) => {
                      const total = (d.derived.operating_out||0) + OP_SUBCATS.reduce((s,c) => s+(d.derived[c]||0),0);
                      return <TotCell key={i} v={total} week={d.week} cat="operating_out" label="Operating Payments" isOut />;
                    })}
                  </tr>
                  {opSubOpen && OP_SUBCATS.map(cat => (
                    <tr key={cat} style={{ borderBottom:"1px solid #f8fafc", background:"#fffbf5" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="#fff3e0"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="#fffbf5"}>
                      <Lbl indent={3}><span style={{ width:2, height:8, borderRadius:2, background:CAT_COLORS[cat]||"#f59e0b", flexShrink:0 }} /><span style={{ fontSize:9.5, color:"#92400e" }}>{CAT_LABELS[cat]}</span></Lbl>
                      {displayDerived.map((d,i) => <C key={i} v={d.derived[cat]||0} week={d.week} cat={cat} label={CAT_LABELS[cat]||cat} />)}
                    </tr>
                  ))}
                  {opSubOpen && (
                    <tr style={{ borderBottom:"1px solid #f8fafc", background:"#fffbf5" }}>
                      <Lbl indent={3}><span style={{ width:2, height:8, borderRadius:2, background:"#94a3b8", flexShrink:0 }} /><span style={{ fontSize:9.5, color:"#92400e" }}>Other Operating</span></Lbl>
                      {displayDerived.map((d,i) => <C key={i} v={d.derived.operating_out||0} week={d.week} cat="operating_out" label="Other Operating" />)}
                    </tr>
                  )}

                  <tr style={{ borderBottom:"1px solid #f8fafc" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="#fffafa"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="transparent"}>
                    <Lbl indent={2}><span style={{ width:3, height:10, borderRadius:2, background:CAT_COLORS.bank_charges, flexShrink:0 }} />{CAT_LABELS.bank_charges}</Lbl>
                    {displayDerived.map((d,i) => <C key={i} v={d.derived.bank_charges||0} week={d.week} cat="bank_charges" label={CAT_LABELS.bank_charges} />)}
                  </tr>
                  <tr style={{ borderBottom:"1px solid #f8fafc" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background="#fffafa"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background="transparent"}>
                    <Lbl indent={2}><span style={{ width:3, height:10, borderRadius:2, background:CAT_COLORS.intercompany_out, flexShrink:0 }} />{CAT_LABELS.intercompany_out}</Lbl>
                    {displayDerived.map((d,i) => <C key={i} v={d.derived.intercompany_out||0} week={d.week} cat="intercompany_out" label={CAT_LABELS.intercompany_out} />)}
                  </tr>
                </>)}

                {/* Net */}
                <tr style={{ background:"#f8fafc", borderTop:"2px solid #e2e8f0", borderBottom:"2px solid #e2e8f0" }}>
                  <Lbl bold><span style={{ fontSize:8.5, padding:"1px 5px", borderRadius:3, background:"#dbeafe", color:"#1d4ed8", marginRight:3 }}>USD</span>Net Cash Flow</Lbl>
                  {displayDerived.map((d,i) => {
                    const net = d.total_in + d.total_out;
                    return (
                      <td key={i} onClick={() => openDrawer(d.week,"net","Net Cash Flow")}
                        style={{ width:130, minWidth:130, textAlign:"right", padding:"0 11px", height:40, fontSize:12, fontWeight:700, color:net>0?"#15803d":net<0?"#b91c1c":"#94a3b8", background:net>0?"rgba(22,163,74,0.07)":net<0?"rgba(220,38,38,0.07)":"transparent", borderLeft:"1px solid #e2e8f0", cursor:"pointer", whiteSpace:"nowrap" }}>
                        {net>0?"+":""}{fmt(net)}
                      </td>
                    );
                  })}
                </tr>

                {/* Closing Balance */}
                <tr style={{ background:"#eff6ff" }}>
                  <Lbl bold><span style={{ fontSize:8.5, padding:"1px 5px", borderRadius:3, background:"#dbeafe", color:"#1d4ed8", marginRight:3 }}>USD</span>Closing Balance</Lbl>
                  {displayDerived.map((d,i) => <C key={i} v={d.closing_bal} week={d.week} cat="" label="" blue />)}
                </tr>

                {/* Raw Bank Balance */}
                <tr style={{ background:"#f8fafc", borderTop:"1px solid #e2e8f0" }}>
                  <Lbl><span style={{ fontSize:8, padding:"1px 4px", borderRadius:3, background:"#e2e8f0", color:"#475569", fontWeight:600 }}>BANK</span>Raw Bank Balance<span title="All transactions including FX/intercompany/excluded" style={{ marginLeft:4, cursor:"help", color:"#94a3b8", fontSize:10 }}>ⓘ</span></Lbl>
                  {displayBank.map((d,i) => {
                    const delta = derived[i] ? d.closing_bal - derived[i].closing_bal : 0;
                    return (
                      <td key={i} style={{ textAlign:"right", padding:"4px 11px", fontSize:10, color:"#475569", borderLeft:"1px solid #f0f4f8", whiteSpace:"nowrap" }}>
                        <div>{fmt(d.closing_bal)}</div>
                        {Math.abs(delta)>0.5 && <div style={{ fontSize:8, color:delta>0?"#16a34a":"#dc2626" }}>{delta>0?"▲":"▼"} {fmt(Math.abs(delta))}</div>}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center gap-3 border-t border-slate-200 bg-white px-5 py-1.5 text-[10px] text-slate-400">
            <span>{activeTxns.length} active · {excluded.size} excluded · {data.meta.files?.length||0} file{(data.meta.files?.length||0)!==1?"s":""} · saved to my-dashboard/data/</span>
            <span className="flex-1" />
            <span>▲ Inflow · (x) = outflow · USD throughout</span>
          </div>
        </div>
      )}

      <Drawer open={!!drawer} onClose={() => setDrawer(null)} txns={drawerTxns}
        title={drawer?.title||""} weekLabel={drawer?periodLabel(drawer.week,viewPeriod):""} entity={entity} />
    </div>
  );
}
