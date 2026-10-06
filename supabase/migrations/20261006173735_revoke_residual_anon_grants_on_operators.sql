/*
  # Remove leftover anonymous write grants on operators

  1. Changes
     - Revoke UPDATE and DELETE on `public.operators` from `anon`.

  2. Security
     - No anonymous policy allows these commands, so row level security already
       denied them. Removing the grants as well means a future policy added for
       another purpose cannot accidentally re-open anonymous writes to the
       operator records.
*/

REVOKE UPDATE, DELETE ON public.operators FROM anon;
