import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
import { deriveJobsFromSessions, deriveJobByKey } from "@/lib/job-derivation";
import type { MaterialBatchJob } from "@/api/models/MaterialBatchJob";

/**
 * Jobs are now derived entirely from session data.  There is no separate
 * batch_jobs table — every field on a MaterialBatchJob is computed from the
 * session rows that share its JobKey.
 *
 * The create/update/delete methods are removed because mutations happen
 * exclusively through MaterialBatchSessionService.
 */
export const MaterialBatchJobService = {
  async getAll(): Promise<MaterialBatchJob[]> {
    const sessions = await MaterialBatchSessionService.getAll();
    return deriveJobsFromSessions(sessions);
  },

  async getByJobKey(jobKey: string): Promise<MaterialBatchJob | null> {
    const sessions = await MaterialBatchSessionService.getAll();
    return deriveJobByKey(sessions, jobKey);
  },
};
