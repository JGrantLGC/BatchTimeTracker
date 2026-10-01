import { getCatalogSnapshot } from "@/lib/material-catalog";
import { importPlant1200MaterialMaster } from "@/lib/material-master-import";
let inFlight: Promise<void> | null = null;
export function ensurePlant1200MaterialMasterSeeded(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const existing = getCatalogSnapshot();
      if (existing && existing.entries.length > 0) return;
      await importPlant1200MaterialMaster({
        sourceLabel: "Plant 1200 (bundled, initial seed)",
      });
    } catch {
      // Non-fatal
    }
  })();
  return inFlight;
}
