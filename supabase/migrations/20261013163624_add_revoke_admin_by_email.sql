/*
  F1: Make administrator removal actually take effect.

  The User Management screen called revoke_admin(p_user_id) with operators.id,
  which is a gen_random_uuid() row key of the operator directory and never equals
  an auth user id. The delete matched zero rows and the function still returned
  true, so the screen reported success while the administrator grant survived.

  There is no column linking an operator row to an auth account, but the screen
  does hold the operator's email, which is also how grant_admin_by_email works.
  This adds the symmetric revoke, keeping the same authorisation rules as
  revoke_admin: caller must be an administrator and cannot revoke themselves.
*/

CREATE OR REPLACE FUNCTION public.revoke_admin_by_email(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user_id uuid;
  v_deleted integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_email = '' OR position('@' IN v_email) < 2 THEN
    RAISE EXCEPTION 'Invalid email';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = v_email
  LIMIT 1;

  IF v_user_id IS NOT NULL AND v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.admin_users
  WHERE (v_user_id IS NOT NULL AND user_id = v_user_id)
     OR lower(coalesce(email, '')) = v_email;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'Administrator grant not found';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_admin_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_admin_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_admin_by_email(text) TO authenticated;
