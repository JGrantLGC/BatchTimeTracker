import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Filter, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MaterialBatchJobService } from "@/api/services/MaterialBatchJobService";
import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
import { formatHMS } from "@/lib/time-utils";
interface Filters {
  from?: string;
  to?: string;
  material?: string;
  description?: string;
  batch?: string;
  status?: string;
  operator?: string;
  department?: string;
  runningOnly?: boolean;
  endedOnly?: boolean;
}
export default function ReportsPage() {
  const [filters, setFilters] = useState<Filters>({});
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
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filters.material && !j.MaterialNumber.toLowerCase().includes(filters.material.toLowerCase())) return false;
      if (filters.description && !(j.MaterialDescription ?? "").toLowerCase().includes(filters.description.toLowerCase())) return false;
      if (filters.batch && !j.BatchNumber.toLowerCase().includes(filters.batch.toLowerCase())) return false;
      if (filters.status && j.JobStatus !== filters.status) return false;
      if (filters.operator && !(j.LastOperatorName ?? j.LastOperatorEmail ?? "").toLowerCase().includes(filters.operator.toLowerCase())) return false;
      if (filters.runningOnly && j.JobStatus !== "Running") return false;
      if (filters.endedOnly && j.JobStatus !== "Ended") return false;
      if (filters.from) {
        const fromMs = new Date(filters.from).getTime();
        const modMs = new Date(j.Modified ?? j.Created ?? 0).getTime();
        if (modMs < fromMs) return false;
      }
      if (filters.to) {
        const toMs = new Date(filters.to).getTime() + 24 * 3600 * 1000;
        const modMs = new Date(j.Modified ?? j.Created ?? 0).getTime();
        if (modMs > toMs) return false;
      }
      return true;
    });
  }, [jobs, filters]);
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (filters.material && !s.MaterialNumber.toLowerCase().includes(filters.material.toLowerCase())) return false;
      if (filters.batch && !s.BatchNumber.toLowerCase().includes(filters.batch.toLowerCase())) return false;
      if (filters.operator && !(s.OperatorName ?? s.OperatorEmail ?? "").toLowerCase().includes(filters.operator.toLowerCase())) return false;
      if (filters.department && s.Department !== filters.department) return false;
      if (filters.runningOnly && s.SessionStatus !== "Running") return false;
      if (filters.from) {
        const fromMs = new Date(filters.from).getTime();
        const stMs = new Date(s.StartTime).getTime();
        if (stMs < fromMs) return false;
      }
      if (filters.to) {
        const toMs = new Date(filters.to).getTime() + 24 * 3600 * 1000;
        const stMs = new Date(s.StartTime).getTime();
        if (stMs > toMs) return false;
      }
      return true;
    });
  }, [sessions, filters]);
  // Aggregates
  const totalByMatBatch = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of filteredJobs) {
      const key = `${j.MaterialNumber} / ${j.BatchNumber}`;
      m.set(key, (m.get(key) ?? 0) + (j.TotalSeconds ?? 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredJobs]);
  const totalByMaterial = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of filteredJobs) {
      m.set(j.MaterialNumber, (m.get(j.MaterialNumber) ?? 0) + (j.TotalSeconds ?? 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredJobs]);
  const totalByOperator = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of filteredSessions) {
      const key = s.OperatorName ?? s.OperatorEmail ?? "—";
      m.set(key, (m.get(key) ?? 0) + (s.DurationSeconds ?? 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredSessions]);
  const totalByDepartment = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of filteredSessions) {
      const key = s.Department ?? "Unassigned";
      m.set(key, (m.get(key) ?? 0) + (s.DurationSeconds ?? 0));
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredSessions]);
  const completedSessions = filteredSessions.filter((s) => s.SessionStatus === "ClosedByEnd").length;
  const runningJobs = filteredSessions.filter((s) => s.SessionStatus === "Running" || s.SessionStatus === "Paused").length;
  const uniqueMaterials = useMemo(() => {
    const m = new Set<string>();
    for (const j of filteredJobs) m.add(j.MaterialNumber);
    for (const s of filteredSessions) m.add(s.MaterialNumber);
    return m.size;
  }, [filteredJobs, filteredSessions]);
  const uniqueOperators = useMemo(() => {
    const m = new Set<string>();
    for (const s of filteredSessions) {
      const key = s.OperatorName ?? s.OperatorEmail ?? "";
      if (key) m.add(key);
    }
    return m.size;
  }, [filteredSessions]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm">
          Filter and view accumulated time. Not payroll, attendance, or performance data.
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm rounded-md border-2 border-status-stopped/40 bg-status-stopped/10 text-status-stopped px-3 py-2">
        <Info className="h-4 w-4" />
        <span>These totals are operational time capture. They must not be interpreted as payroll, attendance, or employee-performance measurements.</span>
      </div>
      {/* Filters */}
      <div className="rounded-lg border p-4 space-y-3 bg-card">
        <div className="flex items-center gap-2 font-semibold">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))} />
          </div>
          <div>
            <Label htmlFor="material">Material Number</Label>
            <Input id="material" onChange={(e) => setFilters((f) => ({ ...f, material: e.target.value || undefined }))} />
          </div>
          <div>
            <Label htmlFor="description">Material Description</Label>
            <Input id="description" onChange={(e) => setFilters((f) => ({ ...f, description: e.target.value || undefined }))} />
          </div>
          <div>
            <Label htmlFor="batch">Batch Number</Label>
            <Input id="batch" onChange={(e) => setFilters((f) => ({ ...f, batch: e.target.value || undefined }))} />
          </div>
          <div>
            <Label htmlFor="operator">Operator</Label>
            <Input id="operator" onChange={(e) => setFilters((f) => ({ ...f, operator: e.target.value || undefined }))} />
          </div>
          <div>
            <Label htmlFor="department">Department</Label>
            <select
              id="department"
              className="border rounded-md h-10 px-2 w-full bg-transparent"
              onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value || undefined }))}
              defaultValue=""
            >
              <option value="">Any</option>
              <option value="filling">Filling</option>
              <option value="kitting">Kitting</option>
              <option value="lab operations">Lab Operations</option>
              <option value="bioprocessing">Bioprocessing</option>
            </select>
          </div>
          <div>
            <Label htmlFor="status">Job Status</Label>
            <select
              id="status"
              className="border rounded-md h-10 px-2 w-full bg-transparent"
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
              defaultValue=""
            >
              <option value="">Any</option>
              <option value="New">New</option>
              <option value="Running">Running</option>
              <option value="Stopped">Stopped</option>
              <option value="Ended">Ended</option>
            </select>
          </div>
          <div className="flex items-end gap-4">
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" onChange={(e) => setFilters((f) => ({ ...f, runningOnly: e.target.checked }))} />
              Running only
            </label>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" onChange={(e) => setFilters((f) => ({ ...f, endedOnly: e.target.checked }))} />
              Ended only
            </label>
          </div>
        </div>
      </div>
      {/* Totals */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <SummaryCard label="Completed Sessions" value={String(completedSessions)} />
        <SummaryCard label="Running Jobs" value={String(runningJobs)} />
        <SummaryCard label="Materials" value={String(uniqueMaterials)} />
        <SummaryCard label="Operators" value={String(uniqueOperators)} />
      </div>
      <Tabs defaultValue="matbatch">
        <TabsList>
          <TabsTrigger value="matbatch">Time by Material + Batch</TabsTrigger>
          <TabsTrigger value="material">Time by Material</TabsTrigger>
          <TabsTrigger value="operator">Time by Operator</TabsTrigger>
          <TabsTrigger value="department">Time by Department</TabsTrigger>
        </TabsList>
        <TabsContent value="matbatch">
          <AggTable header="Material / Batch" rows={totalByMatBatch} />
        </TabsContent>
        <TabsContent value="material">
          <AggTable header="Material" rows={totalByMaterial} />
        </TabsContent>
        <TabsContent value="operator">
          <AggTable header="Operator" rows={totalByOperator} />
        </TabsContent>
        <TabsContent value="department">
          <AggTable header="Department" rows={totalByDepartment} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4 bg-card">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
function AggTable({ header, rows }: { header: string; rows: [string, number][] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-3 py-2">{header}</th>
            <th className="text-left px-3 py-2">Total Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t">
              <td className="px-3 py-2 font-mono">{k}</td>
              <td className="px-3 py-2 font-mono">{formatHMS(v)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={2} className="text-center px-3 py-6 text-muted-foreground">
                No data.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
