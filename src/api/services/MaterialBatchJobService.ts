import { getBackend, type JobRow } from "@/lib/data-source";
import type { MaterialBatchJob, MaterialBatchJobCreate, MaterialBatchJobUpdate } from "@/api/models/MaterialBatchJob";

function rowToModel(r: JobRow): MaterialBatchJob {
  return {
    ID: r.ID,
    JobKey: r.JobKey,
    RawBarcode: r.RawBarcode,
    MaterialNumber: r.MaterialNumber,
    MaterialDescription: r.MaterialDescription,
    BatchNumber: r.BatchNumber,
    JobStatus: r.JobStatus as MaterialBatchJob["JobStatus"],
    CurrentStartTime: r.CurrentStartTime,
    TotalSeconds: r.TotalSeconds,
    EndedTime: r.EndedTime,
    LastOperatorEmail: r.LastOperatorEmail,
    LastOperatorName: r.LastOperatorName,
    LastActionTime: r.LastActionTime,
    Created: r.Created,
    Modified: r.Modified,
  };
}

export const MaterialBatchJobService = {
  async getAll(): Promise<MaterialBatchJob[]> {
    return (await getBackend().getAllJobs()).map(rowToModel);
  },

  async create(data: MaterialBatchJobCreate): Promise<MaterialBatchJob> {
    return rowToModel(await getBackend().createJob(data));
  },

  async update(id: string, patch: MaterialBatchJobUpdate): Promise<MaterialBatchJob> {
    return rowToModel(await getBackend().updateJob(id, patch));
  },

  async delete(id: string): Promise<void> {
    await getBackend().deleteJob(id);
  },
};
