/**
 * Minimal in-browser XLSX reader — no external libraries.
 * Uses the browser's DecompressionStream("deflate-raw") to inflate ZIP entries
 * and DOMParser to parse the sheet XML.
 */
 export interface XlsxSheet {
  rows: string[][];
}
export async function readXlsxFirstSheet(file: File | Blob): Promise<XlsxSheet> {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  const LFH_SIG = 0x04034b50;
  while (offset + 30 <= view.byteLength) {
    const sig = view.getUint32(offset, true);
    if (sig !== LFH_SIG) break;
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const nameBytes = bytes.subarray(nameStart, nameStart + fileNameLength);
    const name = new TextDecoder().decode(nameBytes);
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const compressed = bytes.subarray(dataStart, dataEnd);
    if (isNeededEntry(name)) {
      let uncompressed: Uint8Array;
      if (compressionMethod === 0) uncompressed = compressed.slice();
      else if (compressionMethod === 8)
        uncompressed = await inflateRaw(compressed, uncompressedSize);
      else throw new Error(`Unsupported compression method ${compressionMethod}`);
      entries.set(name, uncompressed);
    }
    offset = dataEnd;
  }
  const sheetXml = entries.get("xl/worksheets/sheet1.xml");
  if (!sheetXml) throw new Error("Could not find xl/worksheets/sheet1.xml");
  const sharedStringsXml = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  return { rows: parseSheetXml(sheetXml, sharedStrings) };
}
function isNeededEntry(name: string): boolean {
  return name === "xl/worksheets/sheet1.xml" || name === "xl/sharedStrings.xml";
}
async function inflateRaw(input: Uint8Array, _expectedSize: number): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(input);
      controller.close();
    },
  });
  const decompressed = stream.pipeThrough(new DecompressionStream("deflate-raw"));
  const arrayBuffer = await new Response(decompressed).arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
function parseSharedStrings(xmlBytes: Uint8Array): string[] {
  const text = new TextDecoder().decode(xmlBytes);
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const siNodes = Array.from(doc.getElementsByTagName("si"));
  return siNodes.map((si) => textOfStringItem(si));
}
function textOfStringItem(si: Element): string {
  const tNodes = Array.from(si.getElementsByTagName("t"));
  return tNodes.map((t) => t.textContent ?? "").join("");
}
function parseSheetXml(xmlBytes: Uint8Array, sharedStrings: string[]): string[][] {
  const text = new TextDecoder().decode(xmlBytes);
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const sheetData = doc.getElementsByTagName("sheetData")[0];
  if (!sheetData) return [];
  const rows: string[][] = [];
  const rowNodes = Array.from(sheetData.getElementsByTagName("row"));
  for (const rowNode of rowNodes) {
    const cellNodes = Array.from(rowNode.getElementsByTagName("c"));
    const cells: string[] = [];
    let lastCol = -1;
    for (const c of cellNodes) {
      const ref = c.getAttribute("r") ?? "";
      const colIndex = columnIndexFromRef(ref);
      while (lastCol + 1 < colIndex) {
        cells.push("");
        lastCol++;
      }
      cells.push(cellValue(c, sharedStrings));
      lastCol = colIndex;
    }
    rows.push(cells);
  }
  return rows;
}
function columnIndexFromRef(ref: string): number {
  let i = 0;
  let col = 0;
  while (i < ref.length && ref[i] >= "A" && ref[i] <= "Z") {
    col = col * 26 + (ref.charCodeAt(i) - 64);
    i++;
  }
  return col - 1;
}
function cellValue(c: Element, sharedStrings: string[]): string {
  const t = c.getAttribute("t");
  const valueNode = c.getElementsByTagName("v")[0];
  const isNode = c.getElementsByTagName("is")[0];
  if (t === "s") {
    const idx = Number(valueNode?.textContent ?? "-1");
    if (idx >= 0 && idx < sharedStrings.length) return sharedStrings[idx];
    return "";
  }
  if (t === "inlineStr") {
    if (!isNode) return "";
    const tNodes = Array.from(isNode.getElementsByTagName("t"));
    return tNodes.map((n) => n.textContent ?? "").join("");
  }
  if (t === "b") return valueNode?.textContent === "1" ? "TRUE" : "FALSE";
  return valueNode?.textContent ?? "";
}
export function excelSerialToDate(serial: number): Date | null {
  if (!isFinite(serial) || serial <= 0) return null;
  const utcDays = Math.floor(serial);
  const utcMs = (utcDays - 25569) * 86400 * 1000;
  const fracDay = serial - utcDays;
  const ms = utcMs + Math.round(fracDay * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d;
}
