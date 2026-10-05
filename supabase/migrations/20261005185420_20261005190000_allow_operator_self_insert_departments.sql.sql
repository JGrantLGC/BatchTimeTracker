/*
# Allow operators to self-register their department on first sign-in

## Problem
The `operators` table INSERT policy was restricted to admin_users only.
But operators sign in through an unauthenticated identity screen — they
are NOT admin users and may not even be authenticated. When a new
operator picks their department on first sign-in, the INSERT was
silently rejected by RLS, so the department was never persisted. On
next sign-in the lookup returns nothing and they have to pick again.

## Fix
- INSERT: allow anon + authenticated (same pattern as batch_jobs,
  batch_sessions, etc.). Operators can create their own department
  record on first sign-in. The unique constraint on (name, department)
  still prevents duplicates.
- UPDATE/DELETE: remain admin-only (administrators change departments
  from the admin page; operators cannot change their own department).
- SELECT: unchanged — any authenticated user can read.

## Security
- INSERT is now open to anon + authenticated, consistent with the rest
  of this single-tenant app's tables. Data is intentionally shared.
- UPDATE and DELETE remain restricted to admin_users.
*/

DROP POLICY IF EXISTS "admin_insert_operators" ON operators;

CREATE POLICY "operator_insert_operators" ON operators FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "admin_update_operators" ON operators;
CREATE POLICY "admin_update_operators" ON operators FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admin_delete_operators" ON operators;
CREATE POLICY "admin_delete_operators" ON operators FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);
