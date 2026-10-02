import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;
let checked = false;

const CUSTOM_KEY = "lgc:customDbUrl";
const CUSTOM_ANON_KEY = "lgc:customDbAnonKey";

export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase env vars not configured.");
  client = createClient(url, key);
  checked = true;
  return client;
}

export function getSupabaseOrNull(): SupabaseClient | null {
  if (client) return client;
  if (checked) return null;
  if (!isSupabaseConfigured()) return null;
  return getSupabase();
}

export function getCustomDbConfig(): { url: string; anonKey: string } {
  const url = localStorage.getItem(CUSTOM_KEY) ?? "";
  const anonKey = localStorage.getItem(CUSTOM_ANON_KEY) ?? "";
  return { url, anonKey };
}

export function setCustomDbConfig(url: string, anonKey: string): void {
  localStorage.setItem(CUSTOM_KEY, url.trim());
  localStorage.setItem(CUSTOM_ANON_KEY, anonKey.trim());
}

export function isCustomDbConfigured(): boolean {
  const { url, anonKey } = getCustomDbConfig();
  return Boolean(url && anonKey);
}

export async function testCustomDbConnection(url: string, anonKey: string): Promise<{ ok: boolean; message: string }> {
  if (!url.trim() || !anonKey.trim()) {
    return { ok: false, message: "Enter both a database URL and an API key." };
  }
  try {
    const sb = createClient(url.trim(), anonKey.trim());
    const { error } = await sb.from("batch_jobs").select("id").limit(1);
    if (error) {
      return { ok: false, message: `Connection failed: ${error.message}` };
    }
    return { ok: true, message: "Connection successful — the database is reachable and the API key is valid." };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to reach the database URL.";
    return { ok: false, message };
  }
}

export function getCustomSupabase(): SupabaseClient {
  const { url, anonKey } = getCustomDbConfig();
  if (!url || !anonKey) throw new Error("Custom database not configured.");
  return createClient(url, anonKey);
}
