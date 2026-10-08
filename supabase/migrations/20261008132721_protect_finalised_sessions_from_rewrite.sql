/*
  F2: Stop sessions that have already been finalised from being rewritten.

  operator_update_batch_sessions used USING (true) WITH CHECK (true), so a single
  filtered request could zero the recorded duration of every completed job. The
  application re-checks job state in the browser before a stop, but that check
  does not run on the Data API route.

  A session closed by End is final, so it is now excluded from UPDATE on both
  sides of the policy. Running and Paused sessions remain editable, which is what
  the stop, end and session edit flows need. Administrators keep a separate route
  for corrections.
*/

DROP POLICY IF EXISTS operator_update_batch_sessions ON public.batch_sessions;

CREATE POLICY operator_update_open_batch_sessions
  ON public.batch_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (session_status <> 'ClosedByEnd')
  WITH CHECK (session_status <> 'ClosedByEnd');

CREATE POLICY admin_update_batch_sessions
  ON public.batch_sessions
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
