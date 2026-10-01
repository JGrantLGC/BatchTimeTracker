/**
 * Material Master Catalog Cache ("Option 1A" storage model).
 *
 * The Plant 1200 material master is a read-only reference dataset.
 * Stored as a single JSON snapshot rather than per-row list items:
 *   - Import is a single atomic replace
 *   - Lookups are O(1) via a Map
 *   - No per-row throttling and no list-view-threshold risk
 */
 import type { PlantMaterialRow } from "@/data/plant-1200-material-master";
 import { memory } from "@/lib/memory-store";
 export interface MaterialCatalogEntry {
   materialNumber: string;
   materialDescription: string;
   materialStatus: "Active" | "Inactive";
   baseUOM?: string;
   plant?: string;
   lastSAPRefresh?: string;
 }
 export interface MaterialCatalogSnapshot {
   revision: number;
   importedAt: string;
   sourceLabel: string;
   entries: MaterialCatalogEntry[];
 }
 const CATALOG_KEY = "materialCatalog.snapshot";
 const INDEX_KEY = "materialCatalog.index";
 export function getCatalogSnapshot(): MaterialCatalogSnapshot | undefined {
   return memory.get<MaterialCatalogSnapshot>(CATALOG_KEY);
 }
 export function getCatalogIndex(): Map<string, MaterialCatalogEntry> {
   const cached = memory.get<Map<string, MaterialCatalogEntry>>(INDEX_KEY);
   if (cached) return cached;
   const snap = getCatalogSnapshot();
   if (!snap) return new Map();
   const idx = buildIndex(snap.entries);
   memory.put(INDEX_KEY, idx);
   return idx;
 }
 export function lookupMaterial(
   materialNumber: string,
 ): MaterialCatalogEntry | undefined {
   return getCatalogIndex().get(materialNumber);
 }
 export function getAllCatalogEntries(): MaterialCatalogEntry[] {
   const snap = getCatalogSnapshot();
   return snap ? snap.entries.slice() : [];
 }
 export function replaceCatalog(
   entries: MaterialCatalogEntry[],
   sourceLabel: string,
 ): MaterialCatalogSnapshot {
   const previous = getCatalogSnapshot();
   const snapshot: MaterialCatalogSnapshot = {
     revision: (previous?.revision ?? 0) + 1,
     importedAt: new Date().toISOString(),
     sourceLabel,
     entries: entries.map(normalizeEntry),
   };
   memory.put(CATALOG_KEY, snapshot);
   memory.put(INDEX_KEY, buildIndex(snapshot.entries));
   return snapshot;
 }
 export function rowsToCatalogEntries(
   rows: PlantMaterialRow[],
 ): MaterialCatalogEntry[] {
   return rows.map(normalizeEntry);
 }
 function normalizeEntry(
   row: PlantMaterialRow | MaterialCatalogEntry,
 ): MaterialCatalogEntry {
   const status = row.materialStatus === "Inactive" ? "Inactive" : "Active";
   return {
     materialNumber: row.materialNumber,
     materialDescription: row.materialDescription,
     materialStatus: status,
     baseUOM: row.baseUOM ?? "",
     plant: row.plant ?? "1200",
     lastSAPRefresh: row.lastSAPRefresh ?? "",
   };
 }
 function buildIndex(
   entries: MaterialCatalogEntry[],
 ): Map<string, MaterialCatalogEntry> {
   const idx = new Map<string, MaterialCatalogEntry>();
   for (const e of entries) idx.set(e.materialNumber, e);
   return idx;
 }
 