# Powerhouse CashFlow — Architecture Reference
> Read this at the start of every session. It maps the full project so you never need to re-scan files.

---

## 1. Project Overview
Multi-entity cashflow dashboard for a fund admin (Elijah) overseeing four portfolio companies:
- **Corneat** · **Holmes Place PT** · **Orange Space** · **Tribute Brands**

The fund admin logs in as "Consolidated" and can view merged data + upload bank statements on behalf of any company. Each company user sees only their own data.

**Stack:** Next.js 15 App Router · TypeScript · Supabase (auth + Postgres + RLS) · Tailwind CSS  
**Location:** `C:\Powerhouse cashflow`  
**Dev server:** `npm run dev` (port 3000)  
**Build:** `npm run build`

---

## 2. Directory Map

```
C:\Powerhouse cashflow\
├── app/
│   ├── login/page.tsx          Client login page (uses supabase-browser.ts)
│   ├── cashflow/page.tsx       Main dashboard (only real page post-login)
│   └── api/
│       ├── data/route.ts       GET  — load all data; admin gets merged view
│       ├── transactions/route.ts   POST → saveField("transactions")
│       ├── adjustments/route.ts    POST → saveField("adjustments")
│       ├── excluded/route.ts       POST → saveField("excluded")
│       ├── overrides/route.ts      POST → saveField("overrides")
│       ├── meta/route.ts           POST → saveField("meta")
│       ├── rules/route.ts          POST → saveField("rules")
│       ├── recon-status/route.ts   POST → saveField("recon_status")
│       └── clear/route.ts          DELETE all rows for this user
├── components/
│   ├── file-loader.tsx         Upload zone; admin company selector; status messages
│   ├── drawer.tsx              Slide-out transaction detail panel
│   └── sparkline.tsx           Inline mini chart
├── hooks/
│   └── use-app-data.ts         Central data hook; fetchData + refresh; isAdmin + companies state
├── lib/
│   ├── supabase.ts             Server-only Supabase client (uses next/headers cookies)
│   ├── supabase-browser.ts     Browser-only Supabase client (login page)
│   ├── api-client.ts           Client-side fetch wrappers for all API routes
│   ├── api-route-helper.ts     saveField() — shared write handler for all POST routes
│   ├── parsers.ts              Multi-format XLS/CSV parser (see §5 below)
│   ├── classify.ts             Transaction → Category classifier
│   ├── cashflow.ts             Aggregation: buildDerived, groupDerived, addBalances
│   ├── reconcile.ts            Reconciliation engine
│   ├── factories.ts            makeAdjustment helper
│   ├── format.ts               Date/number formatting helpers
│   ├── types.ts                TypeScript interfaces (Transaction, AppData, etc.)
│   └── constants.ts            ENTITIES, ALL_CATS, CAT_LABELS, CAT_COLORS, etc.
├── middleware.ts               Supabase session refresh on every request
├── schema.sql                  Full DB schema + RLS policies + INSERT template
├── .env.local                  NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
└── CLAUDE.md                   ← this file
```

---

## 3. Database Schema (Supabase)

### `profiles` table
| col | type | notes |
|-----|------|-------|
| id | UUID PK | = auth.users.id |
| entity_name | TEXT | "Consolidated" / "Corneat" / "Holmes Place PT" / "Orange Space" / "Tribute Brands" |
| is_admin | BOOLEAN | true only for the Consolidated fund admin |

**RLS:** `profiles_select_authenticated` — all logged-in users can read all profiles (needed so admin API can look up company user IDs by entity_name).

### `app_data` table
| col | type | default |
|-----|------|---------|
| id | UUID PK | gen_random_uuid() |
| user_id | UUID UNIQUE | → auth.users |
| entity_name | TEXT | |
| transactions | JSONB | [] |
| adjustments | JSONB | [] |
| excluded | JSONB | [] |
| overrides | JSONB | {} |
| manual_entries | JSONB | [] |
| rules | JSONB | [] |
| meta | JSONB | {files:[], totalTxns:0} |
| recon_status | JSONB | {lastRun:null, errorCount:0, ...} |
| updated_at | TIMESTAMPTZ | auto via trigger |

**RLS policies:**
- `app_data_select_own` — users see their own row
- `app_data_select_admin` — admin sees ALL rows
- `app_data_insert_own` — users insert their own row
- `app_data_insert_admin` — admin can insert any row
- `app_data_update_own` — users update their own row
- `app_data_update_admin` — admin can update any row

