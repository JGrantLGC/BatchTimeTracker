import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
import type { MaterialBatchSession } from "@/api/models/MaterialBatchSession";
import {
  fetchUtilizationSettings,
  fetchBusinessDayCalendar,
  calculateUtilization,
  getMonthName,
} from "@/lib/utilization";
import { formatHMS, formatDateTime } from "@/lib/time-utils";
import { LGCLogo, BrandHexPattern } from "@/components/system/LGCLogo";
import { DEPARTMENTS } from "@/lib/app-context";

function utilizationColor(
  currentPct: number,
  targetPct: number,
): { text: string; bg: string; ring: string; label: string } {
  if (currentPct >= targetPct) {
    return {
      text: "text-status-running",
      bg: "bg-status-running",
      ring: "text-status-running",
      label: "On Track",
    };
  }
  if (currentPct >= targetPct - 10) {
    return {
      text: "text-status-stopped",
      bg: "bg-status-stopped",
      ring: "text-status-stopped",
      label: "Near Target",
    };
  }
  return {
    text: "text-status-error",
    bg: "bg-status-error",
    ring: "text-status-error",
    label: "Below Target",
  };
}

interface DeptSessionData {
  department: string;
  current: number;
  completed: number;
  totalSeconds: number;
}

const ENDED_STATUSES = new Set(["Ended", "ClosedByEnd", "Completed"]);

const REFRESH_INTERVAL_MS = 30_000;

function liveDurationSeconds(startTime: string): number {
  const start = new Date(startTime).getTime();
  return Math.max(0, Math.floor((Date.now() - start) / 1000));
}

