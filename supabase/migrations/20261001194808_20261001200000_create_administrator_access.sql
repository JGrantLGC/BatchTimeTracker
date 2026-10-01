/*
# Tighten administrator function execution grants

1. Security Changes
- Remove default PUBLIC and anonymous execution from administrator functions.
- Allow only signed-in accounts to check setup status, claim the first administrator, grant access, revoke access, or check administrator status.

2. Important Notes
- The operator name sign-in remains independent from administrator authentication.
- The Administration screen now checks first-time setup only after a signed-in administrator account exists.
*/

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_setup_available() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_setup_available() TO authenticated;

REVOKE ALL ON FUNCTION public.claim_first_admin(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin(text) TO authenticated;

REVOKE ALL ON FUNCTION public.grant_admin_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_admin_by_email(text) TO authenticated;

REVOKE ALL ON FUNCTION public.revoke_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_admin(uuid) TO authenticated;