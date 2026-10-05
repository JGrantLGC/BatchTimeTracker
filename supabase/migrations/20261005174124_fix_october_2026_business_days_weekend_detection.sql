/*
# Fix October 2026 business day calendar — correct weekend detection

1. Changes
- Re-populates October 2026 calendar with corrected weekend logic.
- Previous migration used EXTRACT(ISODOW) IN (6, 0) which missed Sundays (ISODOW returns 7 for Sunday, not 0).
- Now uses EXTRACT(ISODOW FROM d) IN (6, 7) to correctly mark both Saturday (6) and Sunday (7) as non-business days.
- October 12 (Columbus Day) remains a non-business holiday.
- Expected result: 21 business days total, 3 elapsed through Oct 5 (Oct 1 Thu, Oct 2 Fri, Oct 5 Mon).

2. Security
- No RLS or policy changes.
*/

INSERT INTO business_day_calendar (date, is_business_day, label, updated_at)
SELECT
  d::date AS date,
  CASE
    WHEN d::date = '2026-10-12' THEN false
    WHEN EXTRACT(ISODOW FROM d) IN (6, 7) THEN false
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
