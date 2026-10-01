export type SessionStatus = "Running" | "Completed" | "ClosedByEnd";

export interface MaterialBatchSession {
  ID: string;
  JobKey: string;
  JobID: string;
  MaterialNumber: string;
  MaterialDescription?: string;
  BatchNumber: string;
  StartTime: string;
  StopTime?: string;
  DurationSeconds?: number;
  SessionStatus: SessionStatus;
  OperatorEmail?: string;
  OperatorName?: string;
  Created?: string;
  Modified?: string;
}

export type MaterialBatchSessionCreate = Omit<MaterialBatchSession, "ID" | "Created" | "Modified">;
export type MaterialBatchSessionUpdate = Partial<Omit<MaterialBatchSession, "ID" | "Created" | "Modified">>;
