import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Play,
  Square,
  StopCircle,
  RotateCcw,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  Info,
  UserCircle2,
  History,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/operator/StatusBadge";
import { SessionEditDialog, type EditMode } from "@/components/operator/SessionEditDialog";
import {
  getBarcodeDelimiter,
  getCurrentOperator,
  isAuthorizedUser,
} from "@/lib/app-context";
import { parseBarcode } from "@/lib/barcode";
import { formatDateTime, formatHMS, nowIso, secondsBetween } from "@/lib/time-utils";
import { MaterialBatchJobService } from "@/api/services/MaterialBatchJobService";
import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
import type { MaterialBatchJob } from "@/api/models/MaterialBatchJob";
import type { MaterialBatchSession } from "@/api/models/MaterialBatchSession";
import { lookupMaterial } from "@/lib/material-catalog";
type UiFeedback = { kind: "info" | "success" | "warning" | "error"; message: string } | null;
interface Resolved {
  raw: string;
  materialNumber: string;
  batchNumber: string;
  jobKey: string;
  materialDescription: string;
  materialActive: boolean;
}
export default function OperatorPage() {
  const queryClient = useQueryClient();
  const [rawInput, setRawInput] = useState("");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [feedback, setFeedback] = useState<UiFeedback>(null);
  const [tick, setTick] = useState(0);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionData, setCompletionData] = useState<{
    materialNumber: string;
    materialDescription: string;
    batchNumber: string;
    totalSeconds: number;
  } | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("edit");
  const [editSession, setEditSession] = useState<MaterialBatchSession | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const operator = getCurrentOperator();
  // Fetch job for the resolved JobKey
  const jobQuery = useQuery({
    queryKey: ["job", resolved?.jobKey],
    queryFn: async () => {
      if (!resolved) return null;
      const list = await MaterialBatchJobService.getAll();
      return list.find((j) => j.JobKey === resolved.jobKey) ?? null;
    },
    enabled: !!resolved,
  });
  const sessionsQuery = useQuery({
    queryKey: ["sessions", resolved?.jobKey],
    queryFn: async () => {
      if (!resolved) return [];
      const list = await MaterialBatchSessionService.getAll();
      return list
        .filter((s) => s.JobKey === resolved.jobKey)
        .sort(
          (a, b) => new Date(b.StartTime).getTime() - new Date(a.StartTime).getTime(),
        );
    },
    enabled: !!resolved,
  });
  const operatorSessionsQuery = useQuery({
    queryKey: ["operator-sessions", operator.name],
    queryFn: async () => {
      const list = await MaterialBatchSessionService.getAll();
      return list
        .filter(
          (s) =>
            s.OperatorName?.toLowerCase() === operator.name.toLowerCase(),
        )
        .sort(
          (a, b) => new Date(b.StartTime).getTime() - new Date(a.StartTime).getTime(),
        )
        .slice(0, 10);
    },
  });
  const job = jobQuery.data ?? null;
  const sessions = sessionsQuery.data ?? [];
  const operatorSessions = operatorSessionsQuery.data ?? [];
  // 1-second ticker used only when Running
  useEffect(() => {
    if (job?.JobStatus !== "Running") return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [job?.JobStatus]);
  // Autofocus scanner input on mount and after resets
  useEffect(() => {
    scannerInputRef.current?.focus();
  }, []);
  const runningOtherOperator = useMemo(() => {
    if (job?.JobStatus !== "Running") return null;
    const openSession = sessions.find((s) => s.SessionStatus === "Running");
    if (!openSession) return null;
    if (
      openSession.OperatorEmail &&
      openSession.OperatorEmail.toLowerCase() !== operator.email.toLowerCase()
    ) {
      return openSession;
    }
    return null;
  }, [job?.JobStatus, sessions, operator.email]);
  const canManageForeignRunning =
    !runningOtherOperator || isAuthorizedUser(operator.email);
  const displayedSeconds = useMemo(() => {
    if (!job) return 0;
    if (job.JobStatus === "Running" && job.CurrentStartTime) {
      const base = job.TotalSeconds ?? 0;
      const extra = secondsBetween(job.CurrentStartTime, nowIso());
      return base + Math.max(0, extra);
    }
    return job.TotalSeconds ?? 0;
    // depend on tick so the ticking happens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, tick]);
  function resetInput() {
    setResolved(null);
    setRawInput("");
    setFeedback(null);
    // don't touch stored data
    setTimeout(() => scannerInputRef.current?.focus(), 0);
  }
  function processBarcode(raw: string) {
    const delimiter = getBarcodeDelimiter();
    const parsed = parseBarcode(raw, delimiter);
    if (!parsed.ok) {
      setResolved(null);
      setFeedback({ kind: "error", message: parsed.error });
      return;
    }
    const material = lookupMaterial(parsed.materialNumber);
    if (!material) {
      setResolved(null);
      setFeedback({
        kind: "error",
        message: `Material ${parsed.materialNumber} not found in MaterialMaster.`,
      });
      return;
    }
    const active = material.materialStatus === "Active";
    setResolved({
      raw: parsed.raw,
      materialNumber: parsed.materialNumber,
      batchNumber: parsed.batchNumber,
      jobKey: parsed.jobKey,
      materialDescription: material.materialDescription,
      materialActive: active,
    });
    if (!active) {
      setFeedback({
        kind: "error",
        message: `Material ${parsed.materialNumber} is Inactive. Start disabled.`,
      });
    } else {
      setFeedback({ kind: "success", message: "Barcode accepted." });
    }
  }
  const startMutation = useMutation({
    mutationFn: async () => {
      if (!resolved) throw new Error("No resolved barcode.");
      if (!resolved.materialActive) throw new Error("Material is Inactive.");
      // Re-check current job state right before write (S4)
      const all = await MaterialBatchJobService.getAll();
      const existing = all.find((j) => j.JobKey === resolved.jobKey) ?? null;
      if (existing?.JobStatus === "Running")
        throw new Error("This JobKey is already Running.");
      if (existing?.JobStatus === "Ended")
        throw new Error("This JobKey is Ended and cannot restart.");
      // Concurrency ownership gate: if there is an open Running session by
      // someone else (edge case), block for non-authorized users.
      const sessionsAll = await MaterialBatchSessionService.getAll();
      const openSession = sessionsAll.find(
        (s) => s.JobKey === resolved.jobKey && s.SessionStatus === "Running",
      );
      if (
        openSession &&
        openSession.OperatorEmail &&
        openSession.OperatorEmail.toLowerCase() !== operator.email.toLowerCase() &&
        !isAuthorizedUser(operator.email)
      ) {
        throw new Error(
          `This JobKey is Running under another operator (${openSession.OperatorName ?? openSession.OperatorEmail}).`,
        );
      }
      const startTime = nowIso();
      let jobRow: MaterialBatchJob;
      if (!existing) {
        jobRow = await MaterialBatchJobService.create({
          JobKey: resolved.jobKey,
          RawBarcode: resolved.raw,
          MaterialNumber: resolved.materialNumber,
          MaterialDescription: resolved.materialDescription,
          BatchNumber: resolved.batchNumber,
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
          // preserve existing TotalSeconds
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
        Department: operator.department,
      });
      return jobRow;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job", resolved?.jobKey] });
      queryClient.invalidateQueries({ queryKey: ["sessions", resolved?.jobKey] });
      queryClient.invalidateQueries({ queryKey: ["operator-sessions", operator.name] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
      setFeedback({ kind: "success", message: "Timer started." });
    },
    onError: (e: unknown) =>
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to Start.",
      }),
  });
  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!resolved || !job) throw new Error("No active job.");
      if (job.JobStatus !== "Running")
        throw new Error("Job is not Running.");
      if (
        runningOtherOperator &&
        !isAuthorizedUser(operator.email)
      ) {
        throw new Error(
          "You are not authorized to Stop another operator's running job.",
        );
      }
      const allSessions = await MaterialBatchSessionService.getAll();
      const open = allSessions.find(
        (s) => s.JobKey === job.JobKey && s.SessionStatus === "Running",
      );
      if (!open) throw new Error("No open Running session was found.");
      const stopTime = nowIso();
      const duration = secondsBetween(open.StartTime, stopTime);
      if (duration <= 0) throw new Error("Duration must be greater than 0.");
      await MaterialBatchSessionService.update(open.ID, {
        StopTime: stopTime,
        DurationSeconds: duration,
        SessionStatus: "Completed",
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
    },
    onSuccess: (dur) => {
      queryClient.invalidateQueries({ queryKey: ["job", resolved?.jobKey] });
      queryClient.invalidateQueries({ queryKey: ["sessions", resolved?.jobKey] });
      queryClient.invalidateQueries({ queryKey: ["operator-sessions", operator.name] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
      setFeedback({
        kind: "success",
        message: `Timer stopped. Added ${formatHMS(dur)} to accumulated total.`,
      });
    },
    onError: (e: unknown) =>
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to Stop.",
      }),
  });
  const endMutation = useMutation({
    mutationFn: async () => {
      if (!resolved || !job) throw new Error("No active job.");
      if (job.JobStatus === "Ended")
        throw new Error("Job is already Ended.");
      if (
        job.JobStatus === "Running" &&
        runningOtherOperator &&
        !isAuthorizedUser(operator.email)
      ) {
        throw new Error(
          "You are not authorized to End another operator's running job.",
        );
      }
      const endTime = nowIso();
      let addedFromClose = 0;
      if (job.JobStatus === "Running") {
        const allSessions = await MaterialBatchSessionService.getAll();
        const open = allSessions.find(
          (s) => s.JobKey === job.JobKey && s.SessionStatus === "Running",
        );
        if (open) {
          const duration = secondsBetween(open.StartTime, endTime);
          if (duration <= 0)
            throw new Error("Session duration must be greater than 0.");
          await MaterialBatchSessionService.update(open.ID, {
            StopTime: endTime,
            DurationSeconds: duration,
            SessionStatus: "ClosedByEnd",
          });
          addedFromClose = duration;
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
      return { finalTotal };
    },
    onSuccess: ({ finalTotal }) => {
      queryClient.invalidateQueries({ queryKey: ["job", resolved?.jobKey] });
      queryClient.invalidateQueries({ queryKey: ["sessions", resolved?.jobKey] });
      queryClient.invalidateQueries({ queryKey: ["operator-sessions", operator.name] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
      if (resolved) {
        setCompletionData({
          materialNumber: resolved.materialNumber,
          materialDescription: resolved.materialDescription,
          batchNumber: resolved.batchNumber,
          totalSeconds: finalTotal,
        });
        setCompletionOpen(true);
      }
      setFeedback({
        kind: "success",
        message: `Job ended. Final total ${formatHMS(finalTotal)}.`,
      });
    },
    onError: (e: unknown) =>
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to End.",
      }),
  });
  const editSessionMutation = useMutation({
    mutationFn: async (vars: { id: string; durationSeconds: number }) => {
      await MaterialBatchSessionService.update(vars.id, {
        DurationSeconds: vars.durationSeconds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions", resolved?.jobKey] });
      queryClient.invalidateQueries({ queryKey: ["operator-sessions", operator.name] });
      queryClient.invalidateQueries({ queryKey: ["sessions-all"] });
      setFeedback({ kind: "success", message: "Session time updated." });
    },
    onError: (e: unknown) =>
      setFeedback({
        kind: "error",
        message: e instanceof Error ? e.message : "Failed to update session.",
      }),
  });
  const busy =
    startMutation.isPending || stopMutation.isPending || endMutation.isPending;
  const canStart =
    !!resolved &&
    resolved.materialActive &&
    (!job || (job.JobStatus !== "Running" && job.JobStatus !== "Ended")) &&
    (!runningOtherOperator || isAuthorizedUser(operator.email)) &&
    !busy;
  const canStop =
    !!job &&
    job.JobStatus === "Running" &&
    canManageForeignRunning &&
    !busy;
  const canEnd =
    !!job &&
    job.JobStatus !== "Ended" &&
    (job.JobStatus !== "Running" ||
      !runningOtherOperator ||
      isAuthorizedUser(operator.email)) &&
    !busy;
  const currentStatus: string = job?.JobStatus ?? "New";
  // Status band styling for the hero time panel
  const statusStyles: Record<
    string,
    { border: string; bg: string; text: string; ring: string }
  > = {
    New: {
      border: "border-status-new/40",
      bg: "bg-status-new/5",
      text: "text-status-new",
      ring: "",
    },
    Running: {
      border: "border-status-running/50",
      bg: "bg-status-running/10",
      text: "text-status-running",
      ring: "shadow-[0_0_0_1px_var(--color-status-running)]",
    },
    Stopped: {
      border: "border-status-stopped/50",
      bg: "bg-status-stopped/10",
      text: "text-status-stopped",
      ring: "",
    },
    Ended: {
      border: "border-status-ended/50",
      bg: "bg-status-ended/10",
      text: "text-status-ended",
      ring: "",
    },
    Error: {
      border: "border-status-error/50",
      bg: "bg-status-error/10",
      text: "text-status-error",
      ring: "",
    },
  };
  const style =
    statusStyles[currentStatus] ??
    statusStyles.New;
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {/* Ambient status band across the top of the viewport */}
      <div
        aria-hidden="true"
        className={`h-1 w-full rounded-full ${
          currentStatus === "Running"
            ? "bg-status-running animate-pulse"
            : currentStatus === "Stopped"
              ? "bg-status-stopped"
              : currentStatus === "Ended"
                ? "bg-status-ended"
                : currentStatus === "Error"
                  ? "bg-status-error"
                  : "bg-status-new/40"
        }`}
      />
      {/* Compact input + scan row */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <div>
          <Label htmlFor="scanner-input" className="text-sm md:text-base font-semibold">
            Scan or type barcode
          </Label>
          <Input
            id="scanner-input"
            ref={scannerInputRef}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                processBarcode(rawInput);
              }
            }}
            placeholder="e.g. 68-000018|10643441A"
            className="h-14 md:h-16 text-lg md:text-xl tracking-wider font-mono"
            aria-label="Scan or type barcode"
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => processBarcode(rawInput)}
            className="h-14 md:h-16 px-6 md:px-7 text-base md:text-lg font-bold"
            aria-label="Process typed barcode"
          >
            <ScanLine className="mr-2 h-5 w-5" />
            Scan
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setCameraOpen(true)}
            className="h-14 md:h-16 px-4 md:px-5 text-base md:text-lg font-semibold"
            aria-label="Open camera to scan"
          >
            <Camera className="mr-2 h-5 w-5" />
            Camera
          </Button>
        </div>
      </div>
      {/* Feedback strip — one line, changes tone */}
      <div className="min-h-9">
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm md:text-base font-semibold ${
              feedback.kind === "error"
                ? "bg-status-error/10 text-status-error"
                : feedback.kind === "warning"
                  ? "bg-status-stopped/15 text-status-stopped"
                  : feedback.kind === "success"
                    ? "bg-status-running/10 text-status-running"
                    : "bg-muted text-foreground"
            }`}
          >
            {feedback.kind === "error" ? (
              <AlertTriangle className="h-4 w-4" />
            ) : feedback.kind === "warning" ? (
              <ShieldAlert className="h-4 w-4" />
            ) : feedback.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Info className="h-4 w-4" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </div>
      {/* HERO: status + accumulated time panel — the visually dominant element */}
      <div
        className={`rounded-2xl border-2 ${style.border} ${style.bg} ${style.ring} px-4 md:px-6 py-4 md:py-5`}
      >
        <div className="flex flex-wrap items-center gap-3 justify-between mb-2">
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={currentStatus} className="text-base md:text-lg px-3 py-1.5" />
            {runningOtherOperator && (
              <span className="inline-flex items-center gap-2 rounded-md bg-status-stopped/15 text-status-stopped px-2.5 py-1 text-xs md:text-sm font-semibold">
                <ShieldAlert className="h-4 w-4" />
                Running by {runningOtherOperator.OperatorName ?? runningOtherOperator.OperatorEmail}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
            <UserCircle2 className="h-4 w-4" />
            <span>Signed in: <span className="font-semibold text-foreground">{operator.name}</span></span>
            {isAuthorizedUser(operator.email) && (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                Authorized
              </span>
            )}
          </div>
        </div>
        {/* Identifier strip — compact so it doesn't fight the time */}
        {resolved && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 mb-3 text-xs md:text-sm">
            <div>
              <span className="text-muted-foreground">Material</span>{" "}
              <span className="font-mono font-bold">{resolved.materialNumber}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Batch</span>{" "}
              <span className="font-mono font-bold">{resolved.batchNumber}</span>
            </div>
            <div className="truncate">
              <span className="text-muted-foreground">Desc</span>{" "}
              <span className="font-semibold">{resolved.materialDescription}</span>
            </div>
          </div>
        )}
        {/* THE TIME */}
        <div
          aria-live="polite"
          aria-label="Accumulated time"
          className={`text-center font-mono font-black tabular-nums leading-none tracking-tight ${style.text} ${
            currentStatus === "Running" ? "drop-shadow-sm" : ""
          }`}
          style={{ fontSize: "clamp(4rem, 15vw, 9rem)" }}
        >
          {formatHMS(displayedSeconds)}
        </div>
      </div>
      {/* Action buttons — large touch targets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        <Button
          type="button"
          onClick={() => startMutation.mutate()}
          disabled={!canStart}
          className="h-20 md:h-24 text-lg md:text-xl font-bold bg-status-running hover:bg-status-running/90"
          aria-label="Start timer"
        >
          <Play className="mr-2 h-6 w-6 md:h-7 md:w-7" />
          Start
        </Button>
        <Button
          type="button"
          onClick={() => stopMutation.mutate()}
          disabled={!canStop}
          variant="secondary"
          className="h-20 md:h-24 text-lg md:text-xl font-bold bg-status-stopped/15 hover:bg-status-stopped/25 text-status-stopped border border-status-stopped/40"
          aria-label="Stop timer"
        >
          <Square className="mr-2 h-6 w-6 md:h-7 md:w-7" />
          Stop
        </Button>
        <Button
          type="button"
          onClick={() => setConfirmEndOpen(true)}
          disabled={!canEnd}
          className="h-20 md:h-24 text-lg md:text-xl font-bold bg-status-ended hover:bg-status-ended/90 text-white"
          aria-label="End job"
        >
          <StopCircle className="mr-2 h-6 w-6 md:h-7 md:w-7" />
          End
        </Button>
        <Button
          type="button"
          onClick={resetInput}
          variant="outline"
          className="h-20 md:h-24 text-lg md:text-xl font-bold"
          aria-label="Reset scanner"
        >
          <RotateCcw className="mr-2 h-6 w-6 md:h-7 md:w-7" />
          Reset
        </Button>
      </div>
      {/* Collapsible session history so it never pushes primary controls below the fold */}
      <div className="rounded-lg border bg-card">
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left font-semibold text-sm md:text-base"
          aria-expanded={historyOpen}
        >
          <span className="inline-flex items-center gap-2">
            <History className="h-4 w-4" />
            My Recent Sessions
          </span>
          {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {historyOpen && (
          <div className="border-t px-3 py-2 max-h-60 overflow-auto">
            {operatorSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sessions yet. Start a timer to begin recording history.
              </p>
            ) : (
              <table className="w-full text-xs md:text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left py-1 pr-2">Start</th>
                    <th className="text-left py-1 pr-2">Stop</th>
                    <th className="text-left py-1 pr-2">Duration</th>
                    <th className="text-left py-1 pr-2">Status</th>
                    <th className="text-left py-1">JobKey</th>
                    <th className="text-right py-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {operatorSessions.map((s: MaterialBatchSession) => (
                    <tr key={s.ID} className="border-t">
                      <td className="py-1.5 pr-2 whitespace-nowrap">{formatDateTime(s.StartTime)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">
                        {s.SessionStatus === "Running" ? (
                          <span className="text-status-running font-semibold">Running</span>
                        ) : (
                          formatDateTime(s.StopTime)
                        )}
                      </td>
                      <td className="py-1.5 pr-2 font-mono tabular-nums">
                        {s.SessionStatus === "Running"
                          ? "—"
                          : formatHMS(s.DurationSeconds ?? 0)}
                      </td>
                      <td className="py-1.5 pr-2">{s.SessionStatus}</td>
                      <td className="py-1.5 font-mono text-xs">{s.JobKey}</td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        {s.SessionStatus !== "Running" && (
                          <>
                            <button
                              type="button"
                              title="Edit session time"
                              onClick={() => {
                                setEditMode("edit");
                                setEditSession(s);
                                setEditOpen(true);
                              }}
                              className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Add time to session"
                              onClick={() => {
                                setEditMode("add");
                                setEditSession(s);
                                setEditOpen(true);
                              }}
                              className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      <Separator />
      <p className="text-[11px] text-muted-foreground text-center">
        Operational time capture only. Not payroll, attendance, or employee-performance data.
      </p>
      {/* Confirm End */}
      <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>End this job?</DialogTitle>
            <DialogDescription>
              Ending a job is final. If a session is currently Running it will be
              closed with the current time and marked ClosedByEnd. The job cannot be
              restarted.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border p-3 bg-muted/40 text-sm">
            <div><span className="text-muted-foreground">JobKey:</span> <span className="font-mono">{resolved?.jobKey}</span></div>
            <div><span className="text-muted-foreground">Material:</span> {resolved?.materialNumber} — {resolved?.materialDescription}</div>
            <div><span className="text-muted-foreground">Batch:</span> {resolved?.batchNumber}</div>
            <div><span className="text-muted-foreground">Current total:</span> <span className="font-mono">{formatHMS(displayedSeconds)}</span></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmEndOpen(false)} className="min-h-11">
              Cancel
            </Button>
            <Button
              onClick={() => {
                setConfirmEndOpen(false);
                endMutation.mutate();
              }}
              className="bg-status-ended hover:bg-status-ended/90 text-white min-h-11"
            >
              Yes, End Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Completion confirmation dialog */}
      <Dialog open={completionOpen} onOpenChange={setCompletionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-status-ended">
              <CheckCircle2 className="h-5 w-5" />
              Job Ended
            </DialogTitle>
            <DialogDescription>Final total for this job:</DialogDescription>
          </DialogHeader>
          {completionData && (
            <div className="space-y-3">
              <div className="text-4xl md:text-5xl font-mono font-black text-status-ended text-center tabular-nums">
                {formatHMS(completionData.totalSeconds)}
              </div>
              <div className="rounded-md border p-3 bg-muted/40 text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Material Number:</span>{" "}
                  <span className="font-mono font-semibold">{completionData.materialNumber}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Material Description:</span>{" "}
                  <span className="font-semibold">{completionData.materialDescription}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Batch Number:</span>{" "}
                  <span className="font-mono font-semibold">{completionData.batchNumber}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCompletionOpen(false)} className="min-h-11">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Simulated camera scan dialog */}
      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Camera Scan</DialogTitle>
            <DialogDescription>
              Point the camera at the barcode or QR code. This preview offers
              tappable sample codes for verification.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 text-sm">
            {[
              "68-000018|10643441A",
              "72-100001|10643441A",
              "00045678|BATCH-2025-09-24",
              "0100-0013|10643441A",
              "V-104AB|X-002",
              "68-000019|OVER24H",
            ].map((code) => (
              <Button
                key={code}
                variant="outline"
                className="justify-start font-mono min-h-11"
                onClick={() => {
                  setCameraOpen(false);
                  setRawInput(code);
                  processBarcode(code);
                }}
              >
                {code}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCameraOpen(false)} className="min-h-11">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Session edit / add time dialog */}
      <SessionEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode={editMode}
        session={editSession}
        onConfirm={async (patch) => {
          if (!editSession) return;
          if (patch.durationSeconds !== undefined) {
            editSessionMutation.mutate({ id: editSession.ID, durationSeconds: patch.durationSeconds });
          }
          setEditOpen(false);
        }}
      />
    </div>
  );
}
