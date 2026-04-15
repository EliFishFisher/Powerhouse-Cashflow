-- ============================================================
--  Powerhouse CashFlow — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── 1. Profiles (maps each auth user to a company) ───────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID    REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  entity_name TEXT    NOT NULL,   -- "Consolidated" | "Corneat" | "Holmes Place PT" | "Orange Space" | "Tribute Brands"
  is_admin    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. App data (one row per company — stores all cashflow data as JSON) ──────
CREATE TABLE IF NOT EXISTS app_data (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        REFERENCES auth.users ON DELETE CASCADE NOT NULL UNIQUE,
  entity_name   TEXT        NOT NULL,
  transactions  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  adjustments   JSONB       NOT NULL DEFAULT '[]'::jsonb,
  excluded      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  overrides     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  manual_entries JSONB      NOT NULL DEFAULT '[]'::jsonb,
  rules         JSONB       NOT NULL DEFAULT '[]'::jsonb,
  meta          JSONB       NOT NULL DEFAULT '{"files":[],"totalTxns":0}'::jsonb,
  recon_status  JSONB       NOT NULL DEFAULT '{"lastRun":null,"errorCount":0,"warningCount":0,"issues":[]}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on writes
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER app_data_updated_at
  BEFORE UPDATE ON app_data
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 3. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_data  ENABLE ROW LEVEL SECURITY;

-- profiles: users can read/update their own row only
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- app_data: regular users see only their own row
CREATE POLICY "app_data_select_own" ON app_data
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "app_data_insert_own" ON app_data
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "app_data_update_own" ON app_data
  FOR UPDATE USING (auth.uid() = user_id);

-- app_data: admins can read ALL rows (for consolidated view)
CREATE POLICY "app_data_select_admin" ON app_data
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE)
  );

-- ── 4. Note: app_data rows are created lazily on first login by the API ───────
-- No trigger needed. The GET /api/data route upserts the row using the
-- entity_name from profiles, so it is always correct.

-- ── 5. Create company users ───────────────────────────────────────────────────
-- Run AFTER creating users via Dashboard → Authentication → Users
-- Replace the UUIDs below with the actual user IDs from Auth → Users table.
--
-- INSERT INTO profiles (id, entity_name, is_admin) VALUES
--   ('dc7d206b-84d8-4153-b2fe-dfc0da69f6e9',  'Consolidated',     TRUE),
--   ('a0a176e3-1e55-42b8-bd91-464184cf043a',                          'Corneat',          FALSE),
--   ('7d172640-41ce-4876-90f3-8d98265f81f3',                     'Holmes Place PT',  FALSE),
--   ('cafc502d-49f4-4973-a68e-d02214de5bd2',                     'Orange Space',     FALSE),
--   ('b862e943-cf7d-4a2c-a20d-68318e28b1cf',                   'Tribute Brands',   FALSE);
