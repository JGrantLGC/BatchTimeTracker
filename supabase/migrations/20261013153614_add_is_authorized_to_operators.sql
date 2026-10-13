/*
# Add is_authorized to operators table

1. Changes to existing tables
- `operators`: add `is_authorized` boolean NOT NULL DEFAULT false.
  When true, this operator can Stop or End another operator's Running job.

2. Data migration
- Backfill is_authorized = true for any operator whose email appears
  in the existing authorized_users jsonb array in app_settings.

3. Security
- No new policies needed. Existing admin policies cover the new column.
*/

ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS is_authorized boolean NOT NULL DEFAULT false;

-- Backfill from app_settings.authorized_users (jsonb array of emails)
UPDATE public.operators op
  SET is_authorized = true
  WHERE op.email IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.app_settings s
      WHERE s.authorized_users::jsonb @> to_jsonb(lower(op.email))
    );
