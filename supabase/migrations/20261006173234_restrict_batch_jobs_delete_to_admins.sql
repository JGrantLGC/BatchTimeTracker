/*
  # Restrict batch job deletion

  1. Changes
     - Drop the permissive `operator_delete_batch_jobs` policy that allowed any
       anonymous caller to delete every row in `batch_jobs`.
     - Replace it with an administrator-only delete policy.
     - Keep a narrow exception so the built-in diagnostics self-test can still
       clean up the throwaway rows it creates, which always use a `TEST-` job key.

  2. Security
     - Unauthenticated callers can no longer remove production job records.
*/

DROP POLICY IF EXISTS "operator_delete_batch_jobs" ON public.batch_jobs;

CREATE POLICY "admin_delete_batch_jobs"
  ON public.batch_jobs
  FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "diagnostics_delete_test_batch_jobs"
  ON public.batch_jobs
  FOR DELETE
  TO anon, authenticated
  USING (job_key LIKE 'TEST-%');
