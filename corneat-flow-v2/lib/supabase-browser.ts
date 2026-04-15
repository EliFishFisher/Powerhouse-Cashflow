/**
 * Browser-only Supabase client
 * Safe to import from Client Components and hooks
 */

import { createBrowserClient } from "@supabase/ssr";

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createClient() {
  return createBrowserClient(URL, ANON);
}
