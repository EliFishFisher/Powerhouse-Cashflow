import type { Transaction, ClassificationRule, ManualEntry, ReconStatus, AppData } from "./types";
import type { Category } from "./constants";

const BASE = "/api";

async function post(path: string, body: unknown): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

// Wrap data with optional targetEntity for admin uploads
function payload(data: unknown, targetEntity?: string) {
  return { data, targetEntity };
}

export const apiClient = {
  getData: async (): Promise<AppData & { isAdmin?: boolean; companies?: unknown[] }> => {
    const res = await fetch(`${BASE}/data`, { cache: "no-store" });
    if (!res.ok) throw new Error("Could not reach data server");
    return res.json();
  },
  saveTransactions:  (d: Transaction[], targetEntity?: string)           => post("/transactions",   payload(d, targetEntity)),
  saveMeta:          (d: AppData["meta"], targetEntity?: string)          => post("/meta",           payload(d, targetEntity)),
  saveExcluded:      (d: string[])                                        => post("/excluded",       payload(d)),
  saveOverrides:     (d: Record<string, Category>)                        => post("/overrides",      payload(d)),
  saveAdjustments:   (d: Transaction[])                                   => post("/adjustments",    payload(d)),
  saveManualEntries: (d: ManualEntry[])                                   => post("/manual-entries", payload(d)),
  saveReconStatus:   (d: ReconStatus)                                     => post("/recon-status",   payload(d)),
  saveRules:         (d: ClassificationRule[])                            => post("/rules",           payload(d)),
  clearAll: async (): Promise<{ ok: boolean }> => {
    const res = await fetch(`${BASE}/data`, { method: "DELETE" });
    if (!res.ok) throw new Error("Clear failed");
    return res.json();
  },
};
