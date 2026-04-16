import { NextResponse } from "next/server";

// ── Server-side FX rate proxy ─────────────────────────────────────────────────
// Fetches from Frankfurter (free, no key, ECB data) and caches for 24h.
// Avoids CORS issues that blocked client-side fetching.

interface CacheEntry {
  rates: Record<string, number>;
  fetchedAt: number; // ms timestamp
}

// Module-level cache — survives across requests in the same serverless instance
let cache: CacheEntry | null = null;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const CURRENCIES = ["ILS", "EUR", "GBP", "CHF", "JPY", "CAD", "AUD"];

export async function GET() {
  // Return cached rates if still fresh
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return NextResponse.json({ rates: cache.rates, fetchedAt: cache.fetchedAt, cached: true });
  }

  try {
    const symbols = CURRENCIES.join(",");
    const res = await fetch(
      `https://api.frankfurter.app/latest?from=USD&to=${symbols}`,
      { next: { revalidate: 86400 } }, // Next.js cache hint
    );

    if (!res.ok) throw new Error(`Frankfurter returned ${res.status}`);
    const json = await res.json() as { rates: Record<string, number> };

    cache = { rates: json.rates, fetchedAt: Date.now() };
    return NextResponse.json({ rates: cache.rates, fetchedAt: cache.fetchedAt, cached: false });
  } catch (err) {
    console.error("[fx-rates] fetch failed:", err);

    // Return stale cache if we have one, otherwise hard fallback
    if (cache) {
      return NextResponse.json({ rates: cache.rates, fetchedAt: cache.fetchedAt, cached: true, stale: true });
    }
    // Hard fallback so the app still works
    const fallback = { ILS: 3.72, EUR: 0.92, GBP: 0.79, CHF: 0.88, JPY: 149, CAD: 1.36, AUD: 1.53 };
    return NextResponse.json({ rates: fallback, fetchedAt: 0, cached: false, stale: true });
  }
}
