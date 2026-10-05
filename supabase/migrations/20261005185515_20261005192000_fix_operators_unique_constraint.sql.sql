/*
# Fix unique constraint on operators table for correct upsert behavior

## Problem
The `operators` table had `UNIQUE (name, department)`, which allowed
the same operator name to appear multiple times with different
departments. This broke the upsert logic in two places:
1. On first sign-in, `saveOperatorDepartment` upserts with
   `onConflict: "name,department"` — if the admin had already changed
   the department, a duplicate row with the old department still
   existed, and the upsert created a third row instead of updating.
2. The admin page's `updateOperatorDepartment` did a DELETE then
   INSERT, which could leave orphaned rows if the INSERT failed.

## Fix
- Drop the `UNIQUE (name, department)` constraint.
- Add a `UNIQUE (name)` constraint so each operator name has exactly
  one department. This makes upserts with `onConflict: "name"` correctly
  update the department for an existing operator.
- The frontend code will be updated to use `onConflict: "name"` in
  both the sign-in and admin paths.

## Security
- No policy changes. RLS policies remain as-is.
*/

ALTER TABLE operators DROP CONSTRAINT IF EXISTS operators_name_department_key;
ALTER TABLE operators ADD CONSTRAINT operators_name_key UNIQUE (name);
