import { reportDbError } from "@/lib/safe-error";
import { getSupabaseOrNull, isSupabaseConfigured } from "./supabase-client";
import { memory } from "./memory-store";
import {
  getBarcodeDelimiter,
  setBarcodeDelimiter,
  getAuthorizedUsers,
  setAuthorizedUsers,
  syncAuthorizedOperatorNames,
} from "./app-context";
import { getDataSourceType, setDataSourceType, type DataSourceType } from "./data-source";

export interface AppSettingsRow {
  barcode_delimiter: string;
  authorized_users: string[];
  data_source: DataSourceType;
}

function mapRow(r: Record<string, unknown>): AppSettingsRow {
  return {
    barcode_delimiter: r.barcode_delimiter as string,
    authorized_users: r.authorized_users as string[],
    data_source: r.data_source as DataSourceType,
  };
}

export async function loadSettingsFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabaseOrNull();
  if (!sb) return;
  // Load the authorized operator names first. The operators table and
  // app_settings are both readable by administrators only, so an operator's
  // browser can only learn this through the dedicated function, and the read
  // below returns nothing for them.
  const { data: nameData } = await sb.rpc("authorized_operator_names");
  if (Array.isArray(nameData)) {
    syncAuthorizedOperatorNames(nameData as string[]);
  }

  const { data, error } = await sb
    .from("app_settings")
    .select("barcode_delimiter, authorized_users, data_source")
    .eq("id", "current")
    .maybeSingle();
  if (error || !data) return;
  const row = mapRow(data);
  setBarcodeDelimiter(row.barcode_delimiter || " ");
  setDataSourceType(row.data_source || "local");

  // Also sync authorized users from the operators table (is_authorized flag)
  const { data: opData } = await sb
    .from("operators")
    .select("email, is_authorized")
    .eq("is_authorized", true);
  if (opData && opData.length > 0) {
    setAuthorizedUsers(
      opData
        .map((o: { email: string }) => o.email)
        .filter(Boolean),
    );
  } else if (Array.isArray(row.authorized_users)) {
    setAuthorizedUsers(row.authorized_users);
  }
}

export async function saveSettingsToSupabase(updaterEmail?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabaseOrNull();
  if (!sb) return;
  const patch = {
    barcode_delimiter: getBarcodeDelimiter(),
    authorized_users: getAuthorizedUsers(),
    data_source: getDataSourceType(),
    updated_at: new Date().toISOString(),
    updated_by: updaterEmail ?? null,
  };
  const { error } = await sb
    .from("app_settings")
    .update(patch)
    .eq("id", "current");
  if (error) throw new Error(reportDbError("Failed to save settings to database", error));
}

export function getCachedSettings(): AppSettingsRow {
  return {
    barcode_delimiter: getBarcodeDelimiter(),
    authorized_users: getAuthorizedUsers(),
    data_source: getDataSourceType(),
  };
}

export function applySettingsToMemory(settings: Partial<AppSettingsRow>): void {
  if (settings.barcode_delimiter !== undefined) {
    setBarcodeDelimiter(settings.barcode_delimiter);
  }
  if (settings.authorized_users !== undefined) {
    setAuthorizedUsers(settings.authorized_users);
  }
  if (settings.data_source !== undefined) {
    setDataSourceType(settings.data_source);
  }
}

export function getSettingsFromMemory(): AppSettingsRow {
  return {
    barcode_delimiter: getBarcodeDelimiter(),
    authorized_users: getAuthorizedUsers(),
    data_source: getDataSourceType(),
  };
}

export { memory };
