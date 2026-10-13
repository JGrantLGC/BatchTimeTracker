/*
# Add is_admin to operators table and enable admin insert

1. Changes to existing tables
- `operators`: add `is_admin` boolean NOT NULL DEFAULT false.
  This column records whether an operator also has administrator rights.
  It replaces the separate `admin_users` table for the purposes of the
  User Management page, which now shows every operator in one list with
  a radio button to toggle admin status.

2. Data migration
- Any operator whose `name` matches the `display_name` of an existing
  `admin_users` row, OR whose email (if we had one — operators currently
  store only name) is in `admin_users`, is set to `is_admin = true`.
  Because the operators table stores `name` and `admin_users` stores
  `display_name`, we match on that. Existing admin_users rows that do
  not match any operator remain untouched — the admin_users table and
  the is_admin() / grant_admin_by_email / revoke_admin functions still
  work exactly as before.

3. Security / RLS
- Add `admin_insert_operators` INSERT policy (authenticated, is_admin()).
  Previously operators had no INSERT policy — only SELECT (admin) and
  UPDATE/DELETE (admin). The new User Management page needs to add
  operators, so INSERT is now allowed for administrators.
- The existing `admin_read_operators`, `admin_update_operators`, and
  `admin_delete_operators` policies remain unchanged.
*/

ALTER TABLE public.operators
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Sync: flag operators whose name matches an admin display_name
UPDATE public.operators op
  SET is_admin = true
  WHERE EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE au.display_name = op.name
  );

-- Allow administrators to insert new operator rows
DROP POLICY IF EXISTS admin_insert_operators ON public.operators;
CREATE POLICY admin_insert_operators
  ON public.operators FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());
