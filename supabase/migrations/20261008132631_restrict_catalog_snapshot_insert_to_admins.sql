/*
  F4: Close unauthenticated inserts into the material catalogue snapshot.

  The earlier "restrict material catalog writes to admins" migration restricted
  UPDATE and DELETE but left INSERT open to the anon role with a WITH CHECK of
  true, so any unauthenticated caller could publish a snapshot and control what
  every operator sees as the material description and active/inactive status.
  INSERT now matches the UPDATE and DELETE rules already in place.
*/

DROP POLICY IF EXISTS operator_insert_catalog_snapshot ON public.material_catalog_snapshot;

CREATE POLICY admin_insert_catalog_snapshot
  ON public.material_catalog_snapshot
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

REVOKE INSERT ON public.material_catalog_snapshot FROM anon;
