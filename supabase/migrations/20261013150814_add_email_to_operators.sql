/*
# Add email column to operators table

1. Changes to existing tables
- `operators`: add `email` text column (nullable).
  Stores the email address associated with the operator's auth account.
  Used by the User Management page to grant/revoke administrator access
  via the grant_admin_by_email database function, which looks up
  auth.users by email.

2. Data migration
- Backfill email from admin_users where the operator name matches
  an admin display_name. This ensures existing admins retain their
  email association.

3. Security
- No new policies needed. The existing admin_read_operators policy
  covers the new column via the SELECT grant. The existing
  admin_update_operators policy allows admins to update any column.
  The existing admin_insert_operators policy allows admins to insert
  with any columns.
*/

ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS email text;

-- Backfill: match operator name to admin display_name
UPDATE public.operators op
  SET email = au.email
  FROM public.admin_users au
  WHERE au.display_name = op.name
    AND op.email IS NULL;
