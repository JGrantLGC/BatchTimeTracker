export type MemoryValue = unknown;
interface MemoryStoreApiBase {
    put<T = MemoryValue>(key: string, value: T): void;
    get<T = MemoryValue>(key: string): T | undefined;
    remove(key: string): void;
    clear(): void;
    snapshot(): Record<string, MemoryValue>;
}
export interface MemoryStoreApi extends MemoryStoreApiBase {
    ensure<T>(key: string, init: () => T): T;
}

const LS_PREFIX = "lgc:mem:";
const backing = new Map<string, MemoryValue>();

function loadFromLocalStorage(key: string): unknown | undefined {
    try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        if (raw === null) return undefined;
        return JSON.parse(raw) as unknown;
    } catch {
        return undefined;
    }
}

function saveToLocalStorage(key: string, value: unknown): void {
    try {
        localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    } catch {
        // storage full or unavailable — keep in-memory only
    }
}

const core: MemoryStoreApiBase = {
    put(key, value) {
        backing.set(key, value);
        saveToLocalStorage(key, value);
    },
    get<T = MemoryValue>(key: string) {
        if (backing.has(key)) return backing.get(key) as T | undefined;
        const persisted = loadFromLocalStorage(key);
        if (persisted !== undefined) {
            backing.set(key, persisted);
            return persisted as T | undefined;
        }
        return undefined;
    },
    remove(key) {
        backing.delete(key);
        try { localStorage.removeItem(LS_PREFIX + key); } catch { /* noop */ }
    },
    clear() {
        backing.clear();
        try {
            const toRemove: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(LS_PREFIX)) toRemove.push(k);
            }
            toRemove.forEach((k) => localStorage.removeItem(k));
        } catch { /* noop */ }
    },
    snapshot() {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(LS_PREFIX)) {
                const memKey = k.slice(LS_PREFIX.length);
                if (!backing.has(memKey)) {
                    const val = loadFromLocalStorage(memKey);
                    if (val !== undefined) backing.set(memKey, val);
                }
            }
        }
        return Object.fromEntries(backing.entries());
    },
};
export const memory: MemoryStoreApi = Object.assign(core, {
    ensure<T>(key: string, init: () => T): T {
        const existing = core.get<T>(key);
        if (existing !== undefined) return existing;
        const value = init();
        core.put(key, value);
        return value;
    },
});
