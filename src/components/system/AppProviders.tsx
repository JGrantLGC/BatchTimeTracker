import { useEffect, useState, type ReactNode } from "react";
import { loadCatalogFromStorage } from "@/lib/material-catalog";
import { AuthProvider, useAuth } from "@/components/system/AuthProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AuthenticatedApp>{children}</AuthenticatedApp>
    </AuthProvider>
  );
}

function AuthenticatedApp({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCatalogFromStorage();
      } catch {
        // non-fatal: catalog may not exist yet
      }
      if (!cancelled) setReady(true);
    })();
    return () => { cancelled = true; };
  }, [user.id]);

  if (!ready) {
    return <div className="min-h-svh grid place-items-center p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}
