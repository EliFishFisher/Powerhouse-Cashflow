/**
 * Server-side Supabase helpers
 * Used only in Next.js API routes (server-side).
 * Do NOT import this from Client Components or hooks.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { AppData } from "./types";
import type { Category } from "./constants";

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Server client (per-request, reads cookies) ────────────────────────────────
export async function createServerSideClient() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options?: object }[]) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch { /* called from Server Component — safe to ignore */ }
      },
    },
  });
}

// Re-export a generic SupabaseClient type alias for API routes
type AnySupabaseClient = Awaited<ReturnType<typeof createServerSideClient>>;

// ── Profile type ──────────────────────────────────────────────────────────────
export interface Profile {
  id:          string;
  entity_name: string;
  is_admin:    boolean;
}

// ── Load app data for a specific user_id ─────────────────────────────────────
export async function loadAppData(
  supabase: AnySupabaseClient,
  userId: string,
): Promise<AppData> {
  const { data, error } = await supabase
    .from("app_data")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    return emptyAppData();
  }

  return {
    transactions:  data.transactions  ?? [],
    adjustments:   data.adjustments   ?? [],
    excluded:      data.excluded      ?? [],
    overrides:     data.overrides     ?? {},
    manualEntries: data.manual_entries ?? [],
    rules:         data.rules         ?? [],
    meta:          data.meta          ?? { files: [], totalTxns: 0 },
    reconStatus:   data.recon_status  ?? emptyReconStatus(),
    bankBalances:  data.bank_balances ?? [],
    subsidiaries:  data.subsidiaries  ?? [],
  };
}

// ── Load ALL companies' data (admin only) ─────────────────────────────────────
export async function loadAllAppData(
  supabase: AnySupabaseClient,
): Promise<{ entity_name: string; user_id: string; data: AppData }[]> {
  const { data, error } = await supabase
    .from("app_data")
    .select("*")
    .order("entity_name");

  if (error || !data) return [];

  return data.map(row => ({
    entity_name: row.entity_name,
    user_id:     row.user_id,
    data: {
      transactions:  row.transactions  ?? [],
      adjustments:   row.adjustments   ?? [],
      excluded:      row.excluded      ?? [],
      overrides:     row.overrides     ?? {},
      manualEntries: row.manual_entries ?? [],
      rules:         row.rules         ?? [],
      meta:          row.meta          ?? { files: [], totalTxns: 0 },
      reconStatus:   row.recon_status  ?? emptyReconStatus(),
      bankBalances:  row.bank_balances ?? [],
      subsidiaries:  row.subsidiaries  ?? [],
    },
  }));
}

// ── Save a partial update for a user ─────────────────────────────────────────
type DbRow = {
  transactions?:   unknown;
  adjustments?:    unknown;
  excluded?:       unknown;
  overrides?:      unknown;
  manual_entries?: unknown;
  rules?:          unknown;
  meta?:           unknown;
  recon_status?:   unknown;
  bank_balances?:  unknown;
  subsidiaries?:   unknown;
};

export async function saveAppDataField(
  supabase: AnySupabaseClient,
  userId:   string,
  field:    keyof DbRow,
  value:    unknown,
) {
  await supabase
    .from("app_data")
    .update({ [field]: value })
    .eq("user_id", userId);
}

// ── Wipe data for a single user ───────────────────────────────────────────────
export async function clearAppData(
  supabase: AnySupabaseClient,
  userId:   string,
) {
  // Preserve subsidiaries config (global setting) and bank balances are intentionally cleared
  await supabase
    .from("app_data")
    .update({
      transactions:  [],
      adjustments:   [],
      excluded:      [],
      overrides:     {},
      manual_entries: [],
      rules:         [],
      meta:          { files: [], totalTxns: 0 },
      recon_status:  emptyReconStatus(),
      bank_balances: [],
      // subsidiaries intentionally NOT cleared — config should survive data wipes
    })
    .eq("user_id", userId);
}

// ── Wipe ALL companies' data (admin only) ─────────────────────────────────────
export async function clearAllAppData(supabase: AnySupabaseClient) {
  await supabase
    .from("app_data")
    .update({
      transactions:  [],
      adjustments:   [],
      excluded:      [],
      overrides:     {},
      manual_entries: [],
      rules:         [],
      meta:          { files: [], totalTxns: 0 },
      recon_status:  emptyReconStatus(),
      bank_balances: [],
      // subsidiaries intentionally NOT cleared — config should survive data wipes
    })
    .neq("user_id", "00000000-0000-0000-0000-000000000000"); // matches all rows
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyReconStatus() {
  return { lastRun: null, errorCount: 0, warningCount: 0, issues: [] };
}

export function emptyAppData(): AppData {
  return {
    transactions:  [],
    adjustments:   [],
    excluded:      [],
    overrides:     {} as Record<string, Category>,
    manualEntries: [],
    rules:         [],
    meta:          { files: [], totalTxns: 0 },
    reconStatus:   emptyReconStatus(),
    bankBalances:  [],
    subsidiaries:  [],
  };
}
