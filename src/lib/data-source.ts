import { getSupabase } from "@/lib/supabase-client";

export type DataSourceType = "local" | "supabase";

const DS_KEY = "lgc:dataSource";

export function getDataSourceType(): DataSourceType {
  const stored = localStorage.getItem(DS_KEY);
  return stored === "supabase" ? "supabase" : "local";
}

export function setDataSourceType(type: DataSourceType): void {
  localStorage.setItem(DS_KEY, type);
}

// ── Row types (shared between both backends) ──
export interface JobRow {
  ID: string;
  JobKey: string;
  RawBarcode: string;
  MaterialNumber: string;
  MaterialDescription?: string;
  BatchNumber: string;
  JobStatus: string;
  CurrentStartTime?: string;
  TotalSeconds?: number;
  EndedTime?: string;
  LastOperatorEmail?: string;
  LastOperatorName?: string;
  LastActionTime?: string;
  Created?: string;
  Modified?: string;
}

export interface SessionRow {
  ID: string;
  JobKey: string;
  JobID: string;
  MaterialNumber: string;
  MaterialDescription?: string;
  BatchNumber: string;
  StartTime: string;
  StopTime?: string;
  DurationSeconds?: number;
  SessionStatus: string;
  OperatorEmail?: string;
  OperatorName?: string;
  Created?: string;
  Modified?: string;
}

export interface CatalogSnapshotRow {
  revision: number;
  importedAt: string;
  sourceLabel: string;
  entries: Array<{
    materialNumber: string;
    materialDescription: string;
    materialStatus: "Active" | "Inactive";
    baseUOM?: string;
    plant?: string;
    lastSAPRefresh?: string;
  }>;
}

// ── Backend interface ──
export interface DataSourceBackend {
  getAllJobs(): Promise<JobRow[]>;
  createJob(row: Omit<JobRow, "ID" | "Created" | "Modified">): Promise<JobRow>;
  updateJob(id: string, patch: Partial<Omit<JobRow, "ID" | "Created" | "Modified">>): Promise<JobRow>;
  deleteJob(id: string): Promise<void>;

  getAllSessions(): Promise<SessionRow[]>;
  createSession(row: Omit<SessionRow, "ID" | "Created" | "Modified">): Promise<SessionRow>;
  updateSession(id: string, patch: Partial<Omit<SessionRow, "ID" | "Created" | "Modified">>): Promise<SessionRow>;
  deleteSession(id: string): Promise<void>;

  getCatalogSnapshot(): Promise<CatalogSnapshotRow | null>;
  replaceCatalogSnapshot(snap: CatalogSnapshotRow): Promise<CatalogSnapshotRow>;
}

// ── Local (localStorage) backend ──
const LS_JOBS = "lgc:jobs";
const LS_SESSIONS = "lgc:sessions";
const LS_CATALOG = "lgc:catalogSnapshot";

function lsRead<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T[] : [];
  } catch {
    return [];
  }
}
function lsWrite<T>(key: string, rows: T[]): void {
  localStorage.setItem(key, JSON.stringify(rows));
}
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const LocalBackend: DataSourceBackend = {
  async getAllJobs() { return lsRead<JobRow>(LS_JOBS); },
  async createJob(data) {
    const now = new Date().toISOString();
    const row: JobRow = { ...data, ID: genId("job"), Created: now, Modified: now };
    const jobs = lsRead<JobRow>(LS_JOBS);
    jobs.push(row);
    lsWrite(LS_JOBS, jobs);
    return row;
  },
  async updateJob(id, patch) {
    const jobs = lsRead<JobRow>(LS_JOBS);
    const idx = jobs.findIndex((j) => j.ID === id);
    if (idx < 0) throw new Error(`Job ${id} not found.`);
    const updated: JobRow = { ...jobs[idx], ...patch, ID: jobs[idx].ID, Modified: new Date().toISOString() };
    jobs[idx] = updated;
    lsWrite(LS_JOBS, jobs);
    return updated;
  },
  async deleteJob(id) {
    lsWrite(LS_JOBS, lsRead<JobRow>(LS_JOBS).filter((j) => j.ID !== id));
  },

  async getAllSessions() { return lsRead<SessionRow>(LS_SESSIONS); },
  async createSession(data) {
    const now = new Date().toISOString();
    const row: SessionRow = { ...data, ID: genId("ses"), Created: now, Modified: now };
    const sessions = lsRead<SessionRow>(LS_SESSIONS);
    sessions.push(row);
    lsWrite(LS_SESSIONS, sessions);
    return row;
  },
  async updateSession(id, patch) {
    const sessions = lsRead<SessionRow>(LS_SESSIONS);
    const idx = sessions.findIndex((s) => s.ID === id);
    if (idx < 0) throw new Error(`Session ${id} not found.`);
    const updated: SessionRow = { ...sessions[idx], ...patch, ID: sessions[idx].ID, Modified: new Date().toISOString() };
    sessions[idx] = updated;
    lsWrite(LS_SESSIONS, sessions);
    return updated;
  },
  async deleteSession(id) {
    lsWrite(LS_SESSIONS, lsRead<SessionRow>(LS_SESSIONS).filter((s) => s.ID !== id));
  },

  async getCatalogSnapshot() {
    try {
      const raw = localStorage.getItem(LS_CATALOG);
      return raw ? JSON.parse(raw) as CatalogSnapshotRow : null;
    } catch {
      return null;
    }
  },
  async replaceCatalogSnapshot(snap) {
    localStorage.setItem(LS_CATALOG, JSON.stringify(snap));
    return snap;
  },
};

