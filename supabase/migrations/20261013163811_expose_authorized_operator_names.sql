/*
  F4: Let the operator screen find out who is marked Authorized.

  The Authorized radio writes operators.is_authorized, but the operators table is
  readable only by administrators and app_settings likewise, so the list never
  reached an operator's browser and the Stop/End restriction could never be
  lifted for anyone.

  This exposes only the names of operators marked Authorized. Operator names are
  already readable by anonymous callers through batch_sessions.operator_name, so
  this publishes nothing new, and it carries no email, department, admin flag or
  row id.

  This remains a convenience gate in the browser. Operator sign-in takes a typed
  name with no credential, so the database still cannot verify who is calling.
*/

CREATE OR REPLACE FUNCTION public.authorized_operator_names()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name
  FROM public.operators o
  WHERE o.is_authorized = true
    AND coalesce(trim(o.name), '') <> '';
$$;

REVOKE ALL ON FUNCTION public.authorized_operator_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.authorized_operator_names() TO anon, authenticated;
