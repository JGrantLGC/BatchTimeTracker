/**
 * Fast-path importer — single atomic snapshot write.
 * Diff counters are computed for progress reporting but the actual
 * "write" is a single replaceCatalog call, followed by persistence
 * to the admin-selected data source.
 */
 import {
  getCatalogSnapshot,
  replaceCatalog,
  rowsToCatalogEntries,
  persistCatalogToStorage,
  type MaterialCatalogEntry,
} from "@/lib/material-catalog";
import {
  PLANT_1200_MATERIAL_MASTER,
  type PlantMaterialRow,
} from "@/data/plant-1200-material-master";
export interface ImportProgress {
  totalSource: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
  errors: number;
}
export interface ImportResult extends ImportProgress {
  errorMessages: string[];
  elapsedMs: number;
  revision: number;
}
export interface ImportOptions {
  source?: PlantMaterialRow[];
  sourceLabel?: string;
  onProgress?: (p: ImportProgress) => void;
}
export async function importPlant1200MaterialMaster(
  onProgressOrOptions?: ((p: ImportProgress) => void) | ImportOptions,
): Promise<ImportResult> {
  const options: ImportOptions =
    typeof onProgressOrOptions === "function"
      ? { onProgress: onProgressOrOptions }
      : onProgressOrOptions ?? {};
  const source = options.source ?? PLANT_1200_MATERIAL_MASTER;
  const sourceLabel = options.sourceLabel ?? "Plant 1200 (bundled)";
  const onProgress = options.onProgress;
  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  const progress: ImportProgress = {
    totalSource: source.length,
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    deleted: 0,
    errors: 0,
  };
  const previous = getCatalogSnapshot();
  const previousIndex = new Map<string, MaterialCatalogEntry>();
  if (previous) {
    for (const e of previous.entries) previousIndex.set(e.materialNumber, e);
  }
  const nextEntries = rowsToCatalogEntries(source);
  const nextKeys = new Set(nextEntries.map((e) => e.materialNumber));
  for (const entry of nextEntries) {
    const prev = previousIndex.get(entry.materialNumber);
    if (!prev) progress.created++;
    else if (differs(prev, entry)) progress.updated++;
    else progress.skipped++;
    progress.processed++;
    if (progress.processed % 250 === 0) onProgress?.({ ...progress });
  }
  for (const prev of previousIndex.values()) {
    if (!nextKeys.has(prev.materialNumber)) progress.deleted++;
  }
  const snapshot = replaceCatalog(nextEntries, sourceLabel);
  await persistCatalogToStorage();
  onProgress?.({ ...progress });
  const endedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    ...progress,
    errorMessages: [],
    elapsedMs: Math.round(endedAt - startedAt),
    revision: snapshot.revision,
  };
}
function differs(a: MaterialCatalogEntry, b: MaterialCatalogEntry): boolean {
  return (
    a.materialDescription !== b.materialDescription ||
    a.materialStatus !== b.materialStatus ||
    (a.baseUOM ?? "") !== (b.baseUOM ?? "") ||
    (a.plant ?? "") !== (b.plant ?? "") ||
    (a.lastSAPRefresh ?? "") !== (b.lastSAPRefresh ?? "")
  );
}
