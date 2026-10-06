/*
  # Let the signed-out sign-in screen check whether first-run setup is pending

  1. Changes
     - Grant EXECUTE on `admin_setup_available()` to `anon`.

  2. Security
     - The function returns only a boolean saying whether any administrator exists
       yet. It exposes no account data, and the sign-in screen needs it so the
       "create the first administrator" option is hidden once setup is complete.
*/

GRANT EXECUTE ON FUNCTION public.admin_setup_available() TO anon;
