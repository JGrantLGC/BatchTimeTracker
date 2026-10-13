/*
  F8: Restrict batch_sessions.session_status to the values the app understands.

  INSERT is open to anon (WITH CHECK true) and the operator UPDATE policy has
  WITH CHECK (true), so any string could be stored. A row holding an unrecognised
  status never matches 'ClosedByEnd', so it stays permanently editable and the
  derived job status and utilization dashboard read a state with no handling.

  Existing rows are normalised first so the constraint can be added without
  rejecting history.
*/

UPDATE public.batch_sessions
SET session_status = 'Paused'
WHERE session_status IS NULL
   OR session_status NOT IN ('Running', 'Paused', 'ClosedByEnd');

ALTER TABLE public.batch_sessions
  ALTER COLUMN session_status SET NOT NULL;

ALTER TABLE public.batch_sessions
  DROP CONSTRAINT IF EXISTS batch_sessions_session_status_valid;

ALTER TABLE public.batch_sessions
  ADD CONSTRAINT batch_sessions_session_status_valid
  CHECK (session_status IN ('Running', 'Paused', 'ClosedByEnd'));
