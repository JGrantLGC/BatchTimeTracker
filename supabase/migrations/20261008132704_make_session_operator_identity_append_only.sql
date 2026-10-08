/*
  F1: Make the operator identity columns on batch_sessions append-only.

  The row level UPDATE rule on batch_sessions permits updating every column of a
  row, including operator_name, operator_email and department, so any caller
  could reattribute a recorded time session to a different person. These three
  columns are written once at insert and never legitimately rewritten: the only
  client update paths (stop, end, and the session edit dialog) send stop_time,
  duration_seconds and session_status.

  Table level SELECT and INSERT are deliberately left untouched so the
  unauthenticated operator flow keeps working.
*/

REVOKE UPDATE ON public.batch_sessions FROM anon, authenticated;

GRANT UPDATE (stop_time, duration_seconds, session_status, modified)
  ON public.batch_sessions
  TO anon, authenticated;
