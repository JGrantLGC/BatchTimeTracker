import { memory } from "@/lib/memory-store";
import type { MaterialBatchJob, MaterialBatchJobCreate, MaterialBatchJobUpdate } from "@/api/models/MaterialBatchJob";

const STORE_KEY = "materialBatchJobs";

function getAllJobs(): MaterialBatchJob[] {
  return memory.ensure<MaterialBatchJob[]>(STORE_KEY, () => []);
}

function generateId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const MaterialBatchJobService = {
  async getAll(): Promise<MaterialBatchJob[]> {
    return getAllJobs().slice();
  },

  async create(data: MaterialBatchJobCreate): Promise<MaterialBatchJob> {
    const now = new Date().toISOString();
    const row: MaterialBatchJob = {
      ...data,
      ID: generateId(),
      Created: now,
      Modified: now,
    };
    const jobs = getAllJobs();
    jobs.push(row);
    memory.put(STORE_KEY, jobs);
    return row;
  },

  async update(id: string, patch: MaterialBatchJobUpdate): Promise<MaterialBatchJob> {
    const jobs = getAllJobs();
    const idx = jobs.findIndex((j) => j.ID === id);
    if (idx < 0) throw new Error(`Job ${id} not found.`);
    const updated: MaterialBatchJob = {
      ...jobs[idx],
      ...patch,
      ID: jobs[idx].ID,
      Modified: new Date().toISOString(),
    };
    jobs[idx] = updated;
    memory.put(STORE_KEY, jobs);
    return updated;
  },

  async delete(id: string): Promise<void> {
    const jobs = getAllJobs().filter((j) => j.ID !== id);
    memory.put(STORE_KEY, jobs);
  },
};
