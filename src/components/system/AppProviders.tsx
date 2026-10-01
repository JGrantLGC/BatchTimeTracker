import { useEffect, useState, type ReactNode } from "react";
import { loadCatalogFromStorage } from "@/lib/material-catalog";

export function AppProviders({ children }: { children: ReactNode }) {
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
  }, []);

  if (!ready) {
    return <div className="p-4 text-sm text-muted-foreground">Loading…</div>;
  }
  return <>{children}</>;
}
