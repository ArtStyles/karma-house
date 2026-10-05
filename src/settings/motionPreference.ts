export function createMotionPreference(source: { read(): Promise<boolean>; listen(listener: (reduced: boolean) => void): () => void }) {
  let reduced = true;
  const listeners = new Set<() => void>();
  const set = (value: boolean) => { if (value !== reduced) { reduced = value; listeners.forEach(listener => listener()); } };
  return {
    getState: () => reduced,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      let active = true;
      let changed = false;
      const unlisten = source.listen(value => { if (active) { changed = true; set(value); } });
      void source.read().then(value => { if (active && !changed) set(value); }).catch(() => undefined);
      return () => { active = false; unlisten(); };
    },
  };
}
