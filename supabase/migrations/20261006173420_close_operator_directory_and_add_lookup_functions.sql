/*
  # Close the operator directory and route sign-in through safe functions

  1. New functions
     - `lookup_operator_department(p_name text)` returns only the department of the
       single operator whose normalised name matches, never a list.
     - `register_operator(p_name text, p_department text)` records a new operator,
       validating the department against the allowed set and returning the
       department that is actually on file.
     Both are SECURITY DEFINER so the sign-in screen keeps working without the
     client holding read access to the whole table.

  2. Security
     - Anonymous SELECT and INSERT on `operators` are revoked, so the public API
       can no longer be asked for the full staff directory.
     - Direct reads of `operators` are limited to administrators.
     - Operator names are now unique case-insensitively, so the same person can no
       longer end up with two records routed to different departments.
*/

DELETE FROM public.operators a
USING public.operators b
WHERE lower(trim(a.name)) = lower(trim(b.name))
  AND a.created_at > b.created_at;

UPDATE public.operators SET name = trim(name) WHERE name <> trim(name);

ALTER TABLE public.operators DROP CONSTRAINT IF EXISTS operators_name_key;
DROP INDEX IF EXISTS public.operators_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS operators_name_normalized_key
  ON public.operators (lower(trim(name)));

DROP POLICY IF EXISTS "operator_read_operators" ON public.operators;
DROP POLICY IF EXISTS "operator_insert_operators" ON public.operators;

CREATE POLICY "admin_read_operators"
  ON public.operators
  FOR SELECT
  TO authenticated
  USING (is_admin());

REVOKE SELECT, INSERT ON public.operators FROM anon;

CREATE OR REPLACE FUNCTION public.lookup_operator_department(p_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.department
  FROM public.operators o
  WHERE trim(coalesce(p_name, '')) <> ''
    AND lower(trim(o.name)) = lower(trim(coalesce(p_name, '')))
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.register_operator(p_name text, p_department text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text := trim(coalesce(p_name, ''));
  v_dept text := lower(trim(coalesce(p_department, '')));
  v_existing text;
BEGIN
  IF v_name = '' OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Invalid operator name';
  END IF;

  IF v_dept NOT IN ('filling', 'kitting', 'lab operations', 'bioprocessing') THEN
    RAISE EXCEPTION 'Invalid department';
  END IF;

  SELECT o.department INTO v_existing
  FROM public.operators o
  WHERE lower(trim(o.name)) = lower(v_name)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.operators (name, department)
  VALUES (v_name, v_dept)
  ON CONFLICT DO NOTHING;

  SELECT o.department INTO v_existing
  FROM public.operators o
  WHERE lower(trim(o.name)) = lower(v_name)
  LIMIT 1;

  RETURN coalesce(v_existing, v_dept);
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_operator_department(text) FROM public;
REVOKE ALL ON FUNCTION public.register_operator(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.lookup_operator_department(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_operator(text, text) TO anon, authenticated;
