/*
# Track which month total monthly hours was last configured for

## Purpose
The utilization_settings table has a single row (id = 'current') that stores
target_utilization_percent and total_monthly_hours. When the calendar moves
to a new month, total_monthly_hours may be stale (set for a prior month).
This migration adds a `settings_month` column that records the year-month
the values were last saved, so the dashboard can detect staleness and show
a flag asking the admin to update.

## Changes
- Added column `settings_month` (text, nullable) to utilization_settings.
  Format: 'YYYY-MM' (e.g. '2026-10'). NULL means it was saved before this
  migration existed — treated as potentially stale.
- Backfilled existing row's settings_month to the current server month.

## Security
- No RLS policy changes. Existing policies remain in effect.
*/

ALTER TABLE utilization_settings
  ADD COLUMN IF NOT EXISTS settings_month text;

UPDATE utilization_settings
  SET settings_month = to_char(now(), 'YYYY-MM')
  WHERE id = 'current' AND settings_month IS NULL;
