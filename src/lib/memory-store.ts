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
const backing = new Map<string, MemoryValue>();
const core: MemoryStoreApiBase = {
    put(key, value) { backing.set(key, value); },
    get<T = MemoryValue>(key: string) { return backing.get(key) as T | undefined; },
    remove(key) { backing.delete(key); },
    clear() { backing.clear(); },
    snapshot() { return Object.fromEntries(backing.entries()); },
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
