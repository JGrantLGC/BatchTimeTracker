/*
  F8: Restrict reading the application settings to administrators.

  authenticated_read_app_settings used USING (true), so any signed-in account
  that is not an administrator could read authorized_users, the list that decides
  who may stop or end another operator's job. Every write policy on this table
  already requires administrator membership; the read now matches.

  The only reader is loadSettingsFromSupabase, which returns silently when the
  query yields nothing, so the unauthenticated operator flow is unaffected.
*/

DROP POLICY IF EXISTS authenticated_read_app_settings ON public.app_settings;

CREATE POLICY admin_read_app_settings
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (is_admin());

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.app_settings FROM anon;
