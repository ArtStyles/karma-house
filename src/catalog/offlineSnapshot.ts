import type { DraftStorage as KeyValueStorage } from '../domain/draftPersistence.ts';
import type { Listing } from '../domain/listings.ts';
import { isUuid } from '../messaging/domain.ts';

export const SNAPSHOT_ROWS = 24;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

function isRow(value: unknown): value is Listing {
  const row = value as Listing;
  return !!row && isUuid(row.id) && typeof row.title === 'string' && row.title.length > 0
    && typeof row.price === 'number' && Number.isFinite(row.price) && row.price > 0
    && typeof row.location === 'string' && typeof row.province === 'string';
}

/** The first catalogue page with default filters, kept so Explore can open without a network. */
export function createOfflineSnapshot({ storage, now, key = 'karmahouse.catalogSnapshot.v1', maxAgeMs = 7 * DAY }: {
  storage: KeyValueStorage; now: () => number; key?: string; maxAgeMs?: number;
}) {
  return {
    /** Best effort: a failed write keeps the previous snapshot. */
    async save(rows: Listing[]): Promise<void> {
      await storage.setItem(key, JSON.stringify({ savedAt: now(), rows: rows.slice(0, SNAPSHOT_ROWS) })).catch(() => undefined);
    },
    async load(): Promise<{ rows: Listing[]; savedAt: number } | null> {
      try {
        const saved = JSON.parse(await storage.getItem(key) ?? 'null');
        if (!saved || !Number.isFinite(saved.savedAt) || now() - saved.savedAt > maxAgeMs) return null;
        const rows: unknown = saved.rows;
        if (!Array.isArray(rows) || rows.length === 0 || rows.length > SNAPSHOT_ROWS || !rows.every(isRow)) return null;
        return { rows, savedAt: saved.savedAt };
      } catch { return null; }
    },
  };
}

export function snapshotAgeText(savedAt: number, now: number): string {
  const hours = Math.floor((now - savedAt) / HOUR);
  if (hours < 1) return 'hace unos minutos';
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}
