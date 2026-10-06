import { reportDbError } from "@/lib/safe-error";
import { getSupabase } from "@/lib/supabase-client";

export interface UtilizationSettings {
  targetUtilizationPercent: number;
  totalMonthlyHours: number;
}

export interface BusinessDayEntry {
  id: string;
  date: string;
  isBusinessDay: boolean;
  label: string | null;
}

export async function fetchUtilizationSettings(): Promise<UtilizationSettings> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("utilization_settings")
    .select("target_utilization_percent, total_monthly_hours")
    .eq("id", "current")
    .maybeSingle();
  if (error) throw new Error(reportDbError("Failed to load utilization settings", error));
  if (!data) return { targetUtilizationPercent: 85, totalMonthlyHours: 0 };
  return {
    targetUtilizationPercent: Number(data.target_utilization_percent) || 85,
    totalMonthlyHours: Number(data.total_monthly_hours) || 0,
  };
}

export async function saveUtilizationSettings(
  targetPercent: number,
  totalMonthlyHours: number,
  userId?: string,
): Promise<void> {
  const sb = getSupabase();
  const payload = {
    id: "current",
    target_utilization_percent: targetPercent,
    total_monthly_hours: totalMonthlyHours,
    updated_at: new Date().toISOString(),
    updated_by: userId ?? null,
  };
  const { error } = await sb.from("utilization_settings").upsert(payload, { onConflict: "id" });
  if (error) throw new Error(reportDbError("Failed to save utilization settings", error));
}

export async function fetchBusinessDayCalendar(
  year: number,
  month: number,
): Promise<BusinessDayEntry[]> {
  const sb = getSupabase();
  const startDate = new Date(year, month, 1).toISOString().slice(0, 10);
  const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("business_day_calendar")
    .select("id, date, is_business_day, label")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: true });
  if (error) throw new Error(reportDbError("Failed to load business day calendar", error));
  return (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    isBusinessDay: Boolean(r.is_business_day),
    label: r.label as string | null,
  }));
}

export async function upsertBusinessDay(
  date: string,
  isBusinessDay: boolean,
  label: string | null,
): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from("business_day_calendar")
    .upsert(
      { date, is_business_day: isBusinessDay, label, updated_at: new Date().toISOString() },
      { onConflict: "date" },
    );
  if (error) throw new Error(reportDbError("Failed to save business day", error));
}

export async function batchUpsertBusinessDays(
  entries: Array<{ date: string; isBusinessDay: boolean; label?: string | null }>,
): Promise<void> {
  const sb = getSupabase();
  const rows = entries.map((e) => ({
    date: e.date,
    is_business_day: e.isBusinessDay,
    label: e.label ?? null,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from("business_day_calendar").upsert(rows, { onConflict: "date" });
  if (error) throw new Error(reportDbError("Failed to save business days", error));
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function getMonthName(monthIndex: number): string {
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return names[monthIndex] ?? "";
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface UtilizationCalculation {
  currentSeconds: number;
  currentHours: number;
  businessDaysElapsed: number;
  totalBusinessDays: number;
  hoursPerBusinessDay: number;
  targetHoursElapsed: number;
  currentUtilization: number;
  targetUtilization: number;
}

export function calculateUtilization(
  currentSeconds: number,
  settings: UtilizationSettings,
  businessDays: BusinessDayEntry[],
  now: Date,
): UtilizationCalculation {
  const todayKey = formatDateKey(now);

  const totalBusinessDays = businessDays.filter((d) => d.isBusinessDay).length;

  const businessDaysElapsed = businessDays.filter(
    (d) => d.isBusinessDay && d.date <= todayKey,
  ).length;

  const hoursPerBusinessDay =
    totalBusinessDays > 0 ? settings.totalMonthlyHours / totalBusinessDays : 0;

  const targetHoursElapsed = hoursPerBusinessDay * businessDaysElapsed;

  const currentHours = currentSeconds / 3600;

  const currentUtilization =
    targetHoursElapsed > 0 ? (currentHours / targetHoursElapsed) * 100 : 0;

  return {
    currentSeconds,
    currentHours,
    businessDaysElapsed,
    totalBusinessDays,
    hoursPerBusinessDay,
    targetHoursElapsed,
    currentUtilization,
    targetUtilization: settings.targetUtilizationPercent,
  };
}
