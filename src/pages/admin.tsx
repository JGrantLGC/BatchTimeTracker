import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Package,
  ListChecks,
  Timer,
  AlertOctagon,
  Users,
  Save,
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/operator/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAuthorizedUsers,
  getBarcodeDelimiter,
  setAuthorizedUsers,
  setBarcodeDelimiter,
  setLastSAPRefresh,
} from "@/lib/app-context";
import {
  getDataSourceType,
  setDataSourceType,
  type DataSourceType,
} from "@/lib/data-source";
import { loadCatalogFromStorage } from "@/lib/material-catalog";
import { formatDate, formatDateTime, formatHMS } from "@/lib/time-utils";
import { MaterialBatchJobService } from "@/api/services/MaterialBatchJobService";
import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
import type { MaterialBatchJob } from "@/api/models/MaterialBatchJob";
import type { MaterialBatchSession } from "@/api/models/MaterialBatchSession";
import {
  importPlant1200MaterialMaster,
  type ImportProgress,
  type ImportResult,
} from "@/lib/material-master-import";
import {
  parseMaterialMasterFile,
  type ParsedMaterialMaster,
} from "@/lib/material-master-file-parser";
import {
  getAllCatalogEntries,
  getCatalogSnapshot,
  type MaterialCatalogEntry,
} from "@/lib/material-catalog";
export default function AdminPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [delimiter, setDelim] = useState(getBarcodeDelimiter());
  const [authorized, setAuthorized] = useState(getAuthorizedUsers().join(", "));
  const [dataSource, setDataSource] = useState<DataSourceType>(getDataSourceType());
  // Material Master snapshot
  const catalogQuery = useQuery({
    queryKey: ["materialCatalog"],
    queryFn: async () => {
      const entries = getAllCatalogEntries();
      const snap = getCatalogSnapshot();
      return { entries, snapshot: snap };
    },
  });
  const materials = catalogQuery.data?.entries ?? [];
  const snapshot = catalogQuery.data?.snapshot;
  const jobsQuery = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => await MaterialBatchJobService.getAll(),
  });
  const sessionsQuery = useQuery({
    queryKey: ["sessions-all"],
    queryFn: async () => await MaterialBatchSessionService.getAll(),
  });
  const jobs = jobsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importParsed, setImportParsed] = useState<ParsedMaterialMaster | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importParseError, setImportParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials.slice(0, 300);
    return materials
      .filter(
        (m) =>
          m.materialNumber.toLowerCase().includes(q) ||
          (m.materialDescription ?? "").toLowerCase().includes(q),
      )
      .slice(0, 300);
  }, [materials, search]);
  const runningJobs = jobs.filter((j) => j.JobStatus === "Running");
  const stoppedJobs = jobs.filter((j) => j.JobStatus === "Stopped");
  const endedJobs = jobs.filter((j) => j.JobStatus === "Ended");
  const orphanSessions = sessions.filter(
    (s) => !s.StopTime && s.SessionStatus !== "Running",
  );
  function saveSettings() {
    setBarcodeDelimiter(delimiter || "|");
    setAuthorizedUsers(
      authorized
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (dataSource !== getDataSourceType()) {
      setDataSourceType(dataSource);
      loadCatalogFromStorage().then(() => {
        queryClient.invalidateQueries({ queryKey: ["materialCatalog"] });
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
      });
    }
  }
  function exportCSV(name: string, rows: object[]) {
    if (rows.length === 0) return;
    const keys = Object.keys(rows[0]);
    const header = keys.join(",");
    const csv = [
      header,
      ...rows.map((r) =>
        keys
          .map((k) => {
            const v = (r as Record<string, unknown>)[k];
            if (v == null) return "";
            const s = String(v).replace(/"/g, '""');
            return /[",\n]/.test(s) ? `"${s}"` : s;
          })
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  function resetImportState() {
    setImportFile(null);
    setImportParsed(null);
    setImportParsing(false);
    setImportParseError(null);
    setImporting(false);
    setImportProgress(null);
    setImportResult(null);
  }
  async function handleFileSelected(file: File | null) {
    if (!file) return;
    setImportFile(file);
    setImportParsed(null);
    setImportParseError(null);
    setImportResult(null);
    setImportProgress(null);
    setImportParsing(true);
    try {
      const parsed = await parseMaterialMasterFile(file);
      setImportParsed(parsed);
    } catch (e: unknown) {
      setImportParseError(e instanceof Error ? e.message : "Failed to parse file.");
    } finally {
      setImportParsing(false);
    }
  }
  async function runImport() {
    if (!importParsed || importParsed.rows.length === 0) return;
    setImporting(true);
    setImportResult(null);
    const label = importFile
      ? `${importFile.name} (${importParsed.rows.length} HALB+FERT rows)`
      : `Uploaded file (${importParsed.rows.length} rows)`;
    try {
      const result = await importPlant1200MaterialMaster({
        source: importParsed.rows,
        sourceLabel: label,
        onProgress: (p) => setImportProgress({ ...p }),
      });
      setImportResult(result);
      setLastSAPRefresh(new Date().toISOString());
      queryClient.invalidateQueries({ queryKey: ["materialCatalog"] });
      queryClient.invalidateQueries({ queryKey: ["sapRefresh"] });
    } finally {
      setImporting(false);
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Administration</h1>
        <p className="text-muted-foreground text-sm">
          Manage material master, jobs, sessions, and application settings.
        </p>
      </div>
      <Tabs defaultValue="materials">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="materials"><Package className="h-4 w-4 mr-1" /> Material Master</TabsTrigger>
          <TabsTrigger value="jobs"><ListChecks className="h-4 w-4 mr-1" /> Jobs</TabsTrigger>
          <TabsTrigger value="sessions"><Timer className="h-4 w-4 mr-1" /> Sessions</TabsTrigger>
          <TabsTrigger value="orphans"><AlertOctagon className="h-4 w-4 mr-1" /> Orphans</TabsTrigger>
          <TabsTrigger value="settings"><Users className="h-4 w-4 mr-1" /> Settings</TabsTrigger>
        </TabsList>
        {/* MATERIAL MASTER */}
        <TabsContent value="materials" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search MaterialNumber or Description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="text-xs text-muted-foreground">
                Snapshot rev {snapshot?.revision ?? 0} &bull; {snapshot?.entries.length ?? 0} materials &bull; {snapshot ? formatDateTime(snapshot.importedAt) : "—"}
              </div>
              <Button onClick={() => { resetImportState(); setImportOpen(true); }}>
                <Upload className="h-4 w-4 mr-1" />
                Import Plant 1200 MaterialMaster…
              </Button>
            </div>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2">Material Number</th>
                  <th className="text-left px-3 py-2">Description</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Plant</th>
                  <th className="text-left px-3 py-2">UOM</th>
                  <th className="text-left px-3 py-2">Last SAP Refresh</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map((m: MaterialCatalogEntry) => (
                  <tr key={m.materialNumber} className="border-t">
                    <td className="px-3 py-2 font-mono">{m.materialNumber}</td>
                    <td className="px-3 py-2">{m.materialDescription}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                          m.materialStatus === "Active"
                            ? "bg-status-running/15 text-status-running"
                            : "bg-status-error/10 text-status-error"
                        }`}
                      >
                        {m.materialStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2">{m.plant ?? "—"}</td>
                    <td className="px-3 py-2">{m.baseUOM ?? "—"}</td>
                    <td className="px-3 py-2">{m.lastSAPRefresh ? formatDate(m.lastSAPRefresh) : "—"}</td>
                  </tr>
                ))}
                {filteredMaterials.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center px-3 py-6 text-muted-foreground">
                      No matches.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
        {/* JOBS */}
        <TabsContent value="jobs" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => exportCSV("jobs.csv", jobs)}>
              <Download className="h-4 w-4 mr-1" /> Export Jobs CSV
            </Button>
          </div>
          <Tabs defaultValue="running">
            <TabsList>
              <TabsTrigger value="running">Running ({runningJobs.length})</TabsTrigger>
              <TabsTrigger value="stopped">Stopped ({stoppedJobs.length})</TabsTrigger>
              <TabsTrigger value="ended">Ended ({endedJobs.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="running"><JobsTable jobs={runningJobs} /></TabsContent>
            <TabsContent value="stopped"><JobsTable jobs={stoppedJobs} /></TabsContent>
            <TabsContent value="ended"><JobsTable jobs={endedJobs} /></TabsContent>
          </Tabs>
        </TabsContent>
        {/* SESSIONS */}
        <TabsContent value="sessions" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => exportCSV("sessions.csv", sessions)}>
              <Download className="h-4 w-4 mr-1" /> Export Sessions CSV
            </Button>
            <span className="text-xs text-muted-foreground">
              Showing {sessions.length} session(s).
            </span>
          </div>
          <SessionsTable sessions={sessions} />
        </TabsContent>
        {/* ORPHANS */}
        <TabsContent value="orphans" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sessions with missing StopTime that are not currently Running (should be zero).
          </p>
          <SessionsTable sessions={orphanSessions} />
        </TabsContent>
        {/* SETTINGS */}
        <TabsContent value="settings" className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="datasource">Data Source Location</Label>
            <select
              id="datasource"
              className="border rounded-md h-10 px-2 w-full bg-transparent"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value as DataSourceType)}
            >
              <option value="local">Browser (Local) — survives refreshes on this device</option>
              <option value="supabase">Cloud Database (Supabase) — shared across all devices</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Choose where job, session, and material catalog data is stored. Cloud Database
              persists across devices and browsers. Browser stores data locally on this device only.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delim">Barcode Delimiter</Label>
            <Input
              id="delim"
              value={delimiter}
              onChange={(e) => setDelim(e.target.value)}
              placeholder="|"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Splits MaterialNumber from BatchNumber. Default: <span className="font-mono">|</span>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth">Authorized Users (emails)</Label>
            <Input
              id="auth"
              value={authorized}
              onChange={(e) => setAuthorized(e.target.value)}
              placeholder="alice@lgcgroup.com, bob@lgcgroup.com"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Authorized users can Stop or End another operator's Running job.
            </p>
          </div>
          <div>
            <Button onClick={saveSettings}>
              <Save className="h-4 w-4 mr-1" />
              Save Settings
            </Button>
          </div>
        </TabsContent>
      </Tabs>
      {/* Import Plant 1200 MaterialMaster Dialog */}
      <Dialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) resetImportState();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Import Plant 1200 MaterialMaster
            </DialogTitle>
            <DialogDescription>
              Choose the native SAP ECC Plant 1200 <span className="font-mono">.xlsx</span> export
              — no conversion needed. Fast Sync (Option 1A) will replace the current
              catalog snapshot in a single atomic write. Rows that no longer meet
              HALB / FERT criteria will be removed from List 1.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border p-3 bg-muted/40 text-sm space-y-2">
              <div>
                <Label htmlFor="master-file" className="text-sm font-semibold">
                  Master file
                </Label>
                <Input
                  id="master-file"
                  type="file"
                  accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] ?? null)}
                  disabled={importing || importParsing}
                />
                {importFile && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Selected: <span className="font-mono">{importFile.name}</span> ({Math.round(importFile.size / 1024)} KB)
                  </p>
                )}
              </div>
              {importParsing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Parsing file…
                </div>
              )}
              {importParseError && (
                <div className="text-sm text-status-error font-semibold">
                  {importParseError}
                </div>
              )}
              {importParsed && (
                <div className="text-xs space-y-1">
                  <div>
                    Format: <span className="font-mono">{importParsed.formatLabel}</span>
                  </div>
                  <div>
                    HALB / FERT kept: <span className="font-bold">{importParsed.rows.length}</span>
                  </div>
                  <div>
                    Skipped by type: {importParsed.skippedByType}
                  </div>
                  <div>
                    Skipped for missing required fields: {importParsed.skippedMissing}
                  </div>
                  <div>
                    Duplicates merged: {importParsed.duplicatesMerged}
                  </div>
                  <div>
                    Matched columns: {importParsed.matchedColumns.join(", ") || "—"}
                  </div>
                  {importParsed.warnings.length > 0 && (
                    <div className="text-status-stopped">
                      {importParsed.warnings.join(" · ")}
                    </div>
                  )}
                </div>
              )}
            </div>
            {importProgress && (
              <div className="rounded-md border p-3 bg-muted/40 text-sm">
                <div className="flex items-center gap-2">
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-status-running" />
                  )}
                  <span>
                    {importProgress.processed}/{importProgress.totalSource} processed
                    &nbsp;•&nbsp; +{importProgress.created} new
                    &nbsp;•&nbsp; ~{importProgress.updated} updated
                    &nbsp;•&nbsp; ={importProgress.skipped} unchanged
                    &nbsp;•&nbsp; -{importProgress.deleted} deleted
                    &nbsp;•&nbsp; !{importProgress.errors} errors
                  </span>
                </div>
              </div>
            )}
            {importResult && (
              <div className="rounded-md border p-3 bg-status-running/10 text-sm">
                <div className="font-semibold text-status-running mb-1">
                  Import complete — {importResult.elapsedMs} ms (rev {importResult.revision})
                </div>
                <div>
                  Created {importResult.created} · Updated {importResult.updated} ·
                  Unchanged {importResult.skipped} · Deleted {importResult.deleted} ·
                  Errors {importResult.errors}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)} disabled={importing}>
              Close
            </Button>
            <Button
              onClick={runImport}
              disabled={!importParsed || importParsed.rows.length === 0 || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Import {importParsed ? importParsed.rows.length : 0} rows
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function JobsTable({ jobs }: { jobs: MaterialBatchJob[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2">JobKey</th>
            <th className="text-left px-3 py-2">Material</th>
            <th className="text-left px-3 py-2">Batch</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Total</th>
            <th className="text-left px-3 py-2">Last Operator</th>
            <th className="text-left px-3 py-2">Last Action</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.ID} className="border-t">
              <td className="px-3 py-2 font-mono">{j.JobKey}</td>
              <td className="px-3 py-2">
                <span className="font-mono">{j.MaterialNumber}</span>
                <div className="text-xs text-muted-foreground">
                  {j.MaterialDescription}
                </div>
              </td>
              <td className="px-3 py-2 font-mono">{j.BatchNumber}</td>
              <td className="px-3 py-2"><StatusBadge status={j.JobStatus} /></td>
              <td className="px-3 py-2 font-mono">{formatHMS(j.TotalSeconds ?? 0)}</td>
              <td className="px-3 py-2">{j.LastOperatorName ?? "—"}</td>
              <td className="px-3 py-2">{formatDateTime(j.LastActionTime)}</td>
            </tr>
          ))}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center px-3 py-6 text-muted-foreground">
                No jobs.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function SessionsTable({ sessions }: { sessions: MaterialBatchSession[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2">JobKey</th>
            <th className="text-left px-3 py-2">Material</th>
            <th className="text-left px-3 py-2">Batch</th>
            <th className="text-left px-3 py-2">Start</th>
            <th className="text-left px-3 py-2">Stop</th>
            <th className="text-left px-3 py-2">Duration</th>
            <th className="text-left px-3 py-2">Status</th>
            <th className="text-left px-3 py-2">Operator</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.ID} className="border-t">
              <td className="px-3 py-2 font-mono">{s.JobKey}</td>
              <td className="px-3 py-2 font-mono">{s.MaterialNumber}</td>
              <td className="px-3 py-2 font-mono">{s.BatchNumber}</td>
              <td className="px-3 py-2">{formatDateTime(s.StartTime)}</td>
              <td className="px-3 py-2">
                {s.SessionStatus === "Running" ? (
                  <span className="text-status-running font-semibold">Running</span>
                ) : (
                  formatDateTime(s.StopTime)
                )}
              </td>
              <td className="px-3 py-2 font-mono">
                {s.SessionStatus === "Running" ? "—" : formatHMS(s.DurationSeconds ?? 0)}
              </td>
              <td className="px-3 py-2">{s.SessionStatus}</td>
              <td className="px-3 py-2">{s.OperatorName ?? s.OperatorEmail ?? "—"}</td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center px-3 py-6 text-muted-foreground">
                No sessions.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
