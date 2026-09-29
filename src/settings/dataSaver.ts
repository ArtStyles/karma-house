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
