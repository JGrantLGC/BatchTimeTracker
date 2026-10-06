/*
# Auto-generate business day calendar rows for a month

## Purpose
When the dashboard loads for a new month and no business_day_calendar rows
exist for that month, we need to auto-generate them using weekend detection
(Saturday/Sunday = non-business days, all other days = business days).
Since only admins can INSERT into business_day_calendar via RLS, this
SECURITY DEFINER function allows any authenticated user to trigger the
auto-generation, ensuring the dashboard works in future months without
manual admin action.

## New Functions
- `auto_generate_business_days(p_year int, p_month int)` (SECURITY DEFINER)
  - Generates rows for every day in the specified month (0-indexed month).
  - Weekdays get is_business_day = true, weekends get false.
  - Uses ON CONFLICT to avoid overwriting existing rows.
  - Returns the count of rows inserted (0 if already existed).
  - Callable by authenticated role only.

## Security
- Function is SECURITY DEFINER so it bypasses RLS on business_day_calendar.
- EXECUTE granted only to `authenticated` role (not anon).
- Function only inserts, never deletes or updates existing rows.
*/

CREATE OR REPLACE FUNCTION public.auto_generate_business_days(p_year int, p_month int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_in_month int;
  v_inserted int := 0;
  v_date date;
  v_date_str text;
  v_is_biz boolean;
BEGIN
  v_days_in_month := extract(day FROM (make_date(p_year, p_month + 1, 1) - interval '1 day'))::int;

  FOR i IN 1..v_days_in_month LOOP
    v_date := make_date(p_year, p_month + 1, i);
    v_date_str := to_char(v_date, 'YYYY-MM-DD');
    v_is_biz := NOT (extract(dow FROM v_date) IN (0, 6));

    INSERT INTO business_day_calendar (date, is_business_day, label)
    VALUES (v_date, v_is_biz, CASE WHEN NOT v_is_biz THEN 'Weekend' ELSE NULL END)
    ON CONFLICT (date) DO NOTHING;

    IF FOUND THEN
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_generate_business_days(int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_generate_business_days(int, int) TO authenticated;
