import type { DraftStorage as KeyValueStorage } from '../domain/draftPersistence.ts';

/** New photo signatures last a week so the system image cache keeps hitting the same URL. */
export const SIGNED_URL_SECONDS = 7 * 24 * 3600;

export interface SignedUrlEntry { path: string; url: string; expiresAt: number }

function isEntry(value: unknown): value is SignedUrlEntry {
  const entry = value as SignedUrlEntry;
  return !!entry && typeof entry.path === 'string' && typeof entry.url === 'string' && Number.isFinite(entry.expiresAt);
}

/**
 * Remembers storage path → signed URL. Best effort: storage failures never reach the caller,
 * they only cost a fresh signature.
 */
export function createSignedUrlCache({ storage, now, key = 'karmahouse.signedUrls.v1', maxEntries = 500, reuseMarginMs = 24 * 3600_000 }: {
  storage: KeyValueStorage; now: () => number; key?: string; maxEntries?: number; reuseMarginMs?: number;
}) {
  // Map order is the refresh order: the first entries are the oldest.
  let entries = new Map<string, SignedUrlEntry>();

  function trim() {
    for (const path of entries.keys()) {
      if (entries.size <= maxEntries) break;
      entries.delete(path);
    }
  }
  async function persist() {
    await storage.setItem(key, JSON.stringify([...entries.values()])).catch(() => undefined);
  }
  function get(path: string): string | undefined {
    const entry = entries.get(path);
    return entry && entry.expiresAt - now() > reuseMarginMs ? entry.url : undefined;
  }

  return {
    get,
    async hydrate(): Promise<void> {
      let saved: unknown;
      try { saved = JSON.parse(await storage.getItem(key) ?? '[]'); } catch { return; }
      if (!Array.isArray(saved) || !saved.every(isEntry)) return;
      // Links signed before hydration finished are newer than anything on disk.
      const merged = new Map<string, SignedUrlEntry>();
      for (const entry of saved) if (entry.expiresAt > now()) merged.set(entry.path, { path: entry.path, url: entry.url, expiresAt: entry.expiresAt });
      for (const [path, entry] of entries) { merged.delete(path); merged.set(path, entry); }
      entries = merged;
      trim();
    },
    missing(paths: string[]): string[] {
      return [...new Set(paths)].filter(path => get(path) === undefined);
    },
    async put(fresh: SignedUrlEntry[]): Promise<void> {
      for (const { path, url, expiresAt } of fresh) { entries.delete(path); entries.set(path, { path, url, expiresAt }); }
      trim();
      await persist();
    },
    async clear(): Promise<void> {
      entries = new Map();
      await storage.removeItem(key).catch(() => undefined);
    },
  };
}

export type SignedUrlCache = ReturnType<typeof createSignedUrlCache>;
