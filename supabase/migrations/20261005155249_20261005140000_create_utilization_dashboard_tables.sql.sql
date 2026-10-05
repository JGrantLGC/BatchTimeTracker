/*
# Utilization dashboard settings and business day calendar

## Purpose
The utilization dashboard needs admin-configurable settings:
- Target utilization rate (percentage)
- Total hours for the month
- Total business days for the month
- A business day calendar so admins can mark which days are business days

## New Tables
- `utilization_settings`
  - `id` (text primary key, always 'current' — single-row table)
  - `target_utilization_percent` (numeric, e.g. 85.0 for 85%)
  - `total_monthly_hours` (numeric, total target hours for the month)
  - `updated_at` (timestamptz)
  - `updated_by` (uuid, references auth.users)

- `business_day_calendar`
  - `id` (uuid primary key)
  - `date` (date, unique — one row per calendar date)
  - `is_business_day` (boolean, not null)
  - `label` (text, nullable — e.g. "Holiday", "Weekend", "Quarter Close")
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## Security
- RLS enabled on both tables.
- SELECT: any authenticated user can read (the dashboard needs to display settings).
- INSERT/UPDATE/DELETE: only admin_users can modify.
*/

CREATE TABLE IF NOT EXISTS utilization_settings (
  id text PRIMARY KEY DEFAULT 'current',
  target_utilization_percent numeric NOT NULL DEFAULT 85.0
    CHECK (target_utilization_percent >= 0 AND target_utilization_percent <= 100),
  total_monthly_hours numeric NOT NULL DEFAULT 0
    CHECK (total_monthly_hours >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE utilization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_utilization_settings" ON utilization_settings;
CREATE POLICY "authenticated_read_utilization_settings"
ON utilization_settings FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "admin_write_utilization_settings" ON utilization_settings;
CREATE POLICY "admin_write_utilization_settings"
ON utilization_settings FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_utilization_settings" ON utilization_settings;
CREATE POLICY "admin_update_utilization_settings"
ON utilization_settings FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_utilization_settings" ON utilization_settings;
CREATE POLICY "admin_delete_utilization_settings"
ON utilization_settings FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE TABLE IF NOT EXISTS business_day_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  is_business_day boolean NOT NULL DEFAULT true,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE business_day_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_business_day_calendar" ON business_day_calendar;
CREATE POLICY "authenticated_read_business_day_calendar"
ON business_day_calendar FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_business_day_calendar" ON business_day_calendar;
CREATE POLICY "admin_insert_business_day_calendar"
ON business_day_calendar FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_update_business_day_calendar" ON business_day_calendar;
CREATE POLICY "admin_update_business_day_calendar"
ON business_day_calendar FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin_delete_business_day_calendar" ON business_day_calendar;
CREATE POLICY "admin_delete_business_day_calendar"
ON business_day_calendar FOR DELETE
TO authenticated
USING (public.is_admin());
