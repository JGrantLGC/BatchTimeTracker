import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { ShieldCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string;
  created_at: string;
}

interface AdminAccessContextValue {
  session: Session;
  refreshAdminStatus: () => Promise<void>;
}

const AdminAccessContext = createContext<AdminAccessContextValue | null>(null);

export function AdminGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [setupAvailable, setSetupAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refreshAdminStatus(nextSession: Session | null = session) {
    if (!nextSession) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    const { data, error } = await getSupabase()
      .from("admin_users")
      .select("user_id")
      .eq("user_id", nextSession.user.id)
      .maybeSingle();
    if (error) {
      setIsAdmin(false);
    } else {
      setIsAdmin(Boolean(data));
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    const supabase = getSupabase();
    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      if (!active) return;
      setSession(sessionData.session);
      if (sessionData.session) {
        const { data: setupData } = await supabase.rpc("admin_setup_available");
        if (!active) return;
        setSetupAvailable(Boolean(setupData));
      }
      void refreshAdminStatus(sessionData.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession) {
        (async () => {
          const { data: setupData } = await supabase.rpc("admin_setup_available");
          if (active) setSetupAvailable(Boolean(setupData));
          await refreshAdminStatus(nextSession);
        })();
      } else {
        setSetupAvailable(false);
        void refreshAdminStatus(null);
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">Checking administrator access…</div>;
  }
  if (!session) {
    return <AdminLoginScreen setupAvailable={setupAvailable} onSignedIn={setSession} />;
  }
  if (!isAdmin) {
    return <AdminClaimScreen setupAvailable={setupAvailable} session={session} onClaimed={() => refreshAdminStatus(session)} />;
  }

  const value: AdminAccessContextValue = {
    session,
    refreshAdminStatus: async () => refreshAdminStatus(session),
  };
  return <AdminAccessContext.Provider value={value}>{children}</AdminAccessContext.Provider>;
}

export function useAdminAccess(): AdminAccessContextValue {
  const context = useContext(AdminAccessContext);
  if (!context) throw new Error("useAdminAccess must be used inside AdminGate.");
  return context;
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const { data, error } = await getSupabase()
    .from("admin_users")
    .select("user_id, email, display_name, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdminUser[];
}

export async function grantAdminByEmail(email: string): Promise<void> {
  const { error } = await getSupabase().rpc("grant_admin_by_email", { p_email: email });
  if (error) throw error;
}

export async function revokeAdmin(userId: string): Promise<void> {
  const { error } = await getSupabase().rpc("revoke_admin", { p_user_id: userId });
  if (error) throw error;
}

function AdminLoginScreen({
  setupAvailable,
  onSignedIn,
}: {
  setupAvailable: boolean;
  onSignedIn: (session: Session | null) => void;
}) {
  const [mode, setMode] = useState<"signIn" | "signUp">(setupAvailable ? "signUp" : "signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password || (mode === "signUp" && !name.trim())) {
      setError(mode === "signUp" ? "Enter your name, email, and password." : "Enter your email and password.");
      return;
    }
    if (
      mode === "signUp" &&
      (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    ) {
      setError("Use at least 8 characters with a letter, a number, and a special character.");
      return;
    }
    setBusy(true);
    try {
      const supabase = getSupabase();
      const result = mode === "signUp"
        ? await supabase.auth.signUp({ email: trimmedEmail, password, options: { data: { display_name: name.trim() } } })
        : await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      if (result.error) throw result.error;
      if (!result.data.session) {
        setError("Account created. Check your email before signing in.");
      } else {
        onSignedIn(result.data.session);
      }
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message.toLowerCase() : "";
      if (mode === "signUp" && (message.includes("weak") || message.includes("pwned") || message.includes("compromised"))) {
        setError("Choose a stronger password that has not been used elsewhere.");
      } else {
        setError(mode === "signUp" ? "Unable to create the administrator account." : "The email or password is incorrect.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto mt-12 w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
      <div className="mb-8 space-y-2">
        <ShieldCheck className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight">Administrator sign-in</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          This separate sign-in protects administration tools without changing the quick operator sign-in.
        </p>
      </div>
      <div className="space-y-4">
        {mode === "signUp" && (
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="admin-name">
            Name
            <Input id="admin-name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" autoFocus />
          </label>
        )}
        <label className="block space-y-1.5 text-sm font-medium" htmlFor="admin-email">
          Email address
          <Input id="admin-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoFocus={mode === "signIn"} />
        </label>
        <label className="block space-y-1.5 text-sm font-medium" htmlFor="admin-password">
          Password
          <Input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} autoComplete={mode === "signUp" ? "new-password" : "current-password"} />
          {mode === "signUp" && <span className="block text-xs font-normal text-muted-foreground">Use at least 8 characters with a letter, a number, and a special character.</span>}
        </label>
        {error && <p role="alert" className="rounded-md bg-status-error/10 px-3 py-2 text-sm font-medium text-status-error">{error}</p>}
        <Button className="w-full" onClick={() => void submit()} disabled={busy}>{busy ? "Please wait…" : mode === "signUp" ? "Create administrator account" : "Sign in"}</Button>
        {!setupAvailable && (
          <button type="button" className="w-full text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setError(null); }}>
            {mode === "signIn" ? "Create an administrator account" : "Back to administrator sign-in"}
          </button>
        )}
      </div>
    </section>
  );
}

function AdminClaimScreen({
  setupAvailable,
  session,
  onClaimed,
}: {
  setupAvailable: boolean;
  session: Session;
  onClaimed: () => Promise<void>;
}) {
  const [name, setName] = useState(session.user.user_metadata.display_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function claim() {
    setBusy(true);
    setError(null);
    const { error: claimError } = await getSupabase().rpc("claim_first_admin", { p_display_name: name.trim() });
    if (claimError) {
      setError(setupAvailable ? "Administrator setup is no longer available." : "This account does not have administrator access.");
    } else {
      await onClaimed();
    }
    setBusy(false);
  }

  return (
    <section className="mx-auto mt-12 w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
      <h1 className="text-2xl font-bold tracking-tight">Administrator access required</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {setupAvailable ? "This is the first administrator account. Confirm your name to enable administration." : "An existing administrator must grant access to this account."}
      </p>
      {setupAvailable && (
        <div className="mt-6 space-y-4">
          <label className="block space-y-1.5 text-sm font-medium" htmlFor="claim-admin-name">Name<Input id="claim-admin-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          {error && <p role="alert" className="rounded-md bg-status-error/10 px-3 py-2 text-sm font-medium text-status-error">{error}</p>}
          <Button className="w-full" onClick={() => void claim()} disabled={busy || !name.trim()}>{busy ? "Please wait…" : "Enable administration"}</Button>
        </div>
      )}
    </section>
  );
}
