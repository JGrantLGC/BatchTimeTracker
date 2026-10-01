/*
# Require authenticated access for batch data

1. Modified Tables
- `batch_jobs` — access policies now require an authenticated Supabase user.
- `batch_sessions` — access policies now require an authenticated Supabase user.
- `material_catalog_snapshot` — access policies now require an authenticated Supabase user.

2. Security Changes
- Removes anonymous read, insert, update, and delete access from all batch data tables.
- Keeps four separate CRUD policies per table for authenticated users.
- Data remains intentionally shared between signed-in operators because this application
  tracks a shared manufacturing operation rather than private personal records.

3. Important Notes
- The frontend must authenticate through Microsoft Entra ID before it can access cloud data.
- Existing rows are preserved; this migration changes access rules only.
- Local browser storage remains available when the administrator selects Browser (Local).
*/

ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_catalog_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_batch_jobs" ON batch_jobs;
DROP POLICY IF EXISTS "anon_insert_batch_jobs" ON batch_jobs;
DROP POLICY IF EXISTS "anon_update_batch_jobs" ON batch_jobs;
DROP POLICY IF EXISTS "anon_delete_batch_jobs" ON batch_jobs;

CREATE POLICY "authenticated_select_batch_jobs" ON batch_jobs FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_insert_batch_jobs" ON batch_jobs FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_batch_jobs" ON batch_jobs FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_batch_jobs" ON batch_jobs FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_batch_sessions" ON batch_sessions;
DROP POLICY IF EXISTS "anon_insert_batch_sessions" ON batch_sessions;
DROP POLICY IF EXISTS "anon_update_batch_sessions" ON batch_sessions;
DROP POLICY IF EXISTS "anon_delete_batch_sessions" ON batch_sessions;

CREATE POLICY "authenticated_select_batch_sessions" ON batch_sessions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_insert_batch_sessions" ON batch_sessions FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_batch_sessions" ON batch_sessions FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_batch_sessions" ON batch_sessions FOR DELETE
  TO authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_catalog_snapshot" ON material_catalog_snapshot;
DROP POLICY IF EXISTS "anon_insert_catalog_snapshot" ON material_catalog_snapshot;
DROP POLICY IF EXISTS "anon_update_catalog_snapshot" ON material_catalog_snapshot;
DROP POLICY IF EXISTS "anon_delete_catalog_snapshot" ON material_catalog_snapshot;

CREATE POLICY "authenticated_select_catalog_snapshot" ON material_catalog_snapshot FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authenticated_insert_catalog_snapshot" ON material_catalog_snapshot FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_catalog_snapshot" ON material_catalog_snapshot FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_catalog_snapshot" ON material_catalog_snapshot FOR DELETE
  TO authenticated USING (true);
