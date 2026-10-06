/*
  # One job record per material and batch

  1. Changes
     - Fold any existing duplicate `job_key` rows into the earliest record,
       summing their accumulated time and repointing their sessions, then remove
       the duplicates.
     - Add a unique index on `batch_jobs.job_key`.

  2. Security
     - Two operators scanning the same barcode at the same moment can no longer
       each create their own job row with a partial total. The database now
       settles the race instead of the browser.
*/

WITH ranked AS (
  SELECT id, job_key,
         row_number() OVER (PARTITION BY job_key ORDER BY created NULLS LAST, id) AS rn,
         first_value(id) OVER (PARTITION BY job_key ORDER BY created NULLS LAST, id) AS keep_id
  FROM public.batch_jobs
),
dupes AS (
  SELECT id, keep_id FROM ranked WHERE rn > 1
)
UPDATE public.batch_sessions s
SET job_id = d.keep_id
FROM dupes d
WHERE s.job_id = d.id;

WITH ranked AS (
  SELECT id, job_key, total_seconds,
         row_number() OVER (PARTITION BY job_key ORDER BY created NULLS LAST, id) AS rn,
         first_value(id) OVER (PARTITION BY job_key ORDER BY created NULLS LAST, id) AS keep_id
  FROM public.batch_jobs
),
extra AS (
  SELECT keep_id, sum(coalesce(total_seconds, 0)) AS extra_seconds
  FROM ranked WHERE rn > 1 GROUP BY keep_id
)
UPDATE public.batch_jobs j
SET total_seconds = least(coalesce(j.total_seconds, 0) + e.extra_seconds, 31536000)
FROM extra e
WHERE j.id = e.keep_id;

DELETE FROM public.batch_jobs
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY job_key ORDER BY created NULLS LAST, id) AS rn
    FROM public.batch_jobs
  ) r WHERE r.rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS batch_jobs_job_key_unique
  ON public.batch_jobs (job_key);
