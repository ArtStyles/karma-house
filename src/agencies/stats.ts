import type { Page } from './types';

export type Tally = { count: number; more: boolean };

/** Walks a paged list up to `limit` pages: how many items pass `keep`, and whether pages were left unread. */
export async function countPages<T>(read: (offset: number) => Promise<Page<T>>, keep: (item: T) => boolean = () => true, limit = 10): Promise<Tally> {
  let offset = 0, count = 0;
  for (let page = 0; page < limit; page++) {
    const result = await read(offset);
    count += result.items.filter(keep).length;
    offset += result.items.length;
    if (!result.hasMore || !result.items.length) return { count, more: false };
  }
  return { count, more: true };
}

/** This week, Monday 00:00 to the next Monday, in the device's own time. */
export function weekRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() + 6) % 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString() };
}