**Note:** Rows created lazily on first `GET /api/data` (upsert in route handler, not trigger).

### Known user UUIDs
```
dc7d206b-84d8-4153-b2fe-dfc0da69f6e9  →  Consolidated (admin, Elijah)
a0a176e3-1e55-42b8-bd91-464184cf043a  →  Corneat
7d172640-41ce-4876-90f3-8d98265f81f3  →  Holmes Place PT
cafc502d-49f4-4973-a68e-d02214de5bd2  →  Orange Space
b862e943-cf7d-4a2c-a20d-68318e28b1cf  →  Tribute Brands
```

---

## 4. Data Flow

### Page load (admin)
```
browser → GET /api/data
  → supabase.auth.getUser()
  → profiles: { is_admin: true, entity_name: "Consolidated" }
  → loadAllAppData()  ← SELECT * FROM app_data (admin sees all via RLS)
  → returns { isAdmin: true, companies: [ {entity_name, user_id, data: AppData}, ... ] }
browser → mergeCompanyData(companies) → single merged AppData
```

### Page load (company user)
```
browser → GET /api/data
  → profiles: { is_admin: false, entity_name: "Corneat" }
  → upsert app_data row (lazy create)
  → loadAppData(userId) → AppData
  → returns AppData directly
```

### Admin upload flow
```
file-loader.tsx
  → parseWorkbook(buffer, filename) → { txns, diagnostics }
  → txns.map(t => ({ ...t, entity: targetEntity }))  ← override entity
  → mergeTxns(company.data.transactions, txns)
  → apiClient.saveTransactions(merged, targetEntity)
    → POST /api/transactions  { data: [...], targetEntity: "Orange Space" }
      → saveField(req, "transactions")
        → profiles lookup: SELECT id FROM profiles WHERE entity_name = "Orange Space"
        → upsert app_data row for that user_id (ensure it exists)
        → UPDATE app_data SET transactions = [...] WHERE user_id = <orange_space_uuid>
  → onLoaded() → refresh() (no full page reload — just re-fetches data)
```

---

## 5. Parser System (`lib/parsers.ts`)

### Format priority (tried in order)
1. **Bank Leumi** — hard-coded: looks for "Date" in col 0 + "transaction" in col 2 within first 8 rows
2. **Generic engine** — `detectHeaderRow()` scans first 10 rows for known header aliases → `parseGenericSheet()`
3. **Legacy** — fallback for old internal Hebrew format

### Generic engine
`FIELD_ALIASES` maps canonical fields to ~60 header name variations (English, Hebrew, Portuguese, Spanish, German, Dutch, French). To support a new bank format, just add its column header names to `FIELD_ALIASES`.

Canonical fields: `date`, `date2`, `description`, `type` (Debit/Credit), `debit`, `credit`, `amount` (signed), `currency`, `balance`, `ref`

Amount logic:
- Separate `debit` + `credit` cols → use directly
- Single `amount` col + `type` col (Debit/Credit) → split by type
- Single `amount` col, no type → negative = debit, positive = credit

Date parsing: handles `DD-MM-YYYY`, `DD/MM/YYYY`, `DD.MM.YYYY`, `YYYY-MM-DD`, `MM/DD/YYYY`, Excel serial, Date object. Defaults to European (DD first) when ambiguous.

UID hashing: entity + date + full description + debit + credit + ref + **balance** (tiebreaker; falls back to row index to prevent collisions when two rows have identical amounts and descriptions).

### CSV parsing
- SVB format: detected by `"From:"` in first line or `"Bank ID"` in second line
- Generic CSV: same header-detection logic as XLS, supports comma/semicolon/tab separators

### Adding a new bank format
1. Upload the file — the diagnostic red box shows the actual column headers found
2. Add unrecognised header names to the relevant entry in `FIELD_ALIASES` in `parsers.ts`
3. No other changes needed

---

## 6. Key Components

### `hooks/use-app-data.ts`
- `fetchData()` — called on mount and by `refresh()`
- `refresh()` — re-fetches without page reload (called after upload)
- Returns: `data, loading, serverOk, fxRates, setFxRates, reportingCurrency, reportingRate, setReportingCurrency, isAdmin, companies, refresh, clearAll, saveTransactions, saveRules, saveBankBalances, saveSubsidiaries, toggleExclude, setCatOverride, removeCatOverride`