export default function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const [, setTick] = useState(0);

  useEffect(() => {
    document.body.classList.add("bg-black");
    return () => document.body.classList.remove("bg-black");
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const settingsQuery = useQuery({
    queryKey: ["utilization-settings"],
    queryFn: fetchUtilizationSettings,
  });

  const calendarQuery = useQuery({
    queryKey: ["business-day-calendar", year, month],
    queryFn: () => fetchBusinessDayCalendar(year, month),
  });

  const sessionsQuery = useQuery({
    queryKey: ["sessions-all"],
    queryFn: () => MaterialBatchSessionService.getAll(),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const loading =
    settingsQuery.isLoading || calendarQuery.isLoading || sessionsQuery.isLoading;
  const error =
    settingsQuery.error?.message ??
    calendarQuery.error?.message ??
    sessionsQuery.error?.message ??
    null;

  const calc = useMemo(() => {
    if (!settingsQuery.data || !calendarQuery.data || !sessionsQuery.data) return null;
    const monthStart = new Date(year, month, 1).toISOString();
    const monthEnd = new Date(year, month + 1, 1).toISOString();
    const currentSeconds = sessionsQuery.data
      .filter((s) => {
        const st = new Date(s.StartTime).toISOString();
        return st >= monthStart && st < monthEnd;
      })
      .reduce((sum, s) => {
        if (s.SessionStatus === "Running") {
          return sum + liveDurationSeconds(s.StartTime);
        }
        return sum + (s.DurationSeconds ?? 0);
      }, 0);
    return calculateUtilization(
      currentSeconds,
      settingsQuery.data,
      calendarQuery.data,
      now,
    );
  }, [settingsQuery.data, calendarQuery.data, sessionsQuery.data, year, month, now]);

  const deptData = useMemo<DeptSessionData[]>(() => {
    if (!sessionsQuery.data) return [];
    const monthStart = new Date(year, month, 1).toISOString();
    const monthEnd = new Date(year, month + 1, 1).toISOString();
    const map = new Map<string, DeptSessionData>();
    for (const dept of DEPARTMENTS) {
      map.set(dept, { department: dept, current: 0, completed: 0, totalSeconds: 0 });
    }
    map.set("Unassigned", {
      department: "Unassigned",
      current: 0,
      completed: 0,
      totalSeconds: 0,
    });
    for (const s of sessionsQuery.data) {
      const st = new Date(s.StartTime).toISOString();
      if (st < monthStart || st >= monthEnd) continue;
      const deptKey = s.Department ?? "Unassigned";
      const entry = map.get(deptKey);
      if (!entry) continue;
      if (s.SessionStatus === "Running") {
        entry.current++;
        entry.totalSeconds += liveDurationSeconds(s.StartTime);
      } else {
        entry.completed++;
        entry.totalSeconds += s.DurationSeconds ?? 0;
      }
    }
    return Array.from(map.values()).filter(
      (d) => d.current > 0 || d.completed > 0,
    );
  }, [sessionsQuery.data, year, month]);

  const activeSessions = useMemo<MaterialBatchSession[]>(() => {
    if (!sessionsQuery.data) return [];
    return sessionsQuery.data
      .filter((s) => !ENDED_STATUSES.has(s.SessionStatus))
      .sort((a, b) => new Date(b.StartTime).getTime() - new Date(a.StartTime).getTime());
  }, [sessionsQuery.data]);

  if (loading) {
    return (
      <div className="min-h-svh grid place-items-center text-sm text-neutral-400 bg-black">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-svh grid place-items-center p-6 bg-black">
        <div className="rounded-md border border-status-error/40 bg-status-error/10 px-4 py-3 text-sm text-status-error">
          {error}
        </div>
      </div>
    );
  }

  if (!calc) {
    return (
      <div className="min-h-svh grid place-items-center p-6 bg-black">
        <div className="rounded-md border border-neutral-700 px-4 py-3 text-sm text-neutral-400">
          No data available.
        </div>
      </div>
    );
  }

  const currentPct = Math.round(calc.currentUtilization * 10) / 10;
  const targetPct = calc.targetUtilization;
  const colors = utilizationColor(currentPct, targetPct);
  const gaugePct = Math.min(currentPct, 100);

  return (
    <div className="flex flex-col min-h-svh bg-black text-neutral-100">
      {/* Branded header */}
      <header className="border-b border-neutral-800 bg-brand-lead text-white shadow-sm relative overflow-hidden">
        <BrandHexPattern className="absolute inset-0 h-full w-full text-white opacity-25" />
        <div className="relative mx-auto w-full max-w-7xl px-4 md:px-8 h-20 flex items-center gap-4">
          <div className="flex items-center gap-4">
            <LGCLogo variant="reversed" className="h-11 md:h-12 w-auto" />
            <div className="hidden md:block h-10 w-px bg-white/30" aria-hidden="true" />
            <div className="hidden md:flex flex-col leading-tight">
              <span className="text-xs uppercase tracking-widest text-white/75 font-semibold">
                Cumberland Manufacturing
              </span>
              <span className="text-base md:text-lg font-bold tracking-tight">
                Utilization Dashboard
              </span>
            </div>
          </div>
          <div className="ml-auto">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-md bg-white/15 px-3 py-2 text-sm font-semibold text-white/90 transition-colors hover:bg-white/25"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back to Tracker</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Fixed top section: utilization display */}
      <div className="shrink-0 border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto w-full max-w-7xl px-4 md:px-8 py-6 md:py-8">
          <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
            {/* Dial indicator */}
            <div className="relative shrink-0">
              <svg viewBox="0 0 200 200" className="h-40 w-40 md:h-48 md:w-48">
                <circle
                  cx="100"
                  cy="100"
                  r="85"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="14"
                  className="text-neutral-700"
                />
                <circle
                  cx="100"
                  cy="100"
                  r="85"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="14"
                  strokeLinecap="round"
                  className={colors.ring}
                  strokeDasharray={`${(gaugePct / 100) * 534} 534`}
                  transform="rotate(-90 100 100)"
                  style={{ transition: "stroke-dasharray 0.6s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-2xl md:text-3xl font-bold ${colors.text}`}>
                  {currentPct.toFixed(1)}%
                </span>
                <span className="text-[10px] uppercase tracking-wider text-neutral-500 mt-0.5">
                  Utilization
                </span>
              </div>
            </div>

            {/* Prominent utilization number */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center gap-3 justify-center md:justify-start">
                <span className="text-5xl md:text-7xl font-bold tracking-tight tabular-nums">
                  <span className={colors.text}>{currentPct.toFixed(1)}%</span>
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold ${colors.bg}/15 ${colors.text}`}
                >
                  {colors.label}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-400">
                Current utilization for {getMonthName(month)} {year}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 justify-center md:justify-start text-sm">
                <span className="text-neutral-400">
                  Target:{" "}
                  <span className="font-semibold text-neutral-100">
                    {targetPct.toFixed(1)}%
                  </span>
                </span>
                <span className="text-neutral-400">
                  Accumulated:{" "}
                  <span className="font-semibold font-mono text-neutral-100">
                    {formatHMS(calc.currentSeconds)}
                  </span>{" "}
                  <span className="text-xs">({calc.currentHours.toFixed(1)}h)</span>
                </span>
                <span className="text-neutral-400">
                  Target hours MTD:{" "}
                  <span className="font-semibold text-neutral-100">
                    {calc.targetHoursElapsed.toFixed(1)}h
                  </span>
                </span>
                <span className="text-neutral-400">
                  Business days:{" "}
                  <span className="font-semibold text-neutral-100">
                    {calc.businessDaysElapsed}/{calc.totalBusinessDays}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable sessions section */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 md:px-8 py-6 space-y-8">
          {/* Department totals */}
          <section>
            <h2 className="text-lg font-bold tracking-tight mb-1 text-neutral-100">
              Sessions by Department — {getMonthName(month)} {year}
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              Current (running) and completed sessions for each department this month.
            </p>

            {deptData.length === 0 ? (
              <div className="rounded-lg border border-neutral-800 p-8 text-center text-sm text-neutral-400">
                No sessions recorded this month yet.
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-neutral-300">Department</th>
                      <th className="text-center px-4 py-3 font-semibold text-neutral-300">
                        Current Sessions
                      </th>
                      <th className="text-center px-4 py-3 font-semibold text-neutral-300">
                        Completed Sessions
                      </th>
                      <th className="text-right px-4 py-3 font-semibold text-neutral-300">
                        Total Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deptData.map((d) => (
                      <tr key={d.department} className="border-t border-neutral-800">
                        <td className="px-4 py-3 font-medium capitalize text-neutral-100">
                          {d.department}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {d.current > 0 ? (
                            <span className="inline-flex items-center rounded-full bg-status-running/15 px-2.5 py-0.5 text-sm font-semibold text-status-running">
                              {d.current}
                            </span>
                          ) : (
                            <span className="text-neutral-500">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-neutral-100">
                          {d.completed}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-neutral-100">
                          {formatHMS(d.totalSeconds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Active / Stopped sessions */}
          <section>
            <h2 className="text-lg font-bold tracking-tight mb-1 text-neutral-100">
              Active Sessions
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              All sessions that are currently running or stopped (not ended).
            </p>

            {activeSessions.length === 0 ? (
              <div className="rounded-lg border border-neutral-800 p-8 text-center text-sm text-neutral-400">
                No active or stopped sessions.
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-800 overflow-hidden">
                <div className="max-h-[400px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-900 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold text-neutral-300">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-neutral-300">Operator</th>
                        <th className="text-left px-4 py-3 font-semibold text-neutral-300">Department</th>
                        <th className="text-left px-4 py-3 font-semibold text-neutral-300">Material</th>
                        <th className="text-left px-4 py-3 font-semibold text-neutral-300">Batch</th>
                        <th className="text-left px-4 py-3 font-semibold text-neutral-300">Started</th>
                        <th className="text-right px-4 py-3 font-semibold text-neutral-300">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSessions.map((s) => {
                        const isRunning = s.SessionStatus === "Running";
                        const rowBg = isRunning
                          ? "bg-status-running/10"
                          : "bg-sky-500/10";
                        return (
                          <tr key={s.ID} className={`border-t border-neutral-800 ${rowBg}`}>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                                  isRunning
                                    ? "border-status-running/40 bg-status-running/20 text-status-running"
                                    : "border-sky-400/40 bg-sky-400/20 text-sky-400"
                                }`}
                              >
                                {s.SessionStatus}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-neutral-200">
                              {s.OperatorName ?? "—"}
                            </td>
                            <td className="px-4 py-3 capitalize text-neutral-200">
                              {s.Department ?? "Unassigned"}
                            </td>
                            <td className="px-4 py-3 text-neutral-200">
                              <div className="font-medium">{s.MaterialNumber}</div>
                              {s.MaterialDescription && (
                                <div className="text-xs text-neutral-500">{s.MaterialDescription}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-neutral-200">
                              {s.BatchNumber}
                            </td>
                            <td className="px-4 py-3 text-neutral-300">
                              {formatDateTime(s.StartTime)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-neutral-100">
                              {isRunning
                                ? formatHMS(liveDurationSeconds(s.StartTime))
                                : s.DurationSeconds != null ? formatHMS(s.DurationSeconds) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <p className="text-center text-xs text-neutral-500 pb-4">
            Cumberland Manufacturing &bull; Operational time capture. Not payroll,
            attendance, or performance data.
          </p>
        </div>
      </div>
    </div>
  );
}
