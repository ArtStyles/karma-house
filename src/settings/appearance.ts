export type AppearancePreference = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

export function resolveAppearance(preference: AppearancePreference, system: ColorScheme | 'unspecified' | null | undefined): ColorScheme {
  return preference === 'system' ? system === 'dark' ? 'dark' : 'light' : preference;
}

type PreferenceStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

/** One device preference, independent of account changes. Writes retain tap order. */
export function createAppearanceStore({ storage, key = 'karmahouse.appearance.v1' }: { storage: PreferenceStorage; key?: string }) {
  let state = { preference: 'system' as AppearancePreference, ready: false, saveFailed: false };
  let chosen = false;
  let revision = 0;
  let hydration: Promise<void> | undefined;
  let writes = Promise.resolve();
  const listeners = new Set<() => void>();
  function publish(next: typeof state) {
    state = next;
    listeners.forEach(listener => listener());
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate() {
      return hydration ??= storage.getItem(key).catch(() => null).then(value => {
        if (!chosen) publish({ preference: value === 'light' || value === 'dark' ? value : 'system', ready: true, saveFailed: false });
      });
    },
    setPreference(preference: AppearancePreference) {
      chosen = true;
      const currentRevision = ++revision;
      publish({ preference, ready: true, saveFailed: false });
      writes = writes.then(() => storage.setItem(key, preference)).catch(() => {
        if (currentRevision === revision) publish({ ...state, saveFailed: true });
      });
      return writes;
    },
  };
}
