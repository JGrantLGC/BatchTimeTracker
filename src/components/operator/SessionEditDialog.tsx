import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Loader2 } from "lucide-react";
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
import type { MaterialBatchSession } from "@/api/models/MaterialBatchSession";
import { formatHMS, formatDateTime } from "@/lib/time-utils";

export type EditMode = "edit" | "add" | "delete";

interface SessionEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EditMode;
  session: MaterialBatchSession | null;
  onConfirm: (patch: SessionEditPatch) => Promise<void>;
}

export interface SessionEditPatch {
  durationSeconds?: number;
  startTime?: string;
  operatorName?: string;
  department?: string;
}

function parseDurationToSeconds(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const hms = trimmed.match(/^(\d+):([0-5]?\d):([0-5]?\d)$/);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }
  const hm = trimmed.match(/^(\d+):([0-5]?\d)$/);
  if (hm) {
    return parseInt(hm[1], 10) * 3600 + parseInt(hm[2], 10) * 60;
  }
  return null;
}

export function SessionEditDialog({
  open,
  onOpenChange,
  mode,
  session,
  onConfirm,
}: SessionEditDialogProps) {
  const [durationStr, setDurationStr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && session && mode === "edit") {
      setDurationStr(formatHMS(session.DurationSeconds ?? 0));
    } else if (open && mode === "add") {
      setDurationStr("");
    }
    setError(null);
  }, [open, session, mode]);

  async function handleConfirm() {
    setError(null);
    if (mode === "delete") {
      setBusy(true);
      try {
        await onConfirm({});
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to delete session.");
      } finally {
        setBusy(false);
      }
      return;
    }

    const seconds = parseDurationToSeconds(durationStr);
    if (seconds === null || seconds < 0) {
      setError("Enter a valid duration: seconds (e.g. 900), HH:MM:SS, or HH:MM.");
      return;
    }
    if (mode === "add" && seconds <= 0) {
      setError("Added time must be greater than zero.");
      return;
    }
    if (mode === "edit" && seconds <= 0) {
      setError("Duration must be greater than zero.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "add" && session) {
        const newTotal = (session.DurationSeconds ?? 0) + seconds;
        await onConfirm({ durationSeconds: newTotal });
      } else if (mode === "edit" && session) {
        await onConfirm({ durationSeconds: seconds });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "edit"
      ? "Edit Session Time"
      : mode === "add"
        ? "Add Time to Session"
        : "Delete Session";

  const description =
    mode === "edit"
      ? "Manually adjust the recorded duration for this session."
      : mode === "add"
        ? "Add additional time to this session's recorded duration."
        : "Permanently delete this session record. This cannot be undone.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "edit" && <Pencil className="h-5 w-5" />}
            {mode === "add" && <Plus className="h-5 w-5" />}
            {mode === "delete" && <Trash2 className="h-5 w-5 text-status-error" />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {session && (
          <div className="rounded-md border p-3 bg-muted/40 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">JobKey:</span>{" "}
              <span className="font-mono">{session.JobKey}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Material:</span>{" "}
              {session.MaterialNumber}
            </div>
            <div>
              <span className="text-muted-foreground">Operator:</span>{" "}
              {session.OperatorName ?? session.OperatorEmail ?? "—"}
            </div>
            <div>
              <span className="text-muted-foreground">Start:</span>{" "}
              {formatDateTime(session.StartTime)}
            </div>
            <div>
              <span className="text-muted-foreground">Current duration:</span>{" "}
              <span className="font-mono font-semibold">{formatHMS(session.DurationSeconds ?? 0)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              {session.SessionStatus}
            </div>
          </div>
        )}

        {mode !== "delete" && (
          <div className="space-y-2">
            <Label htmlFor="session-duration">
              {mode === "add" ? "Time to add" : "New total duration"}
            </Label>
            <Input
              id="session-duration"
              value={durationStr}
              onChange={(e) => setDurationStr(e.target.value)}
              placeholder="HH:MM:SS or seconds (e.g. 00:15:00 or 900)"
              className="font-mono"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {mode === "add"
                ? `This will be added to the current ${formatHMS(session?.DurationSeconds ?? 0)}.`
                : "Set the total duration for this session."}
            </p>
          </div>
        )}

        {mode === "delete" && (
          <p className="text-sm text-status-error font-medium">
            Are you sure? This session will be permanently removed.
          </p>
        )}

        {error && (
          <p className="text-sm text-status-error font-medium">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={busy}
            className={mode === "delete" ? "bg-status-error hover:bg-status-error/90 text-white" : ""}
          >
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {mode === "edit" && "Save Changes"}
            {mode === "add" && "Add Time"}
            {mode === "delete" && "Delete Session"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
