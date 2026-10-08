/*
  F3: Lock down the unused batch_jobs table.

  Jobs are derived entirely from batch_sessions (see MaterialBatchJobService and
  job-derivation.ts); no application code reads or writes this table. It was
  nonetheless open to the anon role for SELECT, INSERT and UPDATE with always
  true predicates, letting any unauthenticated caller inject or alter rows.
  Reduced to administrators only.
*/

DROP POLICY IF EXISTS operator_select_batch_jobs ON public.batch_jobs;
DROP POLICY IF EXISTS operator_insert_batch_jobs ON public.batch_jobs;
DROP POLICY IF EXISTS operator_update_batch_jobs ON public.batch_jobs;

CREATE POLICY admin_select_batch_jobs
  ON public.batch_jobs
  FOR SELECT
  TO authenticated
  USING (is_admin());

CREATE POLICY admin_insert_batch_jobs
  ON public.batch_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY admin_update_batch_jobs
  ON public.batch_jobs
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.batch_jobs FROM anon;
