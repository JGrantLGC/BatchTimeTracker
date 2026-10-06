import { useMemo, useEffect, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, GripVertical, RotateCcw } from "lucide-react";
import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
import type { MaterialBatchSession } from "@/api/models/MaterialBatchSession";
import {
  fetchUtilizationSettings,
  fetchBusinessDayCalendar,
  calculateUtilization,
  getMonthName,
} from "@/lib/utilization";
import { formatHMS } from "@/lib/time-utils";
import { LGCLogo, BrandHexPattern } from "@/components/system/LGCLogo";
import { DEPARTMENTS, getCurrentOperator } from "@/lib/app-context";

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

  const [tick, setTick] = useState(0);
  const operator = getCurrentOperator();
  const columnOrderKey = `lgc:dashboard-column-order:${operator.email.toLowerCase()}`;
  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    try {
      const stored = window.localStorage.getItem(columnOrderKey);
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [draggedDepartment, setDraggedDepartment] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(columnOrderKey, JSON.stringify(columnOrder));
    } catch {
      // Keep the dashboard usable when browser storage is unavailable.
    }
  }, [columnOrder, columnOrderKey]);

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
  }, [settingsQuery.data, calendarQuery.data, sessionsQuery.data, year, month, now, tick]);

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
  }, [sessionsQuery.data, year, month, tick]);

  const activeSessionsByDepartment = useMemo<Array<[string, MaterialBatchSession[]]>>(() => {
    if (!sessionsQuery.data) return [];
    const grouped = new Map<string, MaterialBatchSession[]>();
    for (const session of sessionsQuery.data) {
      if (ENDED_STATUSES.has(session.SessionStatus)) continue;
      const department = session.Department ?? "Unassigned";
      const sessions = grouped.get(department) ?? [];
      sessions.push(session);
      grouped.set(department, sessions);
    }
    for (const sessions of grouped.values()) {
      sessions.sort(
        (a, b) => new Date(b.StartTime).getTime() - new Date(a.StartTime).getTime(),
      );
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => {
      const aOrder = columnOrder.indexOf(a);
      const bOrder = columnOrder.indexOf(b);
      if (aOrder >= 0 || bOrder >= 0) {
        return (aOrder < 0 ? Number.MAX_SAFE_INTEGER : aOrder) -
          (bOrder < 0 ? Number.MAX_SAFE_INTEGER : bOrder);
      }
      const aIndex = DEPARTMENTS.indexOf(a as (typeof DEPARTMENTS)[number]);
      const bIndex = DEPARTMENTS.indexOf(b as (typeof DEPARTMENTS)[number]);
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      return (aIndex < 0 ? DEPARTMENTS.length : aIndex) -
        (bIndex < 0 ? DEPARTMENTS.length : bIndex);
    });
  }, [sessionsQuery.data, columnOrder]);

  function moveDepartment(department: string, direction: -1 | 1): void {
    const departments = activeSessionsByDepartment.map(([name]) => name);
    const index = departments.indexOf(department);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= departments.length) return;
    const next = [...departments];
    [next[index], next[target]] = [next[target], next[index]];
    setColumnOrder(next);
  }

  function resetColumnOrder(): void {
    setColumnOrder([]);
  }

  function handleDepartmentDrop(event: DragEvent<HTMLElement>, targetDepartment: string): void {
    event.preventDefault();
    const sourceDepartment = draggedDepartment;
    setDraggedDepartment(null);
    if (!sourceDepartment || sourceDepartment === targetDepartment) return;
    const departments = activeSessionsByDepartment.map(([name]) => name);
    const sourceIndex = departments.indexOf(sourceDepartment);
    const targetIndex = departments.indexOf(targetDepartment);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const next = [...departments];
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, sourceDepartment);
    setColumnOrder(next);
  }

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
              All sessions that are currently running or stopped, grouped by department.
            </p>

            {activeSessionsByDepartment.length === 0 ? (
              <div className="rounded-lg border border-neutral-800 p-8 text-center text-sm text-neutral-400">
                No active or stopped sessions.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-neutral-500">
                    Drag a department header or use the arrow buttons to reorganize your columns.
                  </p>
                  <button
                    type="button"
                    onClick={resetColumnOrder}
                    className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2.5 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset order
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {activeSessionsByDepartment.map(([department, departmentSessions], index) => (
                  <section
                    key={department}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDepartmentDrop(event, department)}
                    className={`min-w-0 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 ${
                      draggedDepartment === department ? "border-brand-lead" : ""
                    }`}
                  >
                    <div
                      draggable
                      onDragStart={() => setDraggedDepartment(department)}
                      onDragEnd={() => setDraggedDepartment(null)}
                      className="flex cursor-grab items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-3 py-3 active:cursor-grabbing"
                    >
                      <GripVertical className="h-4 w-4 shrink-0 text-neutral-500" />
                      <h3 className="min-w-0 flex-1 truncate font-semibold capitalize text-neutral-100">
                        {department}
                      </h3>
                      <button
                        type="button"
                        title="Move department left"
                        aria-label={`Move ${department} left`}
                        disabled={index === 0}
                        onClick={() => moveDepartment(department, -1)}
                        className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Move department right"
                        aria-label={`Move ${department} right`}
                        disabled={index === activeSessionsByDepartment.length - 1}
                        onClick={() => moveDepartment(department, 1)}
                        className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="h-[420px] overflow-y-auto">
                      <div className="divide-y divide-neutral-800">
                        {departmentSessions.map((s) => {
                          const isRunning = s.SessionStatus === "Running";
                          return (
                            <article
                              key={s.ID}
                              className={`space-y-3 p-4 ${
                                isRunning ? "bg-status-running/10" : "bg-sky-500/10"
                              }`}
                            >
                              <div>
                                <span
                                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
                                    isRunning
                                      ? "border-status-running/40 bg-status-running/20 text-status-running"
                                      : "border-sky-400/40 bg-sky-400/20 text-sky-400"
                                  }`}
                                >
                                  {s.SessionStatus}
                                </span>
                              </div>
                              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                                <dt className="text-neutral-500">Operator</dt>
                                <dd className="truncate text-right text-neutral-200">{s.OperatorName ?? "—"}</dd>
                                <dt className="text-neutral-500">Material</dt>
                                <dd className="min-w-0 text-right text-neutral-200">
                                  <div className="truncate font-mono">{s.MaterialNumber}</div>
                                  {s.MaterialDescription && (
                                    <div className="truncate text-xs text-neutral-500">{s.MaterialDescription}</div>
                                  )}
                                </dd>
                                <dt className="text-neutral-500">Batch</dt>
                                <dd className="truncate text-right font-mono text-neutral-200">{s.BatchNumber}</dd>
                                <dt className="text-neutral-500">Duration</dt>
                                <dd className="text-right font-mono text-neutral-100">
                                  {isRunning
                                    ? formatHMS(liveDurationSeconds(s.StartTime))
                                    : s.DurationSeconds != null
                                      ? formatHMS(s.DurationSeconds)
                                      : "—"}
                                </dd>
                              </dl>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                ))}
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
