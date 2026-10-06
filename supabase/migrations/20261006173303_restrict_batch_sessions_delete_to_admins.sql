/*
  # Restrict batch session deletion

  1. Changes
     - Drop the permissive `operator_delete_batch_sessions` policy that allowed any
       anonymous caller to delete every recorded work session.
     - Replace it with an administrator-only delete policy, matching the fact that
       the only session deletion in the app lives on the administration page.
     - Keep a narrow exception for the diagnostics self-test's `TEST-` rows.

  2. Security
     - Unauthenticated callers can no longer destroy accumulated time records.
*/

DROP POLICY IF EXISTS "operator_delete_batch_sessions" ON public.batch_sessions;

CREATE POLICY "admin_delete_batch_sessions"
  ON public.batch_sessions
  FOR DELETE
  TO authenticated
  USING (is_admin());

CREATE POLICY "diagnostics_delete_test_batch_sessions"
  ON public.batch_sessions
  FOR DELETE
  TO anon, authenticated
  USING (job_key LIKE 'TEST-%');