// ── Supabase backend ──
function mapJobRow(r: Record<string, unknown>): JobRow {
  return {
    ID: r.id as string,
    JobKey: r.job_key as string,
    RawBarcode: r.raw_barcode as string,
    MaterialNumber: r.material_number as string,
    MaterialDescription: r.material_description as string | undefined,
    BatchNumber: r.batch_number as string,
    JobStatus: r.job_status as string,
    CurrentStartTime: r.current_start_time as string | undefined,
    TotalSeconds: r.total_seconds as number | undefined,
    EndedTime: r.ended_time as string | undefined,
    LastOperatorEmail: r.last_operator_email as string | undefined,
    LastOperatorName: r.last_operator_name as string | undefined,
    LastActionTime: r.last_action_time as string | undefined,
    Created: r.created as string | undefined,
    Modified: r.modified as string | undefined,
  };
}
function mapSessionRow(r: Record<string, unknown>): SessionRow {
  return {
    ID: r.id as string,
    JobKey: r.job_key as string,
    JobID: r.job_id as string,
    MaterialNumber: r.material_number as string,
    MaterialDescription: r.material_description as string | undefined,
    BatchNumber: r.batch_number as string,
    StartTime: r.start_time as string,
    StopTime: r.stop_time as string | undefined,
    DurationSeconds: r.duration_seconds as number | undefined,
    SessionStatus: r.session_status as string,
    OperatorEmail: r.operator_email as string | undefined,
    OperatorName: r.operator_name as string | undefined,
    Created: r.created as string | undefined,
    Modified: r.modified as string | undefined,
  };
}
function jobToDb(row: Omit<JobRow, "ID" | "Created" | "Modified">): Record<string, unknown> {
  return {
    job_key: row.JobKey,
    raw_barcode: row.RawBarcode,
    material_number: row.MaterialNumber,
    material_description: row.MaterialDescription ?? null,
    batch_number: row.BatchNumber,
    job_status: row.JobStatus,
    current_start_time: row.CurrentStartTime ?? null,
    total_seconds: row.TotalSeconds ?? 0,
    ended_time: row.EndedTime ?? null,
    last_operator_email: row.LastOperatorEmail ?? null,
    last_operator_name: row.LastOperatorName ?? null,
    last_action_time: row.LastActionTime ?? null,
  };
}
function sessionToDb(row: Omit<SessionRow, "ID" | "Created" | "Modified">): Record<string, unknown> {
  return {
    job_key: row.JobKey,
    job_id: row.JobID,
    material_number: row.MaterialNumber,
    material_description: row.MaterialDescription ?? null,
    batch_number: row.BatchNumber,
    start_time: row.StartTime,
    stop_time: row.StopTime ?? null,
    duration_seconds: row.DurationSeconds ?? 0,
    session_status: row.SessionStatus,
    operator_email: row.OperatorEmail ?? null,
    operator_name: row.OperatorName ?? null,
  };
}

