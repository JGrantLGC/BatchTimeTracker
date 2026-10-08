/*
  F6: Scope the diagnostics cleanup delete on batch_jobs to administrators.

  The policy allowed the anon role to delete any row whose job_key began with
  TEST-, a second route to the same effect that the deliberate admin_delete
  policy beside it guards with is_admin(). The job_key prefix is attacker chosen
  at insert time, so the prefix is not a access control boundary.
*/

DROP POLICY IF EXISTS diagnostics_delete_test_batch_jobs ON public.batch_jobs;

CREATE POLICY diagnostics_delete_test_batch_jobs
  ON public.batch_jobs
  FOR DELETE
  TO authenticated
  USING (is_admin() AND job_key LIKE 'TEST-%');
