import { getBackend, type SessionRow } from "@/lib/data-source";
import type { MaterialBatchSession, MaterialBatchSessionCreate, MaterialBatchSessionUpdate } from "@/api/models/MaterialBatchSession";

function rowToModel(r: SessionRow): MaterialBatchSession {
  return {
    ID: r.ID,
    JobKey: r.JobKey,
    JobID: r.JobID,
    MaterialNumber: r.MaterialNumber,
    MaterialDescription: r.MaterialDescription,
    BatchNumber: r.BatchNumber,
    StartTime: r.StartTime,
    StopTime: r.StopTime,
    DurationSeconds: r.DurationSeconds,
    SessionStatus: r.SessionStatus as MaterialBatchSession["SessionStatus"],
    OperatorEmail: r.OperatorEmail,
    OperatorName: r.OperatorName,
    Created: r.Created,
    Modified: r.Modified,
  };
}

export const MaterialBatchSessionService = {
  async getAll(): Promise<MaterialBatchSession[]> {
    return (await getBackend().getAllSessions()).map(rowToModel);
  },

  async create(data: MaterialBatchSessionCreate): Promise<MaterialBatchSession> {
    return rowToModel(await getBackend().createSession(data));
  },

  async update(id: string, patch: MaterialBatchSessionUpdate): Promise<MaterialBatchSession> {
    return rowToModel(await getBackend().updateSession(id, patch));
  },

  async delete(id: string): Promise<void> {
    await getBackend().deleteSession(id);
  },
};
