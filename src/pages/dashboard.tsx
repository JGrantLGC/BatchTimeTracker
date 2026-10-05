import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gauge, TrendingUp, Target, CalendarClock, Loader2 } from "lucide-react";
import { MaterialBatchSessionService } from "@/api/services/MaterialBatchSessionService";
import {
  fetchUtilizationSettings,
  fetchBusinessDayCalendar,
  calculateUtilization,
  getMonthName,
  formatDateKey,
  isWeekend,
} from "@/lib/utilization";
import { formatHMS } from "@/lib/time-utils";

export default function DashboardPage() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

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
  });

  const loading = settingsQuery.isLoading || calendarQuery.isLoading || sessionsQuery.isLoading;
  const error = settingsQuery.error?.message ?? calendarQuery.error?.message ?? sessionsQuery.error?.message ?? null;

  const calc = useMemo(() => {
    if (!settingsQuery.data || !calendarQuery.data || !sessionsQuery.data) return null;
    const monthStart = new Date(year, month, 1).toISOString();
    const monthEnd = new Date(year, month + 1, 1).toISOString();
    const currentSeconds = sessionsQuery.data
      .filter((s) => {
        const st = new Date(s.StartTime).toISOString();
        return st >= monthStart && st < monthEnd && s.SessionStatus !== "Running";
      })
      .reduce((sum, s) => sum + (s.DurationSeconds ?? 0), 0);
    return calculateUtilization(currentSeconds, settingsQuery.data, calendarQuery.data, now);
  }, [settingsQuery.data, calendarQuery.data, sessionsQuery.data, year, month, now]);

  if (loading) {
    return (
      <div className="grid min-h-[50vh] place-items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-status-error/40 bg-status-error/10 px-4 py-3 text-sm text-status-error">
        {error}
      </div>
    );
  }

  if (!calc) {
    return (
      <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
        No data available.
      </div>
    );
  }

  const currentPct = Math.round(calc.currentUtilization * 10) / 10;
  const targetPct = calc.targetUtilization;
  const meetingTarget = currentPct >= targetPct;
  const gaugeColor = meetingTarget ? "text-status-running" : "text-status-stopped";
  const gaugeBg = meetingTarget ? "bg-status-running" : "bg-status-stopped";
  const gaugePct = Math.min(currentPct, 100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Utilization Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {getMonthName(month)} {year} — current utilization vs. target
        </p>
      </div>

      {/* Hero gauge */}
      <div className="rounded-2xl border bg-card p-6 md:p-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
          {/* Circular gauge */}
          <div className="relative shrink-0">
            <svg viewBox="0 0 200 200" className="h-48 w-48 md:h-56 md:w-56">
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="currentColor"
                strokeWidth="14"
                className="text-muted/30"
              />
              <circle
                cx="100"
                cy="100"
                r="85"
                fill="none"
                stroke="currentColor"
                strokeWidth="14"
                strokeLinecap="round"
                className={gaugeColor}
                strokeDasharray={`${(gaugePct / 100) * 534} 534`}
                transform="rotate(-90 100 100)"
                style={{ transition: "stroke-dasharray 0.6s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl md:text-4xl font-bold ${gaugeColor}`}>
                {currentPct.toFixed(1)}%
              </span>
              <span className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                Current
              </span>
            </div>
          </div>

          {/* Key metrics */}
          <div className="flex-1 space-y-4 w-full">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <Target className="h-6 w-6 text-brand-lead shrink-0" />
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Target Utilization
                </div>
                <div className="text-2xl font-bold">{targetPct.toFixed(1)}%</div>
              </div>
              <div className="ml-auto">
                {meetingTarget ? (
                  <span className="rounded-full bg-status-running/15 px-3 py-1 text-xs font-semibold text-status-running">
                    On Track
                  </span>
                ) : (
                  <span className="rounded-full bg-status-stopped/15 px-3 py-1 text-xs font-semibold text-status-stopped">
                    Below Target
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  Accumulated Time (MTD)
                </div>
                <div className="mt-1 text-xl font-bold font-mono">
                  {formatHMS(calc.currentSeconds)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {calc.currentHours.toFixed(1)} hours
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <CalendarClock className="h-4 w-4" />
                  Target Hours (MTD)
                </div>
                <div className="mt-1 text-xl font-bold font-mono">
                  {calc.targetHoursElapsed.toFixed(1)}h
                </div>
                <div className="text-xs text-muted-foreground">
                  {calc.businessDaysElapsed} of {calc.totalBusinessDays} business days elapsed
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Hours per Business Day
              </div>
              <div className="mt-1 text-lg font-semibold">
                {calc.hoursPerBusinessDay.toFixed(2)}h
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({calc.totalBusinessDays} business days &times;{" "}
                  {calc.hoursPerBusinessDay.toFixed(2)}h = {settingsQuery.data?.totalMonthlyHours.toFixed(0)}h total)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="font-semibold">Utilization Progress</span>
          <span className="text-muted-foreground">
            {currentPct.toFixed(1)}% of {targetPct.toFixed(1)}% target
          </span>
        </div>
        <div className="relative h-6 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full ${gaugeBg} transition-all duration-700`}
            style={{ width: `${gaugePct}%` }}
          />
          {/* Target marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/40"
            style={{ left: `${Math.min(targetPct, 100)}%` }}
          >
            <div className="absolute -top-0.5 -translate-x-1/2 text-[10px] font-bold text-foreground">
              ▼
            </div>
          </div>
        </div>
      </div>

      {/* Business day calendar strip */}
      <BusinessDayStrip year={year} month={month} entries={calendarQuery.data ?? []} />
    </div>
  );
}

function BusinessDayStrip({
  year,
  month,
  entries,
}: {
  year: number;
  month: number;
  entries: Array<{ date: string; isBusinessDay: boolean }>;
}) {
  const days = useMemo(() => {
    const count = new Date(year, month + 1, 0).getDate();
    const map = new Map(entries.map((e) => [e.date, e.isBusinessDay]));
    const todayKey = formatDateKey(new Date());
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(year, month, i + 1);
      const key = formatDateKey(d);
      const hasEntry = map.has(key);
      const isBiz = hasEntry ? map.get(key) : !isWeekend(d);
      return {
        day: i + 1,
        date: d,
        key,
        isBusinessDay: isBiz,
        isToday: key === todayKey,
        isPast: key < todayKey,
        hasEntry,
      };
    });
  }, [year, month, entries]);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gauge className="h-4 w-4" />
        <span className="font-semibold text-sm">Business Day Calendar — {getMonthName(month)}</span>
      </div>
      <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 gap-1">
        {days.map((d) => (
          <div
            key={d.key}
            title={`${d.date.toLocaleDateString()}${d.isBusinessDay ? " — Business day" : " — Non-business day"}`}
            className={`aspect-square rounded text-[10px] md:text-xs flex items-center justify-center font-medium transition-colors ${
              d.isToday
                ? "ring-2 ring-brand-lead ring-offset-1"
                : ""
            } ${
              !d.isBusinessDay
                ? "bg-muted text-muted-foreground"
                : d.isPast
                  ? "bg-brand-lead/15 text-brand-lead"
                  : "bg-brand-lead/5 text-brand-lead-75"
            }`}
          >
            {d.day}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-brand-lead/15" /> Business day (past)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-brand-lead/5" /> Business day (upcoming)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-muted" /> Non-business day
        </span>
      </div>
    </div>
  );
}
