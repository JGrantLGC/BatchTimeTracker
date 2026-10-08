/*
  F5: Require administrator rights to generate the business day calendar.

  auto_generate_business_days is SECURITY DEFINER with EXECUTE granted to anon,
  and its body inserts straight into business_day_calendar, whose own policies
  admit only administrators. That made the function a hole through the admin
  gate: any unauthenticated caller could populate the calendar that the
  utilisation percentage is calculated against.
*/

CREATE OR REPLACE FUNCTION public.auto_generate_business_days(p_year integer, p_month integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_days_in_month int;
  v_inserted int := 0;
  v_date date;
  v_is_biz boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_year < 2000 OR p_year > 2200 OR p_month < 0 OR p_month > 11 THEN
    RAISE EXCEPTION 'Invalid year or month';
  END IF;

  v_days_in_month := extract(day FROM (make_date(p_year, p_month + 1, 1) + interval '1 month' - interval '1 day'))::int;

  FOR i IN 1..v_days_in_month LOOP
    v_date := make_date(p_year, p_month + 1, i);
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
$function$;

REVOKE EXECUTE ON FUNCTION public.auto_generate_business_days(integer, integer) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_generate_business_days(integer, integer) TO authenticated;
