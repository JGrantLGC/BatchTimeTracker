/*
  F7: Scope the diagnostics cleanup delete on batch_sessions to administrators.

  Sessions are the system of record here, since every job is derived from them,
  so an unauthenticated delete route into this table is the more damaging of the
  two diagnostics policies. The diagnostics page that relies on this cleanup is
  moved behind the administrator gate in the same change.
*/

DROP POLICY IF EXISTS diagnostics_delete_test_batch_sessions ON public.batch_sessions;

CREATE POLICY diagnostics_delete_test_batch_sessions
  ON public.batch_sessions
  FOR DELETE
  TO authenticated
  USING (is_admin() AND job_key LIKE 'TEST-%');
