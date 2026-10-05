import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, CalendarDays, Loader2, Target, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAccess } from "@/components/system/AdminAccess";
import {
  fetchUtilizationSettings,
  saveUtilizationSettings,
  fetchBusinessDayCalendar,
  batchUpsertBusinessDays,
  getMonthName,
  formatDateKey,
  isWeekend,
  type BusinessDayEntry,
} from "@/lib/utilization";

export default function UtilizationSettingsPage() {
  const queryClient = useQueryClient();
  const { session } = useAdminAccess();
  const [targetPercent, setTargetPercent] = useState("85.0");
  const [totalHours, setTotalHours] = useState("0");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const settingsQuery = useQuery({
    queryKey: ["utilization-settings"],
    queryFn: fetchUtilizationSettings,
  });

  const calendarQuery = useQuery({
    queryKey: ["business-day-calendar", calYear, calMonth],
    queryFn: () => fetchBusinessDayCalendar(calYear, calMonth),
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setTargetPercent(String(settingsQuery.data.targetUtilizationPercent));
      setTotalHours(String(settingsQuery.data.totalMonthlyHours));
    }
  }, [settingsQuery.data]);

  async function handleSaveSettings() {
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const tp = parseFloat(targetPercent);
      const th = parseFloat(totalHours);
      if (isNaN(tp) || tp < 0 || tp > 100) {
        setSaveErr("Target utilization must be a percentage between 0 and 100.");
        setSaving(false);
        return;
      }
      if (isNaN(th) || th < 0) {
        setSaveErr("Total monthly hours must be a non-negative number.");
        setSaving(false);
        return;
      }
      await saveUtilizationSettings(tp, th, session?.user?.id);
      setSaveMsg("Utilization settings saved.");
      queryClient.invalidateQueries({ queryKey: ["utilization-settings"] });
    } catch (e: unknown) {
      setSaveErr(e instanceof Error ? e.message : "Failed to save settings.");
    }
    setSaving(false);
  }

  async function toggleBusinessDay(dateKey: string, currentlyBiz: boolean) {
    const newBiz = !currentlyBiz;
    try {
      await batchUpsertBusinessDays([{ date: dateKey, isBusinessDay: newBiz }]);
      queryClient.invalidateQueries({ queryKey: ["business-day-calendar", calYear, calMonth] });
      queryClient.invalidateQueries({ queryKey: ["utilization-settings"] });
    } catch {
      // non-fatal
    }
  }

  async function setAllWeekdaysBiz() {
    setCalBusy(true);
    try {
      const count = new Date(calYear, calMonth + 1, 0).getDate();
      const entries: Array<{ date: string; isBusinessDay: boolean }> = [];
      for (let i = 1; i <= count; i++) {
        const d = new Date(calYear, calMonth, i);
        entries.push({ date: formatDateKey(d), isBusinessDay: !isWeekend(d) });
      }
      await batchUpsertBusinessDays(entries);
      queryClient.invalidateQueries({ queryKey: ["business-day-calendar", calYear, calMonth] });
    } finally {
      setCalBusy(false);
    }
  }

  async function clearAllBiz() {
    setCalBusy(true);
    try {
      const count = new Date(calYear, calMonth + 1, 0).getDate();
      const entries: Array<{ date: string; isBusinessDay: boolean }> = [];
      for (let i = 1; i <= count; i++) {
        const d = new Date(calYear, calMonth, i);
        entries.push({ date: formatDateKey(d), isBusinessDay: false });
      }
      await batchUpsertBusinessDays(entries);
      queryClient.invalidateQueries({ queryKey: ["business-day-calendar", calYear, calMonth] });
    } finally {
      setCalBusy(false);
    }
  }

  const [calBusy, setCalBusy] = useState(false);

  function prevMonth() {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  }

  const calendarDays = useMemo(() => {
    const count = new Date(calYear, calMonth + 1, 0).getDate();
    const map = new Map<string, BusinessDayEntry>(
      (calendarQuery.data ?? []).map((e) => [e.date, e]),
    );
    const todayKey = formatDateKey(new Date());
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(calYear, calMonth, i + 1);
      const key = formatDateKey(d);
      const entry = map.get(key);
      const isBiz = entry ? entry.isBusinessDay : !isWeekend(d);
      return {
        day: i + 1,
        date: d,
        key,
        isBusinessDay: isBiz,
        label: entry?.label ?? null,
        isToday: key === todayKey,
        hasEntry: Boolean(entry),
      };
    });
  }, [calYear, calMonth, calendarQuery.data]);

  const businessDayCount = calendarDays.filter((d) => d.isBusinessDay).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Utilization Settings</h1>
        <p className="text-muted-foreground text-sm">
          Configure the target utilization rate, monthly hours, and business day calendar.
        </p>
      </div>

      {/* Utilization targets */}
      <div className="rounded-lg border bg-card p-6 space-y-4 max-w-xl">
        <div className="flex items-center gap-2 font-semibold">
          <Target className="h-5 w-5 text-brand-lead" />
          Utilization Targets
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="target-pct">Target Utilization Rate (%)</Label>
            <Input
              id="target-pct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={targetPercent}
              onChange={(e) => setTargetPercent(e.target.value)}
              placeholder="85.0"
            />
            <p className="text-xs text-muted-foreground">
              The percentage of target hours that operators should achieve.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="total-hours">Total Hours for the Month</Label>
            <Input
              id="total-hours"
              type="number"
              step="1"
              min="0"
              value={totalHours}
              onChange={(e) => setTotalHours(e.target.value)}
              placeholder="640"
            />
            <p className="text-xs text-muted-foreground">
              The total target working hours for the month across all operators.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void handleSaveSettings()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              {saving ? "Saving…" : "Save Settings"}
            </Button>
            {saveMsg && <span className="text-sm text-status-running font-medium">{saveMsg}</span>}
            {saveErr && <span className="text-sm text-status-error font-medium">{saveErr}</span>}
          </div>
        </div>
      </div>

      {/* Business day calendar */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-5 w-5 text-brand-lead" />
          Business Day Calendar
        </div>
        <p className="text-sm text-muted-foreground">
          Click any day to toggle it between a business day and a non-business day.
          Weekends are excluded by default. Use the quick actions to set all weekdays
          as business days or clear all.
        </p>

        {/* Month navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-semibold text-sm min-w-[140px] text-center">
              {getMonthName(calMonth)} {calYear}
            </span>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-4 w-4" />
            {businessDayCount} business days this month
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void setAllWeekdaysBiz()} disabled={calBusy}>
            {calBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            Set all weekdays as business days
          </Button>
          <Button variant="outline" size="sm" onClick={() => void clearAllBiz()} disabled={calBusy}>
            Clear all
          </Button>
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">
              {d}
            </div>
          ))}
          {/* Leading blanks for first weekday */}
          {Array.from({ length: new Date(calYear, calMonth, 1).getDay() }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}
          {calendarDays.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => void toggleBusinessDay(d.key, d.isBusinessDay)}
              className={`aspect-square rounded text-xs flex flex-col items-center justify-center font-medium transition-all hover:ring-2 hover:ring-brand-lead/40 ${
                d.isToday ? "ring-2 ring-brand-lead" : ""
              } ${
                d.isBusinessDay
                  ? "bg-brand-lead/15 text-brand-lead hover:bg-brand-lead/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              title={`${d.date.toLocaleDateString()}${d.label ? ` — ${d.label}` : ""}`}
            >
              <span>{d.day}</span>
              {d.label && (
                <span className="text-[9px] text-muted-foreground truncate max-w-full px-0.5">
                  {d.label}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-brand-lead/15" /> Business day
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-muted" /> Non-business day
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded ring-2 ring-brand-lead" /> Today
          </span>
        </div>
      </div>
    </div>
  );
}
