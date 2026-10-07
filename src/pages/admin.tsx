import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  UserPlus,
  UserMinus,
  KeyRound,
  Gauge,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/operator/StatusBadge";
import { SessionEditDialog, type EditMode } from "@/components/operator/SessionEditDialog";
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
  DEPARTMENTS,
  type Department,
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
import {
  grantAdminByEmail,
  listAdminUsers,
  revokeAdmin,
  useAdminAccess,
  type AdminUser,
} from "@/components/system/AdminAccess";
import { isSupabaseConfigured, getSupabase, getSupabaseOrNull, getCustomDbConfig, setCustomDbConfig, testCustomDbConnection } from "@/lib/supabase-client";
import { saveSettingsToSupabase } from "@/lib/settings-sync";

interface OperatorRecord {
  id: string;
  name: string;
  department: string;
}
export default function AdminPage() {
  const queryClient = useQueryClient();
  const { session, refreshAdminStatus } = useAdminAccess();
  const [search, setSearch] = useState("");
  const [delimiter, setDelim] = useState(getBarcodeDelimiter());
  const [authorized, setAuthorized] = useState(getAuthorizedUsers().join(", "));
  const [dataSource, setDataSource] = useState<DataSourceType>(getDataSourceType());
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
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
    if (!q) return [];
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
  const supabaseReady = isSupabaseConfigured();
  const [customDbUrl, setCustomDbUrl] = useState(getCustomDbConfig().url);
  const [customDbKey, setCustomDbKey] = useState(getCustomDbConfig().anonKey);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [operatorRecords, setOperatorRecords] = useState<OperatorRecord[]>([]);
  const [operatorMessage, setOperatorMessage] = useState<string | null>(null);
  const [operatorSearch, setOperatorSearch] = useState("");
  const [editMode, setEditMode] = useState<EditMode>("edit");
  const [editSession, setEditSession] = useState<MaterialBatchSession | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  useEffect(() => {
    if (!supabaseReady) return;
    listAdminUsers().then(setAdminUsers).catch(() => setAdminMessage("Unable to load administrator accounts."));
  }, [supabaseReady]);
  useEffect(() => {
    if (!supabaseReady) return;
    loadOperatorRecords();
  }, [supabaseReady]);

  const editSessionMutation = useMutation({
    mutationFn: async (vars: { id: string; durationSeconds: number }) => {
      await MaterialBatchSessionService.update(vars.id, {
        DurationSeconds: vars.durationSeconds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      await MaterialBatchSessionService.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
    },
  });

  async function loadOperatorRecords() {
    const sb = getSupabaseOrNull();
    if (!sb) return;
    const { data, error } = await sb
      .from("operators")
      .select("id, name, department")
      .order("name", { ascending: true });
    if (error) {
      setOperatorMessage("Unable to load operator records.");
      return;
    }
    setOperatorRecords((data ?? []) as OperatorRecord[]);
    setOperatorMessage(null);
  }

  async function updateOperatorDepartment(id: string, name: string, newDept: Department) {
    const sb = getSupabaseOrNull();
    if (!sb) return;
    setOperatorMessage(null);
    const { error } = await sb
      .from("operators")
      .update({ department: newDept, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setOperatorMessage("Failed to update operator department.");
      return;
    }
    await loadOperatorRecords();
    setOperatorMessage(`Updated ${name}'s department to ${newDept}.`);
  }
  async function addAdministrator() {
    setAdminMessage(null);
    try {
      await grantAdminByEmail(newAdminEmail);
      setNewAdminEmail("");
      setAdminUsers(await listAdminUsers());
      setAdminMessage("Administrator access granted.");
    } catch {
      setAdminMessage("That account could not be granted administrator access. Make sure it has signed up first.");
    }
  }
  async function changePassword() {
    setPasswordMessage(null);
    if (
      newPassword.length < 8 ||
      !/[A-Za-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setPasswordMessage("Use at least 8 characters with a letter, a number, and a special character.");
      return;
    }
    setPasswordBusy(true);
    try {
      const { error } = await getSupabase().auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setPasswordMessage("Password updated successfully.");
    } catch (cause: unknown) {
      const message = cause instanceof Error ? cause.message : "";
      setPasswordMessage(message || "Unable to change password. Please try again.");
    } finally {
      setPasswordBusy(false);
    }
  }
  async function removeAdministrator(userId: string) {
    setAdminMessage(null);
    try {
      await revokeAdmin(userId);
      setAdminUsers(await listAdminUsers());
      await refreshAdminStatus();
      setAdminMessage("Administrator access removed.");
    } catch {
      setAdminMessage("You cannot remove your own administrator access.");
    }
  }
  async function testConnection() {
    setTestStatus(null);
    setTesting(true);
    const result = await testCustomDbConnection(customDbUrl, customDbKey);
    setTestStatus(result);
    setTesting(false);
  }
  async function saveSettings() {
    setSettingsMessage(null);
    setBarcodeDelimiter(delimiter || " ");
    setAuthorizedUsers(
      authorized
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (customDbUrl.trim() && customDbKey.trim()) {
      setCustomDbConfig(customDbUrl, customDbKey);
    }
    const previousDataSource = getDataSourceType();
    const savedDataSource =
      dataSource === "custom" && (!customDbUrl.trim() || !customDbKey.trim())
        ? "supabase"
        : dataSource;
    setDataSourceType(savedDataSource);
    if (savedDataSource !== previousDataSource) {
      loadCatalogFromStorage().then(() => {
        queryClient.invalidateQueries({ queryKey: ["materialCatalog"] });
        queryClient.invalidateQueries({ queryKey: ["jobs"] });
        queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
      });
    }
    try {
      const adminEmail = session?.user?.email ?? undefined;
      await saveSettingsToSupabase(adminEmail);
      setSettingsMessage("Settings saved and synced to the cloud database.");
    } catch (e: unknown) {
      setSettingsMessage(
        e instanceof Error
          ? `Settings saved locally, but cloud sync failed: ${e.message}`
          : "Settings saved locally, but cloud sync failed.",
      );
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
      <Link
        to="/utilization-settings"
        className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
      >
        <Gauge className="h-5 w-5 text-brand-lead" />
        <span>Configure Utilization Dashboard settings — target rate, monthly hours, and business day calendar</span>
      </Link>
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
                      {search.trim() ? "No matches." : "Search for a material number or description above."}
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
          <SessionsTable
            sessions={sessions}
            onEdit={(s) => { setEditMode("edit"); setEditSession(s); setEditOpen(true); }}
            onAdd={(s) => { setEditMode("add"); setEditSession(s); setEditOpen(true); }}
            onDelete={(s) => { setEditMode("delete"); setEditSession(s); setEditOpen(true); }}
          />
        </TabsContent>
        {/* ORPHANS */}
        <TabsContent value="orphans" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Sessions with missing StopTime that are not currently Running (should be zero).
          </p>
          <SessionsTable
            sessions={orphanSessions}
            onEdit={(s) => { setEditMode("edit"); setEditSession(s); setEditOpen(true); }}
            onAdd={(s) => { setEditMode("add"); setEditSession(s); setEditOpen(true); }}
            onDelete={(s) => { setEditMode("delete"); setEditSession(s); setEditOpen(true); }}
          />
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
              <option value="">Select a data source…</option>
              {supabaseReady && <option value="supabase">Cloud Database (Supabase) — shared across all devices</option>}
              <option value="custom">Custom Database — connect to another Supabase-compatible database</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Choose where job, session, and material catalog data is stored. Cloud Database
              persists across devices and browsers. Custom Database lets you point to another
              Supabase-compatible database by entering its URL and API key below.
              {!supabaseReady && " Cloud Database is not available — no database is configured for this deployment."}
            </p>
          </div>
          {dataSource === "custom" && (
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-semibold">Custom Database Connection</h2>
              <p className="text-sm text-muted-foreground">
                Enter the database URL and API key for another Supabase-compatible database. The database must have the same table structure (batch_jobs, batch_sessions, material_catalog_snapshot).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-db-url">Database URL</Label>
              <Input
                id="custom-db-url"
                value={customDbUrl}
                onChange={(e) => { setCustomDbUrl(e.target.value); setTestStatus(null); }}
                placeholder="https://your-project.supabase.co"
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-db-key">API Key (anon key)</Label>
              <Input
                id="custom-db-key"
                type="password"
                value={customDbKey}
                onChange={(e) => { setCustomDbKey(e.target.value); setTestStatus(null); }}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="font-mono"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void testConnection()} disabled={testing || !customDbUrl.trim() || !customDbKey.trim()}>
                {testing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}
                {testing ? "Testing…" : "Test Connection"}
              </Button>
              {testStatus && (
                <p className={`text-sm font-medium ${testStatus.ok ? "text-status-running" : "text-status-error"}`}>
                  {testStatus.message}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Click Test Connection to verify the database is reachable before saving. The credentials are stored in this browser only.
            </p>
          </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="delim">Barcode Delimiter</Label>
            <Input
              id="delim"
              value={delimiter}
              onChange={(e) => setDelim(e.target.value)}
              placeholder=" "
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
          {supabaseReady && (
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-semibold">Operator departments</h2>
              <p className="text-sm text-muted-foreground">
                View and change the department assigned to each operator. Departments are used to filter sessions in reports.
              </p>
            </div>
            <Input
              placeholder="Search operator name…"
              value={operatorSearch}
              onChange={(e) => setOperatorSearch(e.target.value)}
              className="max-w-sm"
            />
            <div className="divide-y rounded-md border max-h-72 overflow-y-auto">
              {operatorRecords
                .filter((op) => op.name.toLowerCase().includes(operatorSearch.trim().toLowerCase()))
                .map((op) => (
                  <div key={op.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-0 flex-1 truncate font-medium">{op.name}</div>
                    <select
                      value={op.department}
                      onChange={(e) => void updateOperatorDepartment(op.id, op.name, e.target.value as Department)}
                      className="border rounded-md h-9 px-2 text-sm bg-transparent"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d.charAt(0).toUpperCase() + d.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              {operatorRecords.filter((op) => op.name.toLowerCase().includes(operatorSearch.trim().toLowerCase())).length === 0 && (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No operators found.
                </div>
              )}
            </div>
            {operatorMessage && <p role="status" className="text-sm text-muted-foreground">{operatorMessage}</p>}
          </div>
          )}
          {supabaseReady && (
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-semibold">Administrator access</h2>
              <p className="text-sm text-muted-foreground">
                Add accounts that have already signed up, or remove access from someone who no longer needs it.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="email"
                value={newAdminEmail}
                onChange={(event) => setNewAdminEmail(event.target.value)}
                placeholder="administrator@example.com"
                aria-label="New administrator email"
              />
              <Button onClick={() => void addAdministrator()} disabled={!newAdminEmail.trim()}>
                <UserPlus className="mr-1 h-4 w-4" />
                Grant access
              </Button>
            </div>
            <div className="divide-y rounded-md border">
              {adminUsers.map((admin) => (
                <div key={admin.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{admin.display_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{admin.email}</div>
                  </div>
                  {admin.user_id !== session?.user.id && (
                    <Button variant="outline" size="sm" onClick={() => void removeAdministrator(admin.user_id)}>
                      <UserMinus className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {adminMessage && <p role="status" className="text-sm text-muted-foreground">{adminMessage}</p>}
          </div>
          )}
          {supabaseReady && (
          <div className="space-y-3 rounded-lg border p-4">
            <div>
              <h2 className="font-semibold">Change your password</h2>
              <p className="text-sm text-muted-foreground">
                Update the password for your administrator account ({session?.user.email}).
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                aria-label="New password"
                onKeyDown={(event) => { if (event.key === "Enter") void changePassword(); }}
              />
              <Button onClick={() => void changePassword()} disabled={passwordBusy || !newPassword}>
                <KeyRound className="mr-1 h-4 w-4" />
                {passwordBusy ? "Updating…" : "Change password"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use at least 8 characters with a letter, a number, and a special character.
            </p>
            {passwordMessage && (
              <p role="status" className="text-sm text-muted-foreground">{passwordMessage}</p>
            )}
          </div>
          )}
          <div className="space-y-2">
            <Button onClick={() => void saveSettings()}>
              <Save className="h-4 w-4 mr-1" />
              Save Settings
            </Button>
            {settingsMessage && (
              <p role="status" className="text-sm text-muted-foreground">{settingsMessage}</p>
            )}
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
      {/* Session edit / add / delete dialog */}
      <SessionEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode={editMode}
        session={editSession}
        onConfirm={async (patch) => {
          if (!editSession) return;
          if (editMode === "delete") {
            deleteSessionMutation.mutate(editSession.ID);
          } else if (patch.durationSeconds !== undefined) {
            editSessionMutation.mutate({ id: editSession.ID, durationSeconds: patch.durationSeconds });
          }
          setEditOpen(false);
        }}
      />
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
function SessionsTable({ sessions, onEdit, onAdd, onDelete }: { sessions: MaterialBatchSession[]; onEdit: (s: MaterialBatchSession) => void; onAdd: (s: MaterialBatchSession) => void; onDelete: (s: MaterialBatchSession) => void; }) {
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
            <th className="text-right px-3 py-2">Actions</th>
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
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <button
                  type="button"
                  title="Edit session time"
                  onClick={() => onEdit(s)}
                  className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Add time to session"
                  onClick={() => onAdd(s)}
                  className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Delete session"
                  onClick={() => onDelete(s)}
                  className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-status-error hover:bg-status-error/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
          {sessions.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center px-3 py-6 text-muted-foreground">
                No sessions.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
