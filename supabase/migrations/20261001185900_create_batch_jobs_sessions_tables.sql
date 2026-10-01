/*
# Create tables for material batch jobs, sessions, and material catalog snapshot

1. New Tables
- `batch_jobs` — tracks each barcode-scanned job (material + batch), its status,
  accumulated time, and last operator action. One row per unique JobKey.
- `batch_sessions` — individual Start/Stop sessions belonging to a job.
  Multiple sessions accumulate to the job's total time.
- `material_catalog_snapshot` — single-row table holding the current Plant 1200
  material master catalog as a JSON blob. Replaced atomically on each import.

2. Security
- This is a single-tenant app with no sign-in screen. All policies use
  `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)` because
  the data is intentionally shared across all operators.
- RLS is enabled on every table.

3. Important Notes
- IDs are text (generated client-side as `job-...` / `ses-...`).
- Timestamps are stored as timestamptz.
- The catalog snapshot table stores the entire catalog as JSONB to preserve
  the "single atomic replace" semantics of the original in-memory design.
*/

-- ── batch_jobs ──
CREATE TABLE IF NOT EXISTS batch_jobs (
  id text PRIMARY KEY,
  job_key text NOT NULL,
  raw_barcode text,
  material_number text NOT NULL,
  material_description text,
  batch_number text NOT NULL,
  job_status text NOT NULL DEFAULT 'New',
  current_start_time timestamptz,
  total_seconds numeric DEFAULT 0,
  ended_time timestamptz,
  last_operator_email text,
  last_operator_name text,
  last_action_time timestamptz,
  created timestamptz DEFAULT now(),
  modified timestamptz DEFAULT now()
);

ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_batch_jobs" ON batch_jobs;
CREATE POLICY "anon_select_batch_jobs" ON batch_jobs FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_batch_jobs" ON batch_jobs;
CREATE POLICY "anon_insert_batch_jobs" ON batch_jobs FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_batch_jobs" ON batch_jobs;
CREATE POLICY "anon_update_batch_jobs" ON batch_jobs FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_batch_jobs" ON batch_jobs;
CREATE POLICY "anon_delete_batch_jobs" ON batch_jobs FOR DELETE
  TO anon, authenticated USING (true);

-- ── batch_sessions ──
CREATE TABLE IF NOT EXISTS batch_sessions (
  id text PRIMARY KEY,
  job_key text NOT NULL,
  job_id text,
  material_number text NOT NULL,
  material_description text,
  batch_number text NOT NULL,
  start_time timestamptz NOT NULL,
  stop_time timestamptz,
  duration_seconds numeric DEFAULT 0,
  session_status text NOT NULL DEFAULT 'Running',
  operator_email text,
  operator_name text,
  created timestamptz DEFAULT now(),
  modified timestamptz DEFAULT now()
);

ALTER TABLE batch_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_batch_sessions" ON batch_sessions;
CREATE POLICY "anon_select_batch_sessions" ON batch_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_batch_sessions" ON batch_sessions;
CREATE POLICY "anon_insert_batch_sessions" ON batch_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_batch_sessions" ON batch_sessions;
CREATE POLICY "anon_update_batch_sessions" ON batch_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_batch_sessions" ON batch_sessions;
CREATE POLICY "anon_delete_batch_sessions" ON batch_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- ── material_catalog_snapshot ──
CREATE TABLE IF NOT EXISTS material_catalog_snapshot (
  id text PRIMARY KEY DEFAULT 'current',
  revision integer NOT NULL DEFAULT 0,
  imported_at timestamptz DEFAULT now(),
  source_label text,
  entries jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE material_catalog_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_catalog_snapshot" ON material_catalog_snapshot;
CREATE POLICY "anon_select_catalog_snapshot" ON material_catalog_snapshot FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_catalog_snapshot" ON material_catalog_snapshot;
CREATE POLICY "anon_insert_catalog_snapshot" ON material_catalog_snapshot FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_catalog_snapshot" ON material_catalog_snapshot;
CREATE POLICY "anon_update_catalog_snapshot" ON material_catalog_snapshot FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_catalog_snapshot" ON material_catalog_snapshot;
CREATE POLICY "anon_delete_catalog_snapshot" ON material_catalog_snapshot FOR DELETE
  TO anon, authenticated USING (true);

-- Index for common lookups
CREATE INDEX IF NOT EXISTS idx_batch_jobs_job_key ON batch_jobs(job_key);
CREATE INDEX IF NOT EXISTS idx_batch_sessions_job_key ON batch_sessions(job_key);
