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
- Returns: `data, loading, serverOk, isAdmin, companies, refresh, clearAll, saveTransactions, saveRules, toggleExclude, setCatOverride`

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
- [ ] Deploy to Vercel (push to GitHub → connect Vercel → add env vars)
- [ ] Remove debug `console.log` lines from `api/data/route.ts` and `api-route-helper.ts` once stable
- [ ] Test consolidated view shows all companies' data correctly post-upload
- [ ] "FX unavailable" banner — external API (frankfurter.app) blocked on this network; not a code bug
- [ ] **Keep this file updated** — edit CLAUDE.md at the end of every session that changes code
