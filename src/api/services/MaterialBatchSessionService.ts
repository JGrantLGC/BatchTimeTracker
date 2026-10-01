import { memory } from "@/lib/memory-store";
import type { MaterialBatchSession, MaterialBatchSessionCreate, MaterialBatchSessionUpdate } from "@/api/models/MaterialBatchSession";

const STORE_KEY = "materialBatchSessions";

function getAllSessions(): MaterialBatchSession[] {
  return memory.ensure<MaterialBatchSession[]>(STORE_KEY, () => []);
}

function generateId(): string {
  return `ses-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const MaterialBatchSessionService = {
  async getAll(): Promise<MaterialBatchSession[]> {
    return getAllSessions().slice();
  },

  async create(data: MaterialBatchSessionCreate): Promise<MaterialBatchSession> {
    const now = new Date().toISOString();
    const row: MaterialBatchSession = {
      ...data,
      ID: generateId(),
      Created: now,
      Modified: now,
    };
    const sessions = getAllSessions();
    sessions.push(row);
    memory.put(STORE_KEY, sessions);
    return row;
  },

  async update(id: string, patch: MaterialBatchSessionUpdate): Promise<MaterialBatchSession> {
    const sessions = getAllSessions();
    const idx = sessions.findIndex((s) => s.ID === id);
    if (idx < 0) throw new Error(`Session ${id} not found.`);
    const updated: MaterialBatchSession = {
      ...sessions[idx],
      ...patch,
      ID: sessions[idx].ID,
      Modified: new Date().toISOString(),
    };
    sessions[idx] = updated;
    memory.put(STORE_KEY, sessions);
    return updated;
  },

  async delete(id: string): Promise<void> {
    const sessions = getAllSessions().filter((s) => s.ID !== id);
    memory.put(STORE_KEY, sessions);
  },
};
