DROP POLICY IF EXISTS "authenticated_read_utilization_settings" ON public.utilization_settings;
DROP POLICY IF EXISTS "anon_read_utilization_settings" ON public.utilization_settings;

CREATE POLICY "anon_read_utilization_settings"
  ON public.utilization_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);