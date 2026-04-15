"use client";

import { useState, useCallback } from "react";
import { ENTITIES, type Entity } from "@/lib/constants";
import type { Subsidiary } from "@/lib/types";

const COMPANY_ENTITIES = ENTITIES.filter(e => e !== "Consolidated");

interface Props {
  subsidiaries: Subsidiary[];
  onSave:  (subs: Subsidiary[]) => Promise<void>;
  onClose: () => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const EMPTY_FORM: { name: string; parentEntity: Entity | ""; aliases: string; bankAccounts: string } = {
  name:         "",
  parentEntity: COMPANY_ENTITIES[0] ?? "",
  aliases:      "",   // comma-separated
  bankAccounts: "",   // comma-separated
};

export function SubsidiarySettings({ subsidiaries, onSave, onClose }: Props) {
  const [list,    setList]    = useState<Subsidiary[]>(subsidiaries);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [saving,  setSaving]  = useState(false);

  const openAdd = useCallback(() => {
    setEditIdx(null);
    setForm(EMPTY_FORM);
  }, []);

  const openEdit = useCallback((i: number) => {
    const s = list[i];
    setEditIdx(i);
    setForm({
      name:         s.name,
      parentEntity: s.parentEntity as Entity,
      aliases:      s.aliases.join(", "),
      bankAccounts: s.bankAccounts.join(", "),
    });
  }, [list]);

  const cancelForm = () => { setEditIdx(null); setForm(EMPTY_FORM); };

  const commitForm = useCallback(() => {
    if (!form.name.trim() || !form.parentEntity) return;
    const sub: Subsidiary = {
      uid:          editIdx !== null ? list[editIdx].uid : uid(),
      name:         form.name.trim(),
      parentEntity: form.parentEntity as string,
      aliases:      form.aliases.split(",").map(a => a.trim().toLowerCase()).filter(Boolean),
      bankAccounts: form.bankAccounts.split(",").map(a => a.trim()).filter(Boolean),
    };
    if (editIdx !== null) {
      setList(l => l.map((s, i) => i === editIdx ? sub : s));
    } else {
      setList(l => [...l, sub]);
    }
    cancelForm();
  }, [form, editIdx, list]);

  const remove = useCallback((i: number) => {
    setList(l => l.filter((_, j) => j !== i));
    cancelForm();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try { await onSave(list); onClose(); }
    finally { setSaving(false); }
  }, [list, onSave, onClose]);

  const isFormOpen = editIdx !== null || form.name !== "" || form.aliases !== "" || form.bankAccounts !== "";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(2px)" }}
      />

      {/* Panel */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 60, background: "#fff", borderRadius: 14, width: 620, maxWidth: "95vw",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🏢</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Subsidiary Configuration</div>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
              Define subsidiaries so files are auto-assigned to the right sub-entity on upload
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>

          {/* Subsidiary list */}
          {list.length === 0 && !isFormOpen && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🏗</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>No subsidiaries yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Add subsidiaries to auto-detect entities from filenames and bank account numbers</div>
            </div>
          )}

          {list.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {list.map((s, i) => (
                <div key={s.uid} style={{
                  background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                  padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 12,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{s.name}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 600, background: "#ede9fe", color: "#6d28d9",
                        borderRadius: 999, padding: "1px 8px",
                      }}>{s.parentEntity}</span>
                    </div>
                    <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {s.aliases.length > 0 && (
                        <span style={{ fontSize: 10, color: "#64748b" }}>
                          Filename aliases: {s.aliases.map(a => `"${a}"`).join(", ")}
                        </span>
                      )}
                      {s.bankAccounts.length > 0 && (
                        <span style={{ fontSize: 10, color: "#64748b" }}>
                          · Bank accounts: {s.bankAccounts.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => openEdit(i)} style={btnStyle}>✏️</button>
                    <button onClick={() => remove(i)} style={{ ...btnStyle, borderColor: "#fecaca", color: "#dc2626" }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inline add / edit form */}
          {isFormOpen ? (
            <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#0369a1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                {editIdx !== null ? "Edit Subsidiary" : "New Subsidiary"}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <Label>Subsidiary name</Label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Corneat Vision Ltd" style={inputStyle} />
                </div>
                <div>
                  <Label>Parent company</Label>
                  <select value={form.parentEntity} onChange={e => setForm(f => ({ ...f, parentEntity: e.target.value as Entity }))}
                    style={{ ...inputStyle, paddingLeft: 8 }}>
                    {COMPANY_ENTITIES.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <Label hint="comma-separated · matched in filenames (lowercase)">Filename aliases</Label>
                  <input value={form.aliases} onChange={e => setForm(f => ({ ...f, aliases: e.target.value }))}
                    placeholder="e.g. corneat vision ltd, corneat ltd, cil" style={inputStyle} />
                </div>
                <div style={{ gridColumn: "1/-1" }}>
                  <Label hint="comma-separated · matched against account number in file header">Bank account numbers</Label>
                  <input value={form.bankAccounts} onChange={e => setForm(f => ({ ...f, bankAccounts: e.target.value }))}
                    placeholder="e.g. 12-584-36967" style={inputStyle} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={commitForm} style={{
                  height: 32, padding: "0 16px", background: "#0f172a", color: "#fff",
                  border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}>
                  {editIdx !== null ? "Update" : "Add"}
                </button>
                <button onClick={cancelForm} style={{
                  height: 32, padding: "0 14px", background: "#fff", color: "#64748b",
                  border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, cursor: "pointer",
                }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={openAdd} style={{
              width: "100%", height: 36, background: "#f8fafc", color: "#475569",
              border: "2px dashed #cbd5e1", borderRadius: 8, fontSize: 12, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              <span style={{ fontSize: 16 }}>+</span> Add Subsidiary
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px", borderTop: "1px solid #e2e8f0", background: "#fafbfd",
          display: "flex", gap: 8, alignItems: "center",
        }}>
          <button onClick={handleSave} disabled={saving} style={{
            height: 36, padding: "0 20px", background: saving ? "#94a3b8" : "#0f172a",
            color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600,
            cursor: saving ? "wait" : "pointer",
          }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
          <button onClick={onClose} style={{
            height: 36, padding: "0 16px", background: "#fff", color: "#64748b",
            border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, cursor: "pointer",
          }}>
            Cancel
          </button>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#94a3b8" }}>
            {list.length} subsidiar{list.length !== 1 ? "ies" : "y"} configured
          </span>
        </div>
      </div>
    </>
  );
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: 5, display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {children}
      </span>
      {hint && <span style={{ fontSize: 9, color: "#94a3b8" }}>{hint}</span>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 32, fontSize: 12, borderRadius: 6,
  border: "1px solid #e2e8f0", paddingLeft: 10, paddingRight: 10,
  outline: "none", background: "#fff", boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 5, border: "1px solid #e2e8f0",
  background: "#fff", cursor: "pointer", fontSize: 12,
  display: "flex", alignItems: "center", justifyContent: "center",
};
