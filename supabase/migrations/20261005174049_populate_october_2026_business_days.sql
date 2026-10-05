/*
# Populate business day calendar for October 2026

1. Changes
- Inserts all 31 days of October 2026 into `business_day_calendar`.
- Monday–Friday are marked as business days (is_business_day = true).
- Saturdays and Sundays are marked as non-business days.
- October 12 (Columbus Day / Indigenous Peoples' Day) is marked as a non-business holiday with label 'Columbus Day'.
- Uses upsert with onConflict 'date' so existing rows (e.g. the Oct 12 entry) are updated, not duplicated.
- Total business days for October 2026: 21 (22 weekdays minus the Oct 12 holiday).
- Business days elapsed through Oct 5 (current date): 3 (Oct 1, 2, 5).

2. Security
- No RLS or policy changes. Table already has policies in place.
*/

INSERT INTO business_day_calendar (date, is_business_day, label, updated_at)
SELECT
  d::date AS date,
  CASE
    WHEN d::date = '2026-10-12' THEN false
    WHEN EXTRACT(ISODOW FROM d) IN (6, 0) THEN false
    ELSE true
  END AS is_business_day,
  CASE
    WHEN d::date = '2026-10-12' THEN 'Columbus Day'
    ELSE NULL
  END AS label,
  now() AS updated_at
FROM generate_series('2026-10-01'::date, '2026-10-31'::date, '1 day'::interval) AS d
ON CONFLICT (date) DO UPDATE
SET
  is_business_day = EXCLUDED.is_business_day,
  label = EXCLUDED.label,
  updated_at = EXCLUDED.updated_at;
