import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { email, password, display_name } = await req.json();
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return json({ error: "Email and password are required." }, 400);
    }

    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password) ||
      !/[^A-Za-z0-9]/.test(password)
    ) {
      return json(
        { error: "Password must be at least 8 characters with a letter, a number, and a special character." },
        400,
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Account creation is only open while the very first administrator has not
    // been set up yet. After that, the caller must already be an administrator.
    const { count, error: countError } = await admin
      .from("admin_users")
      .select("user_id", { count: "exact", head: true });

    if (countError) {
      console.error("admin-signup: failed to read admin_users", countError);
      return json({ error: "Unable to create the administrator account." }, 500);
    }

    const bootstrapOpen = (count ?? 0) === 0;

    if (!bootstrapOpen) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : "";

      let callerIsAdmin = false;
      if (token && token !== Deno.env.get("SUPABASE_ANON_KEY")) {
        const { data: userData } = await admin.auth.getUser(token);
        if (userData?.user) {
          const { data: adminRow } = await admin
            .from("admin_users")
            .select("user_id")
            .eq("user_id", userData.user.id)
            .maybeSingle();
          callerIsAdmin = Boolean(adminRow);
        }
      }

      if (!callerIsAdmin) {
        return json(
          { error: "An existing administrator must create additional administrator accounts." },
          403,
        );
      }
    }

    const { data, error } = await admin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      user_metadata: { display_name: typeof display_name === "string" ? display_name : "" },
      email_confirm: true,
    });

    if (error || !data?.user) {
      // Deliberately uniform: never reveal whether the address already exists.
      console.error("admin-signup: createUser failed", error);
      return json({ error: "Unable to create the administrator account." }, 400);
    }

    return json({ user_id: data.user.id });
  } catch (cause) {
    console.error("admin-signup: unexpected error", cause);
    return json({ error: "Unable to create the administrator account." }, 500);
  }
});
