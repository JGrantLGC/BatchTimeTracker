/**
 * Automated state-transition tests for the Cumberland Material-Batch Time Tracker.
 *
 * These tests exercise the LIVE data services (MaterialBatchJobService and
 * MaterialBatchSessionService) using isolated TEST-* JobKeys, then clean up.
 *
 * Key invariants proven:
 *   - Exactly one Running session per JobKey at any time.
 *   - SUM(session.DurationSeconds) === job.TotalSeconds after every terminal
 *     state (this is the definitive no-double-count check).
 *   - TotalSeconds preserved across the Stopped -> Running boundary.
 *   - End closes at most one session (never zero, never two).
 *   - Two different MaterialNumbers sharing the same BatchNumber produce
 *     distinct JobKeys with independent totals.
 */
 import { MaterialBatchJobService } from "@/api/services/MaterialBatchJobService";
 import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
 import type { MaterialBatchJob } from "@/api/models/MaterialBatchJob";
 import type { MaterialBatchSession } from "@/api/models/MaterialBatchSession";
 import { getBarcodeDelimiter, getCurrentOperator } from "@/lib/app-context";
 import { parseBarcode } from "@/lib/barcode";
 import { lookupMaterial, getAllCatalogEntries } from "@/lib/material-catalog";
 import { nowIso, secondsBetween } from "@/lib/time-utils";
 export interface Assertion {
   label: string;
   passed: boolean;
   detail?: string;
 }
 export interface TestResult {
   name: string;
   passed: boolean;
   error?: string;
   assertions: Assertion[];
   elapsedMs?: number;
 }
 export interface TestSuiteResult {
   tests: TestResult[];
   elapsedMs: number;
 }
 // ---------------------------------------------------------------------------
 // Test harness helpers
 // ---------------------------------------------------------------------------
 async function findJobByKey(jobKey: string): Promise<MaterialBatchJob | null> {
   const all = await MaterialBatchJobService.getAll();
   return all.find((j) => j.JobKey === jobKey) ?? null;
 }
 async function findSessionsForJobKey(
   jobKey: string,
 ): Promise<MaterialBatchSession[]> {
   const all = await MaterialBatchSessionService.getAll();
   return all
     .filter((s) => s.JobKey === jobKey)
     .sort(
       (a, b) => new Date(a.StartTime).getTime() - new Date(b.StartTime).getTime(),
     );
 }
 async function findOpenRunningSession(
   jobKey: string,
 ): Promise<MaterialBatchSession | null> {
   const rows = await findSessionsForJobKey(jobKey);
   return rows.find((s) => s.SessionStatus === "Running") ?? null;
 }
 /** Sleep helper — used to make sure durations are strictly > 0. */
 function sleep(ms: number): Promise<void> {
   return new Promise((resolve) => setTimeout(resolve, ms));
 }
 /** Start behavior (matches operator screen logic). */
 async function doStart(
   jobKey: string,
   materialNumber: string,
   batchNumber: string,
   materialDescription: string,
   rawBarcode: string,
 ): Promise<MaterialBatchJob> {
   const operator = getCurrentOperator();
   const startTime = nowIso();
   let jobRow: MaterialBatchJob;
   const existing = await findJobByKey(jobKey);
   if (existing?.JobStatus === "Running") {
     throw new Error("Already Running.");
   }
   if (existing?.JobStatus === "Ended") {
     throw new Error("Ended job cannot restart.");
   }
   if (!existing) {
     jobRow = await MaterialBatchJobService.create({
       JobKey: jobKey,
       RawBarcode: rawBarcode,
       MaterialNumber: materialNumber,
       MaterialDescription: materialDescription,
       BatchNumber: batchNumber,
       JobStatus: "Running",
       CurrentStartTime: startTime,
       TotalSeconds: 0,
       EndedTime: undefined,
       LastOperatorEmail: operator.email,
       LastOperatorName: operator.name,
       LastActionTime: startTime,
     });
   } else {
     jobRow = await MaterialBatchJobService.update(existing.ID, {
       JobStatus: "Running",
       CurrentStartTime: startTime,
       LastOperatorEmail: operator.email,
       LastOperatorName: operator.name,
       LastActionTime: startTime,
       TotalSeconds: existing.TotalSeconds ?? 0,
     });
   }
   await MaterialBatchSessionService.create({
     JobKey: jobRow.JobKey,
     JobID: jobRow.ID,
     MaterialNumber: jobRow.MaterialNumber,
     MaterialDescription: jobRow.MaterialDescription ?? "",
     BatchNumber: jobRow.BatchNumber,
     StartTime: startTime,
     StopTime: undefined,
     DurationSeconds: 0,
     SessionStatus: "Running",
     OperatorEmail: operator.email,
     OperatorName: operator.name,
   });
   return jobRow;
 }
 async function doStop(jobKey: string): Promise<number> {
   const operator = getCurrentOperator();
   const job = await findJobByKey(jobKey);
   if (!job) throw new Error("No job found.");
   if (job.JobStatus !== "Running") throw new Error("Job is not Running.");
   const open = await findOpenRunningSession(jobKey);
   if (!open) throw new Error("No open Running session found.");
   const stopTime = nowIso();
   const duration = secondsBetween(open.StartTime, stopTime);
   if (duration <= 0) throw new Error("non-positive duration on stop");
   await MaterialBatchSessionService.update(open.ID, {
     StopTime: stopTime,
     DurationSeconds: duration,
     SessionStatus: "Paused",
   });
   const newTotal = (job.TotalSeconds ?? 0) + duration;
   await MaterialBatchJobService.update(job.ID, {
     JobStatus: "Stopped",
     CurrentStartTime: undefined,
     TotalSeconds: newTotal,
     LastOperatorEmail: operator.email,
     LastOperatorName: operator.name,
     LastActionTime: stopTime,
   });
   return duration;
 }
 async function doEnd(jobKey: string): Promise<{ finalTotal: number; closedByEnd: number }> {
   const operator = getCurrentOperator();
   const job = await findJobByKey(jobKey);
   if (!job) throw new Error("No job found.");
   if (job.JobStatus === "Ended") throw new Error("Job is already Ended.");
   const endTime = nowIso();
   let addedFromClose = 0;
   let closedByEnd = 0;
   if (job.JobStatus === "Running") {
     const open = await findOpenRunningSession(jobKey);
     if (open) {
       const duration = secondsBetween(open.StartTime, endTime);
       if (duration <= 0) throw new Error("non-positive duration on end");
       await MaterialBatchSessionService.update(open.ID, {
         StopTime: endTime,
         DurationSeconds: duration,
         SessionStatus: "ClosedByEnd",
       });
       addedFromClose = duration;
       closedByEnd = 1;
     }
   }
   const finalTotal = (job.TotalSeconds ?? 0) + addedFromClose;
   await MaterialBatchJobService.update(job.ID, {
     JobStatus: "Ended",
     CurrentStartTime: undefined,
     TotalSeconds: finalTotal,
     EndedTime: endTime,
     LastOperatorEmail: operator.email,
     LastOperatorName: operator.name,
     LastActionTime: endTime,
   });
   return { finalTotal, closedByEnd };
 }
 /** Delete a job and all of its sessions. Used for post-test cleanup. */
 async function cleanup(jobKey: string): Promise<void> {
   const job = await findJobByKey(jobKey);
   const sessions = await findSessionsForJobKey(jobKey);
   for (const s of sessions) {
     try {
       await MaterialBatchSessionService.delete(s.ID);
     } catch {
       // ignore
     }
   }
   if (job) {
     try {
       await MaterialBatchJobService.delete(job.ID);
     } catch {
       // ignore
     }
   }
 }
 function assert(
   assertions: Assertion[],
   label: string,
   condition: boolean,
   detail?: string,
 ) {
   assertions.push({ label, passed: !!condition, detail });
 }
 async function runTest(
   name: string,
   fn: (assertions: Assertion[]) => Promise<void>,
 ): Promise<TestResult> {
   const start = performance.now();
   const assertions: Assertion[] = [];
   try {
     await fn(assertions);
     const passed = assertions.every((a) => a.passed);
     return {
       name,
       passed,
       assertions,
       elapsedMs: performance.now() - start,
     };
   } catch (e) {
     return {
       name,
       passed: false,
       assertions,
       error: e instanceof Error ? e.message : String(e),
       elapsedMs: performance.now() - start,
     };
   }
 }
 /** Choose two active materials for two-materials-same-batch test. */
 function pickTwoActiveMaterials(): {
   a: { number: string; description: string };
   b: { number: string; description: string };
 } {
   const entries = getAllCatalogEntries();
   const active = entries.filter((e) => e.materialStatus === "Active");
   // Try to grab our seeded examples first
   const preferredA = active.find((e) => e.materialNumber === "68-000018");
   const preferredB = active.find((e) => e.materialNumber === "72-100001");
   const a = preferredA ?? active[0];
   const b = preferredB ?? active.find((e) => e.materialNumber !== a?.materialNumber);
   if (!a || !b) {
     throw new Error("Not enough active materials in the catalog for this test.");
   }
   return {
     a: { number: a.materialNumber, description: a.materialDescription },
     b: { number: b.materialNumber, description: b.materialDescription },
   };
 }
 // ---------------------------------------------------------------------------
 // Individual tests
 // ---------------------------------------------------------------------------
 async function testStartCreatesOneRunningJobAndSession(): Promise<TestResult> {
   return runTest(
     "Start creates one Running job and one Running session",
     async (a) => {
       const jobKey = `TEST-START-${Date.now()}`;
       try {
         await doStart(jobKey, "TEST-MAT-A", "TEST-BATCH-A", "Test Material A", jobKey);
         const job = await findJobByKey(jobKey);
         assert(a, "Job row exists", !!job, `jobKey=${jobKey}`);
         assert(a, "JobStatus is Running", job?.JobStatus === "Running");
         assert(a, "TotalSeconds is 0 initially", (job?.TotalSeconds ?? -1) === 0);
         assert(a, "CurrentStartTime is set", !!job?.CurrentStartTime);
         const sessions = await findSessionsForJobKey(jobKey);
         assert(a, "Exactly one session exists", sessions.length === 1, `sessions=${sessions.length}`);
         const running = sessions.filter((s) => s.SessionStatus === "Running");
         assert(a, "Exactly one Running session", running.length === 1);
         assert(a, "Running session has no StopTime", !running[0].StopTime);
       } finally {
         await cleanup(jobKey);
       }
     },
   );
 }
 async function testStopClosesSessionAndAddsDuration(): Promise<TestResult> {
   return runTest(
     "Stop closes session and adds duration to job.totalSeconds",
     async (a) => {
       const jobKey = `TEST-STOP-${Date.now()}`;
       try {
         await doStart(jobKey, "TEST-MAT-A", "TEST-BATCH-A", "Test Material A", jobKey);
         await sleep(1100); // guarantee > 1s duration
         const duration = await doStop(jobKey);
         assert(a, "Stop returned a positive duration", duration > 0, `d=${duration}`);
         const job = await findJobByKey(jobKey);
         assert(a, "JobStatus is Stopped", job?.JobStatus === "Stopped");
         assert(a, "CurrentStartTime is cleared", !job?.CurrentStartTime);
         assert(
           a,
           "job.TotalSeconds equals returned duration",
           (job?.TotalSeconds ?? -1) === duration,
           `total=${job?.TotalSeconds} expected=${duration}`,
         );
         const sessions = await findSessionsForJobKey(jobKey);
         assert(a, "Session is Paused", sessions[0].SessionStatus === "Paused");
         assert(a, "Session has StopTime", !!sessions[0].StopTime);
         assert(
           a,
           "Session DurationSeconds > 0",
           (sessions[0].DurationSeconds ?? 0) > 0,
         );
         const running = sessions.filter((s) => s.SessionStatus === "Running");
         assert(a, "No Running sessions remain", running.length === 0);
       } finally {
         await cleanup(jobKey);
       }
     },
   );
 }
 async function testRepeatedStartStopAccumulates(): Promise<TestResult> {
   return runTest(
     "Repeated Start/Stop cycles accumulate without double-counting",
     async (a) => {
       const jobKey = `TEST-REPEAT-${Date.now()}`;
       try {
         const durations: number[] = [];
         for (let cycle = 1; cycle <= 3; cycle++) {
           const jobBefore = await findJobByKey(jobKey);
           const totalBefore = jobBefore?.TotalSeconds ?? 0;
           await doStart(jobKey, "TEST-MAT-A", "TEST-BATCH-A", "Test Material A", jobKey);
           const afterStart = await findJobByKey(jobKey);
           assert(
             a,
             `Cycle ${cycle}: TotalSeconds preserved on restart`,
             (afterStart?.TotalSeconds ?? -1) === totalBefore,
             `before=${totalBefore} after=${afterStart?.TotalSeconds}`,
           );
           await sleep(1100);
           const d = await doStop(jobKey);
           durations.push(d);
           const afterStop = await findJobByKey(jobKey);
           const expected = durations.reduce((sum, x) => sum + x, 0);
           assert(
             a,
             `Cycle ${cycle}: total equals sum of durations so far`,
             (afterStop?.TotalSeconds ?? -1) === expected,
             `total=${afterStop?.TotalSeconds} expected=${expected}`,
           );
         }
         const sessions = await findSessionsForJobKey(jobKey);
         const sessionSum = sessions.reduce(
           (sum, s) => sum + (s.DurationSeconds ?? 0),
           0,
         );
         const job = await findJobByKey(jobKey);
         assert(
           a,
           "Sum of session durations equals job.TotalSeconds",
           sessionSum === (job?.TotalSeconds ?? -1),
           `sessionsSum=${sessionSum} total=${job?.TotalSeconds}`,
         );
         const paused = sessions.filter((s) => s.SessionStatus === "Paused");
         assert(
           a,
           "Exactly 3 Paused sessions",
           paused.length === 3,
           `paused=${paused.length}`,
         );
         const running = sessions.filter((s) => s.SessionStatus === "Running");
         assert(a, "Zero Running sessions", running.length === 0);
       } finally {
         await cleanup(jobKey);
       }
     },
   );
 }
 async function testEndWhileStoppedPreservesTotal(): Promise<TestResult> {
   return runTest(
     "End while Stopped preserves total (no ClosedByEnd session created)",
     async (a) => {
       const jobKey = `TEST-END-STOPPED-${Date.now()}`;
       try {
         await doStart(jobKey, "TEST-MAT-A", "TEST-BATCH-A", "Test Material A", jobKey);
         await sleep(1100);
         const stopDur = await doStop(jobKey);
         const beforeSessions = await findSessionsForJobKey(jobKey);
         const closedByEndBefore = beforeSessions.filter(
           (s) => s.SessionStatus === "ClosedByEnd",
         ).length;
         const { finalTotal, closedByEnd } = await doEnd(jobKey);
         assert(a, "End reported 0 sessions closed", closedByEnd === 0);
         assert(
           a,
           "Final total equals prior Stop duration",
           finalTotal === stopDur,
           `finalTotal=${finalTotal} stopDur=${stopDur}`,
         );
         const job = await findJobByKey(jobKey);
         assert(a, "JobStatus is Ended", job?.JobStatus === "Ended");
         assert(a, "EndedTime is set", !!job?.EndedTime);
         const afterSessions = await findSessionsForJobKey(jobKey);
         const closedByEndAfter = afterSessions.filter(
           (s) => s.SessionStatus === "ClosedByEnd",
         ).length;
         assert(
           a,
           "No new ClosedByEnd session created",
           closedByEndAfter === closedByEndBefore,
           `before=${closedByEndBefore} after=${closedByEndAfter}`,
         );
       } finally {
         await cleanup(jobKey);
       }
     },
   );
 }
 async function testEndWhileRunningClosesOneSession(): Promise<TestResult> {
   return runTest(
     "End while Running closes exactly one session",
     async (a) => {
       const jobKey = `TEST-END-RUNNING-${Date.now()}`;
       try {
         await doStart(jobKey, "TEST-MAT-A", "TEST-BATCH-A", "Test Material A", jobKey);
         await sleep(1100);
         const stopDur = await doStop(jobKey);
         await doStart(jobKey, "TEST-MAT-A", "TEST-BATCH-A", "Test Material A", jobKey);
         await sleep(1100);
         const priorPaused = (await findSessionsForJobKey(jobKey)).filter(
           (s) => s.SessionStatus === "Paused",
         ).length;
         const { finalTotal, closedByEnd } = await doEnd(jobKey);
         assert(a, "End reported exactly 1 session closed", closedByEnd === 1);
         assert(a, "Final total > prior Stop duration", finalTotal > stopDur);
         const sessions = await findSessionsForJobKey(jobKey);
         const closedByEndCount = sessions.filter(
           (s) => s.SessionStatus === "ClosedByEnd",
         ).length;
         assert(
           a,
           "Exactly 1 ClosedByEnd session",
           closedByEndCount === 1,
           `closedByEnd=${closedByEndCount}`,
         );
         const pausedNow = sessions.filter(
           (s) => s.SessionStatus === "Paused",
         ).length;
         assert(
           a,
           "Paused session count unchanged",
           pausedNow === priorPaused,
           `before=${priorPaused} after=${pausedNow}`,
         );
         const running = sessions.filter((s) => s.SessionStatus === "Running");
         assert(a, "No Running sessions remain", running.length === 0);
         const sessionSum = sessions.reduce(
           (sum, s) => sum + (s.DurationSeconds ?? 0),
           0,
         );
         assert(
           a,
           "finalTotal equals sum of session durations",
           finalTotal === sessionSum,
           `finalTotal=${finalTotal} sessionsSum=${sessionSum}`,
         );
       } finally {
         await cleanup(jobKey);
       }
     },
   );
 }
 async function testSecondEndOnEndedJobRejected(): Promise<TestResult> {
   return runTest(
     "Second End on already-Ended job is rejected",
     async (a) => {
       const jobKey = `TEST-END-TWICE-${Date.now()}`;
       try {
         await doStart(jobKey, "TEST-MAT-A", "TEST-BATCH-A", "Test Material A", jobKey);
         await sleep(1100);
         await doStop(jobKey);
         await doEnd(jobKey);
         const beforeCount = (await findSessionsForJobKey(jobKey)).filter(
           (s) => s.SessionStatus === "ClosedByEnd",
         ).length;
         let threw = false;
         try {
           await doEnd(jobKey);
         } catch {
           threw = true;
         }
         assert(a, "Second End threw", threw);
         const afterCount = (await findSessionsForJobKey(jobKey)).filter(
           (s) => s.SessionStatus === "ClosedByEnd",
         ).length;
         assert(
           a,
           "ClosedByEnd session count unchanged",
           beforeCount === afterCount,
           `before=${beforeCount} after=${afterCount}`,
         );
       } finally {
         await cleanup(jobKey);
       }
     },
   );
 }
 async function testTwoMaterialsSameBatch(): Promise<TestResult> {
   return runTest(
     "Two materials sharing the same batch produce separate JobKeys and separate totals",
     async (a) => {
       const delimiter = getBarcodeDelimiter();
       const { a: matA, b: matB } = pickTwoActiveMaterials();
       const sharedBatch = `SHARED-${Date.now()}`;
       const barcodeA = `${matA.number}${delimiter}${sharedBatch}`;
       const barcodeB = `${matB.number}${delimiter}${sharedBatch}`;
       // --- Barcode parsing ---
       const parsedA = parseBarcode(barcodeA, delimiter);
       const parsedB = parseBarcode(barcodeB, delimiter);
       assert(a, "Barcode A parsed successfully", parsedA.ok, barcodeA);
       assert(a, "Barcode B parsed successfully", parsedB.ok, barcodeB);
       if (!parsedA.ok || !parsedB.ok) return;
       assert(a, "Parsed MaterialNumber A equals input", parsedA.materialNumber === matA.number);
       assert(a, "Parsed MaterialNumber B equals input", parsedB.materialNumber === matB.number);
       assert(a, "Parsed BatchNumber A equals shared batch", parsedA.batchNumber === sharedBatch);
       assert(a, "Parsed BatchNumber B equals shared batch", parsedB.batchNumber === sharedBatch);
       assert(a, "Both barcodes share the same BatchNumber", parsedA.batchNumber === parsedB.batchNumber);
       assert(a, "MaterialNumbers differ between the two barcodes", parsedA.materialNumber !== parsedB.materialNumber);
       assert(a, "JobKey A follows MaterialNumber+delim+Batch", parsedA.jobKey === `${matA.number}${delimiter}${sharedBatch}`);
       assert(a, "JobKey B follows MaterialNumber+delim+Batch", parsedB.jobKey === `${matB.number}${delimiter}${sharedBatch}`);
       assert(a, "JobKey A ≠ JobKey B despite shared batch", parsedA.jobKey !== parsedB.jobKey);
       const jobKeyA = parsedA.jobKey;
       const jobKeyB = parsedB.jobKey;
       // Confirm materials still resolve in catalog
       const lookupA = lookupMaterial(matA.number);
       const lookupB = lookupMaterial(matB.number);
       assert(a, "Material A resolves in catalog", !!lookupA);
       assert(a, "Material B resolves in catalog", !!lookupB);
       if (!lookupA || !lookupB) return;
       try {
         // --- Job A: two Start/Stop cycles ---
         await doStart(jobKeyA, matA.number, sharedBatch, lookupA.materialDescription, barcodeA);
         await sleep(1100);
         const dA1 = await doStop(jobKeyA);
         await doStart(jobKeyA, matA.number, sharedBatch, lookupA.materialDescription, barcodeA);
         await sleep(1100);
         const dA2 = await doStop(jobKeyA);
         // --- Job B: one Start/Stop cycle ---
         await doStart(jobKeyB, matB.number, sharedBatch, lookupB.materialDescription, barcodeB);
         await sleep(1100);
         const dB1 = await doStop(jobKeyB);
         const jobA = await findJobByKey(jobKeyA);
         const jobB = await findJobByKey(jobKeyB);
         assert(a, "Two distinct MaterialBatchJobs rows exist", !!jobA && !!jobB && jobA.ID !== jobB.ID, `A.ID=${jobA?.ID} B.ID=${jobB?.ID}`);
         assert(a, "Job A has primary MaterialNumber", jobA?.MaterialNumber === matA.number);
         assert(a, "Job B has alternate MaterialNumber", jobB?.MaterialNumber === matB.number);
         assert(a, "Both jobs share the same BatchNumber", jobA?.BatchNumber === sharedBatch && jobB?.BatchNumber === sharedBatch);
         assert(a, "Description snapshot on Job A matches primary material", jobA?.MaterialDescription === lookupA.materialDescription);
         assert(a, "Description snapshot on Job B matches alternate material", jobB?.MaterialDescription === lookupB.materialDescription);
         assert(a, "Raw barcode preserved on Job A", jobA?.RawBarcode === barcodeA);
         assert(a, "Raw barcode preserved on Job B", jobB?.RawBarcode === barcodeB);
         assert(a, "Job A total = sum of A's two session durations", (jobA?.TotalSeconds ?? -1) === dA1 + dA2, `A.total=${jobA?.TotalSeconds} expected=${dA1 + dA2}`);
         assert(a, "Job B total = B's one session duration", (jobB?.TotalSeconds ?? -1) === dB1, `B.total=${jobB?.TotalSeconds} expected=${dB1}`);
         assert(a, "A.total ≠ B.total — independent accounting", (jobA?.TotalSeconds ?? -1) !== (jobB?.TotalSeconds ?? -2));
         const sessionsA = await findSessionsForJobKey(jobKeyA);
         const sessionsB = await findSessionsForJobKey(jobKeyB);
         assert(a, "Job A has exactly 2 sessions", sessionsA.length === 2, `A.sessions=${sessionsA.length}`);
         assert(a, "Job B has exactly 1 session", sessionsB.length === 1, `B.sessions=${sessionsB.length}`);
         assert(a, "Every A session references JobKey A", sessionsA.every((s) => s.JobKey === jobKeyA));
         assert(a, "Every B session references JobKey B", sessionsB.every((s) => s.JobKey === jobKeyB));
         assert(a, "No A session references JobKey B", sessionsA.every((s) => s.JobKey !== jobKeyB));
         assert(a, "No B session references JobKey A", sessionsB.every((s) => s.JobKey !== jobKeyA));
         const sumA = sessionsA.reduce((sum, s) => sum + (s.DurationSeconds ?? 0), 0);
         const sumB = sessionsB.reduce((sum, s) => sum + (s.DurationSeconds ?? 0), 0);
         assert(a, "Sum of A session durations = Job A.TotalSeconds", sumA === (jobA?.TotalSeconds ?? -1), `sumA=${sumA} total=${jobA?.TotalSeconds}`);
         assert(a, "Sum of B session durations = Job B.TotalSeconds", sumB === (jobB?.TotalSeconds ?? -1), `sumB=${sumB} total=${jobB?.TotalSeconds}`);
       } finally {
         await cleanup(jobKeyA);
         await cleanup(jobKeyB);
       }
     },
   );
 }
 // ---------------------------------------------------------------------------
 // Top-level runner
 // ---------------------------------------------------------------------------
 export async function runAllStateTransitionTests(): Promise<TestSuiteResult> {
   const suiteStart = performance.now();
   const tests: TestResult[] = [];
   tests.push(await testStartCreatesOneRunningJobAndSession());
   tests.push(await testStopClosesSessionAndAddsDuration());
   tests.push(await testRepeatedStartStopAccumulates());
   tests.push(await testEndWhileStoppedPreservesTotal());
   tests.push(await testEndWhileRunningClosesOneSession());
   tests.push(await testSecondEndOnEndedJobRejected());
   tests.push(await testTwoMaterialsSameBatch());
   return {
     tests,
     elapsedMs: performance.now() - suiteStart,
   };
 }
 