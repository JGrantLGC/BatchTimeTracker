/*
# Create app_settings table for persistent administrator settings

## Purpose
Administrator-configured settings (barcode delimiter, authorized users list,
default data source) need to persist across all browsers and all user logins,
not just a single browser's localStorage. This table stores those settings
in the Supabase database so every client reads the same shared values.

## New Tables
- `app_settings`
  - `id` (text, primary key, fixed value 'current' — singleton row pattern)
  - `barcode_delimiter` (text, not null, default '|')
  - `authorized_users` (jsonb, not null, default '[]' — array of email strings)
  - `data_source` (text, not null, default 'local' — one of 'local' | 'supabase' | 'custom')
  - `updated_at` (timestamptz, default now())
  - `updated_by` (text, nullable — email of admin who last saved)

## Security
- RLS enabled on `app_settings`.
- SELECT: any authenticated user can read settings (operators need barcode
  delimiter and authorized-users list to function).
- INSERT/UPDATE/DELETE: only authenticated users who are in `admin_users`
  can modify settings. This prevents non-admin operators from changing
  configuration while still letting them read it.
*/

CREATE TABLE IF NOT EXISTS app_settings (
  id text PRIMARY KEY DEFAULT 'current',
  barcode_delimiter text NOT NULL DEFAULT '|',
  authorized_users jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_source text NOT NULL DEFAULT 'local',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Seed the singleton row if it doesn't exist
INSERT INTO app_settings (id)
VALUES ('current')
ON CONFLICT (id) DO NOTHING;

-- SELECT: any authenticated user can read shared settings
DROP POLICY IF EXISTS "authenticated_read_app_settings" ON app_settings;
CREATE POLICY "authenticated_read_app_settings"
ON app_settings FOR SELECT
TO authenticated
USING (true);

-- INSERT: only admin_users can insert
DROP POLICY IF EXISTS "admin_insert_app_settings" ON app_settings;
CREATE POLICY "admin_insert_app_settings"
ON app_settings FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);

-- UPDATE: only admin_users can update
DROP POLICY IF EXISTS "admin_update_app_settings" ON app_settings;
CREATE POLICY "admin_update_app_settings"
ON app_settings FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);

-- DELETE: only admin_users can delete
DROP POLICY IF EXISTS "admin_delete_app_settings" ON app_settings;
CREATE POLICY "admin_delete_app_settings"
ON app_settings FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);