### `lib/api-route-helper.ts` → `saveField(req, field)`
Single shared write handler. Logic:
1. Authenticate user
2. Parse `{ data, targetEntity }` from body
3. If `targetEntity` set AND caller is admin → look up company's `user_id` via profiles
4. Upsert `app_data` row (create if missing)
5. UPDATE `app_data SET [field] = data WHERE user_id = userId`

### `components/file-loader.tsx`
- Shows company selector pills (admin only)
- `processFiles()` — parse → merge → save → show step-by-step status → call `onLoaded()`
- Status shows: "Reading…" → "Parsed X rows…" → "Saving…" → green ✅ or red ❌ (held 1.5s before refresh)

### `lib/api-client.ts`
All client-side API calls. `payload(data, targetEntity?)` wraps the body for admin saves.

---

## 7. Environment & Build

### `.env.local` (never commit)
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```
⚠️ Must use `sb_publishable_` key (new format), NOT `sb_secret_`. After changing `.env.local`, always rebuild (`npm run build`) — `NEXT_PUBLIC_` vars are baked at build time.

### Common issues
| Symptom | Cause | Fix |
|---------|-------|-----|
| "Invalid API key" | Wrong key type in .env.local | Use sb_publishable_ key, then rebuild |
| EINVAL readlink errors | OneDrive syncing `.next` build folder | `rmdir /s /q .next` then rebuild |
| Build fails with `next/headers` error | Importing supabase.ts in a client component | Use `supabase-browser.ts` for client components |
| Profile returns null (PGRST116) | profiles table empty | Run INSERT INTO profiles (see schema.sql §5) |
| 0 transactions parsed | File format not recognised | Check red diagnostic box for actual headers; add to FIELD_ALIASES |
| Duplicate React key warning | Hash collision in transaction UIDs | Balance/row-index tiebreaker now included in hash |
| Transactions save to admin row | profiles RLS blocked lookup | profiles_select_authenticated policy must exist |

---

## 8. Session Changelog
| Date | Change |
|------|--------|
| 2026-04-16 | **"Turn into rule" from transaction detail** — `TxnDetail` in drawer gains a "⚡ Turn into a classification rule" button. Clicking closes the drawer and navigates to `/rules?keyword=<description>&cat=<category>`. Rules page reads those params from `window.location.search` on mount, pre-fills the form (label, keyword tag, field=description, category), opens the panel, then clears the URL. |
| 2026-04-16 | **Rules not persisting (admin bug fixed)** — `GET /api/data` was skipping the `app_data` row upsert for admin users, so the Consolidated row never existed in the DB. `saveField`'s `UPDATE` silently matched 0 rows and returned `ok:true`. Fix: upsert admin's own row on every data load (same as regular users). Also added row-count and error checking to `saveField` so failures surface as HTTP 500 instead of silent success. |
| 2026-04-16 | **Multi-currency reporting** — `CurrencySelector` component added to navbar (replaces static "USD Reporting" badge). Supports USD/ILS/EUR/GBP/CHF/JPY/CAD/AUD. FX rates and selected currency persisted to localStorage (`ph_fx_rates`, `ph_reporting_ccy`). `fmt(v, rate?)` updated with optional rate multiplier. All cashflow table values, KPI strip, and balance rows convert to the selected reporting currency via `reportingRate`. |
| 2026-04-15 | **Multi-currency drawer accuracy** — Drawer KPI totals now sum `t.netUSD` (USD-normalised) instead of `t.net`, so batches containing mixed currencies (EUR + ILS + USD) add up correctly. Each transaction row shows original-currency amount (as on the bank statement) plus a small `≈ X CCY` hint when it differs from the reporting currency. Detail panel shows the same. `reportingCurrency`/`reportingRate` props threaded from cashflow page → Drawer → TxnDetail. |
| 2026-04-15 | **Rent & Facilities category** — new `op_rent` category added between `op_regulatory` and `op_office` in `ALL_CATS` and `OP_SUBCATS`. Classifier: dedicated keyword rule with English (rent, lease, landlord, workspace, warehouse) and Hebrew (שכר דירה, שכירות, דמי שכירות) keywords. "rent" removed from `op_office` rule. Blue colour scheme (#0369a1 / #e0f2fe). |
| 2026-04-15 | **Tag input for rule keywords** — `form.keywords` changed from comma-separated string to `string[]`. New tag-input UI: existing keywords render as removable chips (× button), Enter or + button adds a tag, Backspace on empty removes last tag, duplicates silently ignored. Any uncommitted text auto-committed on save. |
| 2026-04-15 | Bank Hapoalim support — `parseIsraeliBankSheet` now detects Hebrew headers (תאריך/הפעולה) in addition to Bank Leumi English headers; Poalim Foreign balance-only sheets detected early and skipped with diagnostic |
| 2026-04-15 | `classifyIsraeliBankTxn` extended with Hebrew Hapoalim operation names: עמלה/ד.ניהול/דמי/מסלול→bank_charges, מכס/מעמ→op_regulatory, זיכוי→financing_in, פדקס/דואר→op_office, משכורת→salary, העברה/במקבץ→transfer with keyword fallback |
| 2026-04-15 | SVB CSV credit transactions now default to `financing_in` instead of `operating_out` |
| 2026-04-15 | Deployed to Vercel — GitHub repos: `Powerhouse-Cashflow` (origin) and `powerhouse-cashflow-app` (app remote). Fixed .gitignore `data/` → `/data/` to stop it matching `app/api/data/` |
| 2026-04-15 | Logout button added to navbar via `createBrowserClient` + `supabase.auth.signOut()` |
| 2026-04-15 | File-loader company selector now appears as a popup modal after file drop (not always-visible pills) |
| 2026-04-15 | `ServerStatus` fixed to check `res.ok` (401 responses were showing green "Server connected") |
| 2026-04-15 | Removed FX rates fetch from `use-app-data.ts` — external API blocked on Vercel/network; fx-ticker returns null on error |
| 2026-04-15 | Removed debug `console.log` lines from `api/data/route.ts` and `api-route-helper.ts`; kept `console.error` for real errors |
| 2026-04-15 | Initialized git repo — `Supabase.txt` and `.claude/` added to `.gitignore` before first commit to prevent credential leak |
| 2026-04-12 | Multi-format parser built — `FIELD_ALIASES` + `detectHeaderRow()` + `parseGenericSheet()` handles CA_Movements and any bank with readable column headers |
| 2026-04-12 | Duplicate UID hash fixed — balance column (or row index) added as tiebreaker in `parseGenericSheet` and `parseGenericCsv` |
| 2026-04-12 | `useAppData` refactored — `fetchData()` shared between mount and `refresh()`; no more `window.location.reload()` after upload |
| 2026-04-12 | `file-loader.tsx` — step-by-step status messages (blue → green/red); 1.5s hold before refresh so user sees result |
| 2026-04-12 | `CLAUDE.md` created; memory system initialised |
| 2026-04-12 | Removed orphaned `AppProvider` from `app/layout.tsx` — it was wrapping every page and making a redundant `getData()` call that didn't handle the admin response format. Nothing was consuming its context; `cashflow/page.tsx` uses `useAppData` directly. |
| 2026-04-12 | Fixed "Clear All Data" for admin — previously only cleared admin's own row; now calls `clearAllAppData()` which clears every company's `app_data` row. Regular users still only clear their own row. |
| 2026-04-12 | Fixed cash inflows not appearing in chart — `parseGenericSheet` and `parseGenericCsv` were using `classify("", description)` which always returns `"other"` (invisible in chart). Now uses `suggestCategory({ details: description }) ?? (net < 0 ? "operating_out" : "financing_in")` so debits default to `operating_out` and credits to `financing_in`. |
| 2026-04-12 | Per-company rule scoping — `ClassificationRule` gains optional `entities?: string[]` field. Empty = applies to all companies (backward compatible). `applyRule()` skips rules where `t.entity` is not in `rule.entities`. Rules UI shows company scope chips on each rule card; Add/Edit panel has a multi-select toggle for company scope. |

---

## 9. Pending / Future Work
- [ ] Test consolidated view shows all companies' data correctly post-upload (upload files for each company, check merged view)
- [ ] Test Hapoalim NIS xlsx upload — should parse with "Bank Leumi / Hapoalim" format and classify Hebrew operation names correctly
- [ ] Test Poalim Foreign balance-only xlsx — should produce 0 transactions + diagnostic (expected, it's a balance report)
- [ ] **Keep this file updated** — edit CLAUDE.md at the end of every session that changes code
