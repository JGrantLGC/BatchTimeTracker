/*
  F2 correction.

  The previous migration applied the "not already closed" rule to WITH CHECK as
  well as USING, which would have blocked the End action itself, since ending a
  job transitions a Running session into ClosedByEnd.

  USING governs the row as it exists before the write, which is the check that
  actually protects history: a row already in ClosedByEnd cannot be updated. The
  resulting state is unconstrained so the closing transition still succeeds.
*/

DROP POLICY IF EXISTS operator_update_open_batch_sessions ON public.batch_sessions;

CREATE POLICY operator_update_open_batch_sessions
  ON public.batch_sessions
  FOR UPDATE
  TO anon, authenticated
  USING (session_status <> 'ClosedByEnd')
  WITH CHECK (true);
