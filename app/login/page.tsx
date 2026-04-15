"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPage() {
  const router   = useRouter();
  const supabase = createClient();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError(error.message); return; }
      router.push("/cashflow");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0f172a",
    }}>
      <div style={{
        width: 380, background: "#1e293b", borderRadius: 14,
        boxShadow: "0 24px 64px rgba(0,0,0,0.5)", padding: "36px 36px 32px",
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 900, color: "#fff",
          }}>
            P
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9" }}>
              Powerhouse <span style={{ color: "#3b82f6" }}>CashFlow</span>
            </div>
            <div style={{ fontSize: 10, color: "#64748b", fontWeight: 500, marginTop: 1 }}>
              Cashflow Intelligence Platform
            </div>
          </div>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 6 }}>
          Sign in to your account
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 24 }}>
          Use the credentials provided by your fund administrator
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
              style={{
                width: "100%", height: 40, borderRadius: 7, fontSize: 13,
                border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9",
                paddingLeft: 12, paddingRight: 12, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: "100%", height: 40, borderRadius: 7, fontSize: 13,
                border: "1px solid #334155", background: "#0f172a", color: "#f1f5f9",
                paddingLeft: 12, paddingRight: 12, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: "10px 12px", borderRadius: 6,
              background: "#fef2f2", border: "1px solid #fecaca",
              fontSize: 12, color: "#b91c1c",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", height: 42, borderRadius: 7, fontSize: 13, fontWeight: 600,
              background: loading ? "#334155" : "#3b82f6",
              color: loading ? "#64748b" : "#fff",
              border: "none", cursor: loading ? "wait" : "pointer",
              transition: "background 0.15s",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid #1e293b", textAlign: "center" }}>
          <span style={{ fontSize: 11, color: "#475569" }}>
            Access issues? Contact{" "}
            <span style={{ color: "#3b82f6" }}>elijah@holmesplace.com</span>
          </span>
        </div>
      </div>
    </div>
  );
}
