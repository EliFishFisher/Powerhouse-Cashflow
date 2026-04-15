"use client";

import type { BankBalance } from "@/lib/types";

interface Props {
  balances:     BankBalance[];
  onConfirm:    (balances: BankBalance[], targetEntity: string) => Promise<void>;
  onDismiss:    () => void;
  targetEntity: string;   // the company being uploaded to
}

const CURRENCY_LABELS: Record<string, string> = {
  ILS: "₪ NIS",
  USD: "$ USD",
  EUR: "€ EUR",
  GBP: "£ GBP",
  CHF: "₣ CHF",
  JPY: "¥ JPY",
  CAD: "C$ CAD",
  AUD: "A$ AUD",
};

function fmtBalance(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n) + " " + currency;
}

export function BankBalanceModal({ balances, onConfirm, onDismiss, targetEntity }: Props) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(2px)" }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        zIndex: 60, background: "#fff", borderRadius: 14, width: 480, maxWidth: "95vw",
        boxShadow: "0 24px 80px rgba(0,0,0,0.22)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🏦</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Bank Balance Report Found</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                This file is a balance snapshot, not a transaction list. Save the balance for reconciliation?
              </div>
            </div>
          </div>
        </div>

        {/* Balance rows */}
        <div style={{ padding: "16px 22px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            Reported balances
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {balances.map(b => (
              <div key={b.uid} style={{
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
                padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
                      {fmtBalance(b.balance, b.currency)}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, background: "#dcfce7", color: "#16a34a",
                      borderRadius: 999, padding: "1px 8px",
                    }}>
                      {CURRENCY_LABELS[b.currency] || b.currency}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: "#64748b", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>Date: <strong>{b.date}</strong></span>
                    {b.subsidiary && <span>Entity: <strong>{b.subsidiary}</strong></span>}
                    {b.accountNo  && <span>Account: <strong>{b.accountNo}</strong></span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: "#64748b", background: "#fffbeb", borderRadius: 6, padding: "8px 12px", border: "1px solid #fde68a" }}>
            💡 Saved balance snapshots appear in the <strong>Reconcile</strong> tab where you can compare them against your computed net cash position.
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 22px", borderTop: "1px solid #e2e8f0", background: "#fafbfd",
          display: "flex", gap: 8, justifyContent: "flex-end",
        }}>
          <button onClick={onDismiss} style={{
            height: 36, padding: "0 16px", background: "#fff", color: "#64748b",
            border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 13, cursor: "pointer",
          }}>
            Skip
          </button>
          <button
            onClick={() => onConfirm(balances, targetEntity)}
            style={{
              height: 36, padding: "0 20px", background: "#0f172a", color: "#fff",
              border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Save {balances.length} Balance{balances.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </>
  );
}
