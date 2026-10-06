/*
  # Bound recorded durations

  1. Changes
     - Clamp any existing out-of-range values so the new constraints can be added.
     - Add CHECK constraints so `batch_sessions.duration_seconds` and
       `batch_jobs.total_seconds` must be non-negative and below one year of
       seconds (31,536,000).

  2. Security
     - A caller can no longer post a negative or absurd duration straight to the
       API to distort the Reports totals and the utilization dashboard. The limit
       is enforced by the database, so it holds regardless of the client.
*/

UPDATE public.batch_sessions
SET duration_seconds = 0
WHERE duration_seconds IS NOT NULL AND duration_seconds < 0;

UPDATE public.batch_sessions
SET duration_seconds = 31536000
WHERE duration_seconds IS NOT NULL AND duration_seconds > 31536000;

UPDATE public.batch_jobs
SET total_seconds = 0
WHERE total_seconds IS NOT NULL AND total_seconds < 0;

UPDATE public.batch_jobs
SET total_seconds = 31536000
WHERE total_seconds IS NOT NULL AND total_seconds > 31536000;

ALTER TABLE public.batch_sessions
  DROP CONSTRAINT IF EXISTS batch_sessions_duration_seconds_range;
ALTER TABLE public.batch_sessions
  ADD CONSTRAINT batch_sessions_duration_seconds_range
  CHECK (duration_seconds IS NULL OR (duration_seconds >= 0 AND duration_seconds <= 31536000));

ALTER TABLE public.batch_jobs
  DROP CONSTRAINT IF EXISTS batch_jobs_total_seconds_range;
ALTER TABLE public.batch_jobs
  ADD CONSTRAINT batch_jobs_total_seconds_range
  CHECK (total_seconds IS NULL OR (total_seconds >= 0 AND total_seconds <= 31536000));