const SupabaseBackend: DataSourceBackend = {
  async getAllJobs() {
    const sb = getSupabase();
    const { data, error } = await sb.from("batch_jobs").select("*");
    if (error) throw new Error(`Failed to load jobs: ${error.message}`);
    return (data ?? []).map(mapJobRow);
  },
  async createJob(data) {
    const sb = getSupabase();
    const id = genId("job");
    const { data: row, error } = await sb.from("batch_jobs")
      .insert({ id, ...jobToDb(data) })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create job: ${error.message}`);
    return mapJobRow(row);
  },
  async updateJob(id, patch) {
    const sb = getSupabase();
    const dbPatch: Record<string, unknown> = { modified: new Date().toISOString() };
    if (patch.JobStatus !== undefined) dbPatch.job_status = patch.JobStatus;
    if (patch.CurrentStartTime !== undefined) dbPatch.current_start_time = patch.CurrentStartTime;
    if (patch.TotalSeconds !== undefined) dbPatch.total_seconds = patch.TotalSeconds;
    if (patch.EndedTime !== undefined) dbPatch.ended_time = patch.EndedTime;
    if (patch.LastOperatorEmail !== undefined) dbPatch.last_operator_email = patch.LastOperatorEmail;
    if (patch.LastOperatorName !== undefined) dbPatch.last_operator_name = patch.LastOperatorName;
    if (patch.LastActionTime !== undefined) dbPatch.last_action_time = patch.LastActionTime;
    if (patch.MaterialDescription !== undefined) dbPatch.material_description = patch.MaterialDescription;
    const { data: row, error } = await sb.from("batch_jobs")
      .update(dbPatch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update job: ${error.message}`);
    return mapJobRow(row);
  },
  async deleteJob(id) {
    const sb = getSupabase();
    const { error } = await sb.from("batch_jobs").delete().eq("id", id);
    if (error) throw new Error(`Failed to delete job: ${error.message}`);
  },

  async getAllSessions() {
    const sb = getSupabase();
    const { data, error } = await sb.from("batch_sessions").select("*");
    if (error) throw new Error(`Failed to load sessions: ${error.message}`);
    return (data ?? []).map(mapSessionRow);
  },
  async createSession(data) {
    const sb = getSupabase();
    const id = genId("ses");
    const { data: row, error } = await sb.from("batch_sessions")
      .insert({ id, ...sessionToDb(data) })
      .select("*")
      .single();
    if (error) throw new Error(`Failed to create session: ${error.message}`);
    return mapSessionRow(row);
  },
  async updateSession(id, patch) {
    const sb = getSupabase();
    const dbPatch: Record<string, unknown> = { modified: new Date().toISOString() };
    if (patch.StopTime !== undefined) dbPatch.stop_time = patch.StopTime;
    if (patch.DurationSeconds !== undefined) dbPatch.duration_seconds = patch.DurationSeconds;
    if (patch.SessionStatus !== undefined) dbPatch.session_status = patch.SessionStatus;
    if (patch.MaterialDescription !== undefined) dbPatch.material_description = patch.MaterialDescription;
    const { data: row, error } = await sb.from("batch_sessions")
      .update(dbPatch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Failed to update session: ${error.message}`);
    return mapSessionRow(row);
  },
  async deleteSession(id) {
    const sb = getSupabase();
    const { error } = await sb.from("batch_sessions").delete().eq("id", id);
    if (error) throw new Error(`Failed to delete session: ${error.message}`);
  },

  async getCatalogSnapshot() {
    const sb = getSupabase();
    const { data, error } = await sb.from("material_catalog_snapshot")
      .select("*")
      .eq("id", "current")
      .maybeSingle();
    if (error) throw new Error(`Failed to load catalog: ${error.message}`);
    if (!data) return null;
    return {
      revision: data.revision as number,
      importedAt: data.imported_at as string,
      sourceLabel: data.source_label as string,
      entries: data.entries as CatalogSnapshotRow["entries"],
    };
  },
  async replaceCatalogSnapshot(snap) {
    const sb = getSupabase();
    const payload = {
      id: "current",
      revision: snap.revision,
      imported_at: snap.importedAt,
      source_label: snap.sourceLabel,
      entries: snap.entries,
    };
    const { data: existing } = await sb.from("material_catalog_snapshot")
      .select("id").eq("id", "current").maybeSingle();
    if (existing) {
      const { data: row, error } = await sb.from("material_catalog_snapshot")
        .update(payload).eq("id", "current").select("*").single();
      if (error) throw new Error(`Failed to update catalog: ${error.message}`);
      return { revision: row.revision, importedAt: row.imported_at, sourceLabel: row.source_label, entries: row.entries };
    }
    const { data: row, error } = await sb.from("material_catalog_snapshot")
      .insert(payload).select("*").single();
    if (error) throw new Error(`Failed to insert catalog: ${error.message}`);
    return { revision: row.revision, importedAt: row.imported_at, sourceLabel: row.source_label, entries: row.entries };
  },
};

export function getBackend(): DataSourceBackend {
  return getDataSourceType() === "supabase" ? SupabaseBackend : LocalBackend;
}
