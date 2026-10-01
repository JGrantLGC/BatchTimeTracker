/*
# Create administrator access control

1. New Tables
- `admin_users` stores the Supabase account IDs that are allowed to open Administration, along with their email and display name.

2. Security
- Row-level security is enabled on `admin_users`.
- Administrators can read the administrator list; each authenticated account can read only its own row.
- Direct inserts, updates, and deletes are not exposed to the browser.
- Secure database functions allow the first authenticated account to claim administration and allow existing administrators to grant or revoke access.

3. Important Notes
- The existing operator name sign-in remains unchanged and does not require email or a password.
- The first administrator is created through the Administration sign-in screen after creating an administrator account.
- Additional administrators must first have a Supabase account, then an existing administrator can grant access using that account's email.
*/

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_setup_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.admin_users);
$$;

CREATE OR REPLACE FUNCTION public.claim_first_admin(p_display_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admin_users) THEN
    RETURN false;
  END IF;

  INSERT INTO public.admin_users (user_id, email, display_name)
  VALUES (
    v_user_id,
    COALESCE(auth.jwt() ->> 'email', ''),
    NULLIF(trim(p_display_name), '')
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_admin_by_email(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_user_id uuid;
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

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  INSERT INTO public.admin_users (user_id, email, display_name)
  VALUES (v_user_id, v_email, COALESCE(NULLIF(trim(split_part(v_email, '@', 1)), ''), v_email))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  DELETE FROM public.admin_users WHERE user_id = p_user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON public.admin_users FROM anon, authenticated;
GRANT SELECT ON public.admin_users TO authenticated;

DROP POLICY IF EXISTS "Admins can read administrator list" ON public.admin_users;
CREATE POLICY "Admins can read administrator list"
ON public.admin_users FOR SELECT
TO authenticated
USING (public.is_admin());

REVOKE ALL ON FUNCTION public.is_admin() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_setup_available() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_setup_available() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.claim_first_admin(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin(text) TO authenticated;

REVOKE ALL ON FUNCTION public.grant_admin_by_email(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin_by_email(text) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_admin(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin(uuid) TO authenticated;