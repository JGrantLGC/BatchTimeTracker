/*
  # Protect the material master catalog

  1. Changes
     - Drop the permissive update and delete policies on
       `material_catalog_snapshot` that let any anonymous caller rewrite or wipe
       the catalog every barcode scan is resolved against.
     - Replace them with administrator-only policies.
     - Anonymous INSERT is retained so the app's first-run self-seed still works
       on an empty deployment; the seeding code only inserts when no catalog
       entries exist yet.

  2. Security
     - The catalog can no longer be poisoned by an unauthenticated caller.
*/

DROP POLICY IF EXISTS "operator_update_catalog_snapshot" ON public.material_catalog_snapshot;
DROP POLICY IF EXISTS "operator_delete_catalog_snapshot" ON public.material_catalog_snapshot;

CREATE POLICY "admin_update_catalog_snapshot"
  ON public.material_catalog_snapshot
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY "admin_delete_catalog_snapshot"
  ON public.material_catalog_snapshot
  FOR DELETE
  TO authenticated
  USING (is_admin());
