/*
  # Make the first-administrator claim atomic

  1. Changes
     - Rewrite `claim_first_admin` so the emptiness check and the insert are a
       single statement. Previously two callers could both read an empty
       `admin_users` table and both become administrators.

  2. Security
     - Exactly one account can win the first-administrator claim.
*/

CREATE OR REPLACE FUNCTION public.claim_first_admin(p_display_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.admin_users (user_id, email, display_name)
  SELECT
    v_user_id,
    COALESCE(auth.jwt() ->> 'email', ''),
    NULLIF(trim(p_display_name), '')
  WHERE NOT EXISTS (SELECT 1 FROM public.admin_users)
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted > 0;
END;
$$;
