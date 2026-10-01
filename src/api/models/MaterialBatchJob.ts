export type JobStatus = "New" | "Running" | "Stopped" | "Ended";

export interface MaterialBatchJob {
  ID: string;
  JobKey: string;
  RawBarcode: string;
  MaterialNumber: string;
  MaterialDescription?: string;
  BatchNumber: string;
  JobStatus: JobStatus;
  CurrentStartTime?: string;
  TotalSeconds?: number;
  EndedTime?: string;
  LastOperatorEmail?: string;
  LastOperatorName?: string;
  LastActionTime?: string;
  Created?: string;
  Modified?: string;
}

export type MaterialBatchJobCreate = Omit<MaterialBatchJob, "ID" | "Created" | "Modified">;
export type MaterialBatchJobUpdate = Partial<Omit<MaterialBatchJob, "ID" | "Created" | "Modified">>;
