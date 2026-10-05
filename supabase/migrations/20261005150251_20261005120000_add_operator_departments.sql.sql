/*
# Add operator departments and session department tracking

## Purpose
Operators need to be assigned to a department (filling, kitting, lab operations,
or bioprocessing) so that sessions can be reported collectively or filtered by
department. The department is chosen on first sign-in and remembered for
subsequent sign-ins. Administrators can change an operator's department later.

## New Tables
- `operators`
  - `id` (uuid, primary key)
  - `name` (text, not null — operator display name)
  - `department` (text, not null — one of: filling, kitting, lab operations, bioprocessing)
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
  - Unique constraint on (name, department) to prevent duplicates

## Modified Tables
- `batch_sessions`
  - Added `department` (text, nullable) column to track which department the
    operator was in when the session was created. Nullable so existing sessions
    are not broken.

## Security
- RLS enabled on `operators`.
- SELECT: any authenticated user can read operator departments (operators need
  to look up their own department on sign-in).
- INSERT/UPDATE/DELETE: only admin_users can modify operator records.
- The `batch_sessions` RLS policies are unchanged (already allows authenticated
  users full CRUD).
*/

CREATE TABLE IF NOT EXISTS operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department text NOT NULL CHECK (department IN ('filling', 'kitting', 'lab operations', 'bioprocessing')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, department)
);

ALTER TABLE operators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_operators" ON operators;
CREATE POLICY "authenticated_read_operators"
ON operators FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "admin_insert_operators" ON operators;
CREATE POLICY "admin_insert_operators"
ON operators FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admin_update_operators" ON operators;
CREATE POLICY "admin_update_operators"
ON operators FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);

DROP POLICY IF EXISTS "admin_delete_operators" ON operators;
CREATE POLICY "admin_delete_operators"
ON operators FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid())
);

-- Add department column to batch_sessions (nullable for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'batch_sessions' AND column_name = 'department'
  ) THEN
    ALTER TABLE batch_sessions ADD COLUMN department text;
  END IF;
END $$;
