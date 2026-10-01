import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase-client";
import { setCurrentOperator } from "@/lib/app-context";

interface AuthContextValue {
  user: User;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getUserName(user: User): string {
  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const name = metadata?.full_name ?? metadata?.name ?? metadata?.display_name;
  return typeof name === "string" && name.trim() ? name.trim() : user.email ?? "Operator";
}

function syncOperator(user: User): void {
  setCurrentOperator({
    name: getUserName(user),
    email: user.email ?? "",
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError) setError(sessionError.message);
      if (data.session?.user) {
        syncOperator(data.session.user);
        setUser(data.session.user);
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        return;
      }
      if (session?.user) {
        syncOperator(session.user);
        setUser(session.user);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue | null>(() => {
    if (!user) return null;
    return {
      user,
      signOut: async () => {
        const { error: signOutError } = await getSupabase().auth.signOut();
        if (signOutError) throw signOutError;
      },
    };
  }, [user]);

  if (loading) {
    return <div className="min-h-svh grid place-items-center p-6 text-sm text-muted-foreground">Checking sign-in…</div>;
  }

  if (!user || !value) {
    return <SignInScreen error={error} onError={setError} />;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function SignInScreen({
  error,
  onError,
}: {
  error: string | null;
  onError: (message: string | null) => void;
}) {
  const [signingIn, setSigningIn] = useState(false);

  async function signInWithMicrosoft() {
    setSigningIn(true);
    onError(null);
    const { error: signInError } = await getSupabase().auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: window.location.origin,
        scopes: "openid profile email",
      },
    });
    if (signInError) {
      onError(signInError.message);
      setSigningIn(false);
    }
  }

  return (
    <main className="min-h-svh grid place-items-center bg-muted/30 p-6">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Cumberland Manufacturing</p>
          <h1 className="text-2xl font-bold tracking-tight">Material-Batch Time Tracker</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Sign in with your company Microsoft account to continue. Your name and email will be recorded with each job session.
          </p>
        </div>
        {error && (
          <div role="alert" className="mb-4 rounded-md bg-status-error/10 px-3 py-2 text-sm font-medium text-status-error">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={signInWithMicrosoft}
          disabled={signingIn}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingIn ? "Opening Microsoft sign-in…" : "Continue with Microsoft Entra ID"}
        </button>
        <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
          Access is limited to accounts allowed by your organization’s Microsoft sign-in policy.
        </p>
      </section>
    </main>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
