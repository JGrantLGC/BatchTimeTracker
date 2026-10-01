export type BarcodeParseResult =
  | { ok: true; materialNumber: string; batchNumber: string; jobKey: string; raw: string }
  | { ok: false; error: string; raw: string };
export function parseBarcode(raw: string, delimiter: string): BarcodeParseResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "Barcode is empty.", raw: trimmed };
  if (!delimiter) return { ok: false, error: "BarcodeDelimiter is not configured.", raw: trimmed };
  const parts = trimmed.split(delimiter);
  if (parts.length < 2) return { ok: false, error: `Missing delimiter "${delimiter}" in barcode.`, raw: trimmed };
  if (parts.length > 2) return { ok: false, error: `Barcode contains more than one delimiter "${delimiter}".`, raw: trimmed };
  const materialNumber = parts[0];
  const batchNumber = parts[1];
  if (!materialNumber) return { ok: false, error: "Material Number segment is blank.", raw: trimmed };
  if (!batchNumber) return { ok: false, error: "Batch Number segment is blank.", raw: trimmed };
  return {
    ok: true,
    materialNumber,
    batchNumber,
    jobKey: `${materialNumber}${delimiter}${batchNumber}`,
    raw: trimmed,
  };
}
