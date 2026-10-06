/*
  # Rename session status "Completed" to "Paused"

  1. Changes
     - Update every existing `batch_sessions` row whose `session_status` is
       `Completed` so it becomes `Paused`.

  2. Context
     - The application previously set a session to "Completed" when an operator
       pressed Stop. The status is now called "Paused" to better describe a
       session that is temporarily stopped but may be resumed. "ClosedByEnd"
       remains unchanged.
*/

UPDATE public.batch_sessions
SET session_status = 'Paused'
WHERE session_status = 'Completed';
