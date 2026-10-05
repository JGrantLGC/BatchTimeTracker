/*
# Allow anon operators to look up their department on sign-in

## Problem
The SELECT policy on `operators` was `TO authenticated` only. But
operators sign in through an unauthenticated identity screen using the
anon key — they are NOT authenticated via Supabase auth. The department
lookup (`lookupOperatorByName`) silently returned no rows because the
anon role had no SELECT access. Even when a department record existed
in the database, the operator would not see it on next sign-in.

## Fix
- SELECT: now `TO anon, authenticated` — same pattern as every other
  table in this single-tenant app. Operator department data is
  intentionally shared.
- INSERT: already fixed in prior migration to allow anon + authenticated.
- UPDATE/DELETE: remain admin-only.

## Security
- Department data is not sensitive — it is used to group sessions in
  reports. Allowing anon SELECT is consistent with the rest of the app.
*/

DROP POLICY IF EXISTS "authenticated_read_operators" ON operators;

CREATE POLICY "operator_read_operators" ON operators FOR SELECT
TO anon, authenticated USING (true);
