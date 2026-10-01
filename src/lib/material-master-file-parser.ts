/**
 * Material Master file parser.
 *
 * Accepts:
 *   - Native SAP ECC `.xlsx` export (read via src/lib/xlsx-reader.ts,
 *     no external libraries).
 *   - Delimited text: `.csv`, `.tsv`, `.txt` (auto-detects tab / comma /
 *     semicolon / pipe).
 *
 * Column matching is case-insensitive. Recognizes both the human-readable
 * SAP column headers and their technical field names.
 *
 * Filters to HALB + FERT material types only. Everything else is discarded
 * and counted as skipped.
 *
 * Duplicate materials (e.g. rows per valuation type) are merged, preferring
 * the row with the richest description and the most-recent Last Change date.
 * If ANY row for a material is Inactive, the merged entry is Inactive.
 */
 import type { PlantMaterialRow } from "@/data/plant-1200-material-master";
 import { excelSerialToDate, readXlsxFirstSheet } from "@/lib/xlsx-reader";
 const ALLOWED_TYPES = new Set(["HALB", "FERT"]);
 export interface ParsedMaterialMaster {
   rows: PlantMaterialRow[];
   totalLines: number;
   skippedByType: number;
   skippedMissing: number;
   duplicatesMerged: number;
   matchedColumns: string[];
   warnings: string[];
   formatLabel: string;
 }
 interface RawRow {
   materialNumber: string;
   materialDescription: string;
   materialType: string;
   baseUOM: string;
   plant: string;
   lastSAPRefresh: string;
   abc: string;
 }
 export async function parseMaterialMasterFile(
   file: File,
 ): Promise<ParsedMaterialMaster> {
   const name = (file.name || "").toLowerCase();
   const isXlsx =
     name.endsWith(".xlsx") ||
     file.type ===
       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
   if (isXlsx) return parseXlsx(file);
   const text = await file.text();
   return parseDelimitedText(text);
 }
 async function parseXlsx(file: File): Promise<ParsedMaterialMaster> {
   const sheet = await readXlsxFirstSheet(file);
   const rows = sheet.rows.filter((r) => r.some((c) => (c ?? "").trim() !== ""));
   return processRows(rows, "XLSX workbook");
 }
 function parseDelimitedText(text: string): ParsedMaterialMaster {
   const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
   if (lines.length === 0) {
     return {
       rows: [],
       totalLines: 0,
       skippedByType: 0,
       skippedMissing: 0,
       duplicatesMerged: 0,
       matchedColumns: [],
       warnings: ["File was empty."],
       formatLabel: "empty",
     };
   }
   const delimiter = detectDelimiter(lines[0]);
   const label = describeDelimiter(delimiter);
   const cells = lines.map((line) => splitDelimited(line, delimiter));
   return processRows(cells, `Delimited (${label})`);
 }
 function detectDelimiter(headerLine: string): string {
   const candidates = ["\t", ",", ";", "|"];
   let best = ",";
   let bestCount = -1;
   for (const c of candidates) {
     const count = headerLine.split(c).length;
     if (count > bestCount) {
       bestCount = count;
       best = c;
     }
   }
   return best;
 }
 function describeDelimiter(d: string): string {
   if (d === "\t") return "tab";
   if (d === ",") return "comma";
   if (d === ";") return "semicolon";
   if (d === "|") return "pipe";
   return d;
 }
 function splitDelimited(line: string, delimiter: string): string[] {
   const out: string[] = [];
   let cur = "";
   let inQuotes = false;
   for (let i = 0; i < line.length; i++) {
     const ch = line[i];
     if (inQuotes) {
       if (ch === '"') {
         if (line[i + 1] === '"') {
           cur += '"';
           i++;
         } else {
           inQuotes = false;
         }
       } else {
         cur += ch;
       }
     } else {
       if (ch === delimiter) {
         out.push(cur);
         cur = "";
       } else if (ch === '"') {
         inQuotes = true;
       } else {
         cur += ch;
       }
     }
   }
   out.push(cur);
   return out;
 }
 function processRows(
   rows: string[][],
   formatLabel: string,
 ): ParsedMaterialMaster {
   const warnings: string[] = [];
   if (rows.length === 0) {
     return emptyResult(formatLabel, ["File contained no data."]);
   }
   const header = rows[0].map((h) => (h ?? "").trim());
   const columnMap = mapColumns(header);
   if (columnMap.materialNumber < 0 || columnMap.materialDescription < 0) {
     return emptyResult(
       formatLabel,
       [
         "Could not locate required 'Material' and 'Material Description' columns.",
       ],
     );
   }
   const matched: string[] = [];
   for (const [key, idx] of Object.entries(columnMap)) {
     if (typeof idx === "number" && idx >= 0) matched.push(`${key}=${header[idx] ?? "?"}`);
   }
   const rawRows: RawRow[] = [];
   let skippedByType = 0;
   let skippedMissing = 0;
   for (let i = 1; i < rows.length; i++) {
     const cells = rows[i];
     const materialNumber = safeCell(cells, columnMap.materialNumber);
     const materialDescription = safeCell(cells, columnMap.materialDescription);
     const materialType = safeCell(cells, columnMap.materialType).toUpperCase();
     if (!materialNumber || !materialDescription) {
       skippedMissing++;
       continue;
     }
     if (materialType && !ALLOWED_TYPES.has(materialType)) {
       skippedByType++;
       continue;
     }
     if (!materialType) {
       // No type column? we'll still consider it — but flag once.
       // (Some exports lack Material Type entirely.)
     }
     rawRows.push({
       materialNumber,
       materialDescription,
       materialType: materialType || "HALB",
       baseUOM: safeCell(cells, columnMap.baseUOM),
       plant: safeCell(cells, columnMap.plant) || "1200",
       lastSAPRefresh: normalizeDate(safeCell(cells, columnMap.lastChange)),
       abc: safeCell(cells, columnMap.abcIndicator).toUpperCase(),
     });
   }
   const { merged, duplicatesMerged } = mergeDuplicates(rawRows);
   const finalRows: PlantMaterialRow[] = merged.map((r) => ({
     materialNumber: r.materialNumber,
     materialDescription: r.materialDescription,
     materialType: r.materialType,
     materialStatus:
       r.abc === "O" || r.abc === "D" ? "Inactive" : "Active",
     baseUOM: r.baseUOM,
     plant: r.plant,
     lastSAPRefresh: r.lastSAPRefresh,
   }));
   if (duplicatesMerged > 0) {
     warnings.push(`${duplicatesMerged} duplicate material rows merged.`);
   }
   if (finalRows.length === 0) {
     warnings.push("No HALB or FERT rows were found in the file.");
   }
   return {
     rows: finalRows,
     totalLines: rows.length - 1,
     skippedByType,
     skippedMissing,
     duplicatesMerged,
     matchedColumns: matched,
     warnings,
     formatLabel,
   };
 }
 function emptyResult(
   formatLabel: string,
   warnings: string[],
 ): ParsedMaterialMaster {
   return {
     rows: [],
     totalLines: 0,
     skippedByType: 0,
     skippedMissing: 0,
     duplicatesMerged: 0,
     matchedColumns: [],
     warnings,
     formatLabel,
   };
 }
 interface ColumnMap {
   materialNumber: number;
   materialDescription: number;
   materialType: number;
   baseUOM: number;
   plant: number;
   lastChange: number;
   abcIndicator: number;
 }
 function mapColumns(header: string[]): ColumnMap {
   const map: ColumnMap = {
     materialNumber: -1,
     materialDescription: -1,
     materialType: -1,
     baseUOM: -1,
     plant: -1,
     lastChange: -1,
     abcIndicator: -1,
   };
   const norm = header.map((h) => (h ?? "").trim().toLowerCase());
   const match = (candidates: string[]): number => {
     for (const c of candidates) {
       const idx = norm.indexOf(c);
       if (idx >= 0) return idx;
     }
     // partial match fallback
     for (let i = 0; i < norm.length; i++) {
       for (const c of candidates) {
         if (norm[i].includes(c)) return i;
       }
     }
     return -1;
   };
   map.materialNumber = match(["material", "matnr", "material number"]);
   map.materialDescription = match([
     "material description",
     "description",
     "maktx",
   ]);
   map.materialType = match(["material type", "mtart", "type"]);
   map.baseUOM = match([
     "base unit of measure",
     "base uom",
     "meins",
     "uom",
     "unit",
   ]);
   map.plant = match(["plant", "werks"]);
   map.lastChange = match(["last change", "laeda", "last changed", "changed on"]);
   map.abcIndicator = match(["abc indicator", "maabc", "abc", "status"]);
   return map;
 }
 function safeCell(cells: string[], idx: number): string {
   if (idx < 0 || idx >= cells.length) return "";
   return (cells[idx] ?? "").trim();
 }
 function normalizeDate(input: string): string {
   if (!input) return "";
   const asNum = Number(input);
   if (isFinite(asNum) && asNum > 10000) {
     const d = excelSerialToDate(asNum);
     if (d) return d.toISOString();
   }
   // MM/DD/YYYY
   const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(input);
   if (mmddyyyy) {
     const [, m, d, y] = mmddyyyy;
     const dt = new Date(
       Number(y),
       Number(m) - 1,
       Number(d),
     );
     if (!isNaN(dt.getTime())) return dt.toISOString();
   }
   // DD.MM.YYYY
   const ddmmyyyy = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(input);
   if (ddmmyyyy) {
     const [, d, m, y] = ddmmyyyy;
     const dt = new Date(Number(y), Number(m) - 1, Number(d));
     if (!isNaN(dt.getTime())) return dt.toISOString();
   }
   // YYYY-MM-DD (ISO-ish)
   const iso = new Date(input);
   if (!isNaN(iso.getTime())) return iso.toISOString();
   return "";
 }
 function mergeDuplicates(rows: RawRow[]): {
   merged: RawRow[];
   duplicatesMerged: number;
 } {
   const map = new Map<string, RawRow>();
   let duplicatesMerged = 0;
   for (const r of rows) {
     const key = r.materialNumber;
     const prev = map.get(key);
     if (!prev) {
       map.set(key, r);
       continue;
     }
     duplicatesMerged++;
     // Prefer richer description
     const bestDesc =
       r.materialDescription.length > prev.materialDescription.length
         ? r.materialDescription
         : prev.materialDescription;
     // Prefer more-recent Last Change date
     const bestDate = laterDateIso(prev.lastSAPRefresh, r.lastSAPRefresh);
     // If either is Inactive, keep Inactive
     const bestAbc =
       prev.abc === "O" || prev.abc === "D" || r.abc === "O" || r.abc === "D"
         ? prev.abc === "O" || prev.abc === "D"
           ? prev.abc
           : r.abc
         : prev.abc || r.abc;
     map.set(key, {
       materialNumber: prev.materialNumber,
       materialDescription: bestDesc,
       materialType: prev.materialType || r.materialType,
       baseUOM: prev.baseUOM || r.baseUOM,
       plant: prev.plant || r.plant,
       lastSAPRefresh: bestDate,
       abc: bestAbc,
     });
   }
   return { merged: Array.from(map.values()), duplicatesMerged };
 }
 function laterDateIso(a: string, b: string): string {
   if (!a) return b;
   if (!b) return a;
   const ta = new Date(a).getTime();
   const tb = new Date(b).getTime();
   if (!isFinite(ta)) return b;
   if (!isFinite(tb)) return a;
   return ta >= tb ? a : b;
 }
 
 