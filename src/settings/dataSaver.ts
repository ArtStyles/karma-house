import type { DraftStorage as KeyValueStorage } from '../domain/draftPersistence.ts';

/** The local «Ahorro de datos» choice; off unless the stored value is exactly '1'. */
export function createDataSaver({ storage, key = 'karmahouse.dataSaver.v1' }: { storage: KeyValueStorage; key?: string }) {
  return {
    async read(): Promise<boolean> {
      try { return await storage.getItem(key) === '1'; } catch { return false; }
    },
    async write(value: boolean): Promise<void> {
      await storage.setItem(key, value ? '1' : '0');
    },
  };
}

/** Shared preference state. Media must wait for ready before its first network request. */
export function createDataSaverStore(options: Parameters<typeof createDataSaver>[0]) {
  const preference = createDataSaver(options);
  let state = { enabled: false, ready: false };
  let chosen = false;
  let hydration: Promise<void> | undefined;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (enabled: boolean) => {
    state = { enabled, ready: true };
    listeners.forEach(listener => listener());
  };
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate() {
      return hydration ??= preference.read().then(value => { if (!chosen) publish(value); });
    },
    setEnabled(value: boolean) {
      chosen = true;
      publish(value);
      // Preserve the last choice even if a prior storage write finishes slowly or fails.
      writes = writes.then(() => preference.write(value)).catch(() => undefined);
      return writes;
    },
  };
}
