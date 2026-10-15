/*
# Allow anon role to read utilization settings

## Problem
Operators sign in with just a name — no Supabase authentication. The browser
uses the anon key for all database queries, which means requests run as the
`anon` role. The existing SELECT policy on `utilization_settings` is scoped to
`TO authenticated` only, so anon-key queries return zero rows and the dashboard
falls back to hardcoded defaults (85% target, 0 monthly hours) instead of
showing the administrator-configured global settings.

## Changes
1. Add a new SELECT policy `anon_read_utilization_settings` scoped to
   `TO anon, authenticated USING (true)` so that any client (anon or
   authenticated) can read the single global settings row.
2. Drop the old `authenticated_read_utilization_settings` policy since the new
   one covers both roles.

## Security
- SELECT is now public (anon + authenticated). This is intentional: the
  utilization settings (target percentage, total monthly hours) are global,
  non-sensitive display values that every operator needs to see on the
  dashboard.
- INSERT, UPDATE, and DELETE policies remain admin-only (`is_admin()`), so
  only administrators can change the settings.
*/