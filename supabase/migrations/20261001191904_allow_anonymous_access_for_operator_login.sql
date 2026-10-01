/*
# Allow anonymous access for operator login mode

1. Modified Tables
- `batch_jobs` — cloud CRUD policies allow anonymous and authenticated operators.
- `batch_sessions` — cloud CRUD policies allow anonymous and authenticated operators.
- `material_catalog_snapshot` — cloud CRUD policies allow anonymous and authenticated operators.

2. Security Changes
- Restores anonymous access because this application now uses an unauthenticated
  operator identity screen instead of Microsoft Entra ID.
- Keeps separate CRUD policies on every table.
- Data is intentionally shared for this single-tenant manufacturing application.

3. Important Notes
- The operator name and email are entered by the person using the screen and are
  not verified by an identity provider.
- Existing rows are preserved; only access rules change.
*/

ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_catalog_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_batch_jobs" ON batch_jobs;
DROP POLICY IF EXISTS "authenticated_insert_batch_jobs" ON batch_jobs;
DROP POLICY IF EXISTS "authenticated_update_batch_jobs" ON batch_jobs;
DROP POLICY IF EXISTS "authenticated_delete_batch_jobs" ON batch_jobs;

CREATE POLICY "operator_select_batch_jobs" ON batch_jobs FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "operator_insert_batch_jobs" ON batch_jobs FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "operator_update_batch_jobs" ON batch_jobs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "operator_delete_batch_jobs" ON batch_jobs FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select_batch_sessions" ON batch_sessions;
DROP POLICY IF EXISTS "authenticated_insert_batch_sessions" ON batch_sessions;
DROP POLICY IF EXISTS "authenticated_update_batch_sessions" ON batch_sessions;
DROP POLICY IF EXISTS "authenticated_delete_batch_sessions" ON batch_sessions;

CREATE POLICY "operator_select_batch_sessions" ON batch_sessions FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "operator_insert_batch_sessions" ON batch_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "operator_update_batch_sessions" ON batch_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "operator_delete_batch_sessions" ON batch_sessions FOR DELETE
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select_catalog_snapshot" ON material_catalog_snapshot;
DROP POLICY IF EXISTS "authenticated_insert_catalog_snapshot" ON material_catalog_snapshot;
DROP POLICY IF EXISTS "authenticated_update_catalog_snapshot" ON material_catalog_snapshot;
DROP POLICY IF EXISTS "authenticated_delete_catalog_snapshot" ON material_catalog_snapshot;

CREATE POLICY "operator_select_catalog_snapshot" ON material_catalog_snapshot FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "operator_insert_catalog_snapshot" ON material_catalog_snapshot FOR INSERT
  TO anon, authenticated WITH CHECK (true);
CREATE POLICY "operator_update_catalog_snapshot" ON material_catalog_snapshot FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "operator_delete_catalog_snapshot" ON material_catalog_snapshot FOR DELETE
  TO anon, authenticated USING (true);
