import { useEffect, useState, type ReactNode } from "react";
import { loadCatalogFromStorage } from "@/lib/material-catalog";
import { OperatorProvider, useOperator } from "@/components/system/OperatorProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <OperatorProvider>
      <ReadyApp>{children}</ReadyApp>
    </OperatorProvider>
  );
}

function ReadyApp({ children }: { children: ReactNode }) {
  const { operator } = useOperator();
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
  }, [operator.email]);

  if (!ready) {
    return <div className="min-h-svh grid place-items-center p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}
