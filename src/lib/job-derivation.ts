import type { MaterialBatchSession } from "@/api/models/MaterialBatchSession";
import type { MaterialBatchJob, JobStatus } from "@/api/models/MaterialBatchJob";

/**
 * Derives a list of jobs from a flat list of sessions.
 *
 * Every field on a job — status, total seconds, current start time, last
 * operator, last action time, ended time — is computed from the session rows
 * that share the same JobKey.  This eliminates the need for a separate
 * batch_jobs table and the dual-write that kept it in sync.
 *
 * Derivation rules:
 *  - **New**    — JobKey has sessions but none are Running/Paused/ClosedByEnd
 *                 (should not normally happen; treated as Stopped).
 *  - **Running** — at least one session with SessionStatus "Running".
 *  - **Stopped** — no Running session, at least one Paused session, and no
 *                   ClosedByEnd session.
 *  - **Ended**  — at least one session with SessionStatus "ClosedByEnd".
 *
 * TotalSeconds is the sum of all session durations.  For a Running session the
 * live elapsed time (now − StartTime) is used so the total stays live.
 */
export function deriveJobsFromSessions(
  sessions: MaterialBatchSession[],
  now: Date = new Date(),
): MaterialBatchJob[] {
  const byKey = new Map<string, MaterialBatchSession[]>();

  for (const s of sessions) {
    const list = byKey.get(s.JobKey);
    if (list) {
      list.push(s);
    } else {
      byKey.set(s.JobKey, [s]);
    }
  }

  const nowMs = now.getTime();

  const jobs: MaterialBatchJob[] = [];

  for (const [jobKey, jobSessions] of byKey) {
    jobs.push(deriveJobFromSessions(jobKey, jobSessions, nowMs));
  }

  // Sort by last action time descending (most recent first)
  jobs.sort(
    (a, b) =>
      new Date(b.LastActionTime ?? 0).getTime() -
      new Date(a.LastActionTime ?? 0).getTime(),
  );

  return jobs;
}

function deriveJobFromSessions(
  jobKey: string,
  jobSessions: MaterialBatchSession[],
  nowMs: number,
): MaterialBatchJob {
  // Sort sessions by start time ascending for deterministic processing
  const sorted = [...jobSessions].sort(
    (a, b) =>
      new Date(a.StartTime).getTime() - new Date(b.StartTime).getTime(),
  );

  const hasRunning = sorted.some((s) => s.SessionStatus === "Running");
  const hasClosedByEnd = sorted.some(
    (s) => s.SessionStatus === "ClosedByEnd",
  );
  const hasPaused = sorted.some((s) => s.SessionStatus === "Paused");

  let status: JobStatus;
  if (hasClosedByEnd) {
    status = "Ended";
  } else if (hasRunning) {
    status = "Running";
  } else if (hasPaused) {
    status = "Stopped";
  } else {
    status = "Stopped";
  }

  // Total seconds: sum of all session durations.
  // For Running sessions, use live elapsed time.
  let totalSeconds = 0;
  let currentStartTime: string | undefined;
  for (const s of sorted) {
    if (s.SessionStatus === "Running") {
      const elapsed = Math.max(
        0,
        Math.floor((nowMs - new Date(s.StartTime).getTime()) / 1000),
      );
      totalSeconds += elapsed;
      currentStartTime = s.StartTime;
    } else {
      totalSeconds += s.DurationSeconds ?? 0;
    }
  }

  // EndedTime: the StopTime of the ClosedByEnd session (if any)
  const endedSession = sorted.find(
    (s) => s.SessionStatus === "ClosedByEnd",
  );
  const endedTime = endedSession?.StopTime;

  // Last operator & last action: from the most recently started session
  const lastSession = sorted[sorted.length - 1];
  const lastOperatorEmail = lastSession?.OperatorEmail;
  const lastOperatorName = lastSession?.OperatorName;

  // Last action time: the latest StopTime or StartTime across all sessions
  let lastActionTime: string | undefined;
  for (const s of sorted) {
    const candidate = s.StopTime ?? s.StartTime;
    if (
      !lastActionTime ||
      new Date(candidate).getTime() > new Date(lastActionTime).getTime()
    ) {
      lastActionTime = candidate;
    }
  }

  // Use the first session's Created as the job's Created, and the latest
  // Modified as the job's Modified.
  const created = sorted[0]?.Created;
  let modified: string | undefined;
  for (const s of sorted) {
    if (
      !modified ||
      (s.Modified && new Date(s.Modified).getTime() > new Date(modified).getTime())
    ) {
      modified = s.Modified;
    }
  }

  // RawBarcode: reconstruct from material/batch (not stored on session, but
  // job model has it for display).  Use the material + batch from any session.
  const firstSession = sorted[0];
  const rawBarcode = firstSession
    ? `${firstSession.MaterialNumber}|${firstSession.BatchNumber}`
    : "";

  return {
    ID: `derived-${jobKey}`,
    JobKey: jobKey,
    RawBarcode: rawBarcode,
    MaterialNumber: firstSession?.MaterialNumber ?? "",
    MaterialDescription: firstSession?.MaterialDescription,
    BatchNumber: firstSession?.BatchNumber ?? "",
    JobStatus: status,
    CurrentStartTime: currentStartTime,
    TotalSeconds: totalSeconds,
    EndedTime: endedTime,
    LastOperatorEmail: lastOperatorEmail,
    LastOperatorName: lastOperatorName,
    LastActionTime: lastActionTime,
    Created: created,
    Modified: modified,
  };
}

/**
 * Derive a single job for a specific JobKey from a list of sessions.
 */
export function deriveJobByKey(
  sessions: MaterialBatchSession[],
  jobKey: string,
  now: Date = new Date(),
): MaterialBatchJob | null {
  const jobSessions = sessions.filter((s) => s.JobKey === jobKey);
  if (jobSessions.length === 0) return null;
  return deriveJobFromSessions(jobKey, jobSessions, now.getTime());
}
