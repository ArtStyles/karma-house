// Pure helpers for the scroll scenes. No DOM, so node --test can import them.
export const EASE = [0.22, 1, 0.36, 1] as const;

export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));
/** Progress of `p` inside the window [a, b], clamped to 0..1. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
/** Symmetric ease (smoothstep) for moves that start and end at rest. */
export const smooth = (t: number) => { const x = clamp(t); return x * x * (3 - 2 * x); };

export type Mode = 'full' | 'lite' | 'static';
/** 'static' when the visitor asks for reduced motion, 'lite' with data saver or ≤ 2 GB of memory, otherwise 'full'. */
export function pickMode({ reduce, saveData, deviceMemory }: { reduce: boolean; saveData?: boolean; deviceMemory?: number }): Mode {
  if (reduce) return 'static';
  if (saveData || (deviceMemory !== undefined && deviceMemory <= 2)) return 'lite';
  return 'full';
}

/** A stretch of the house walk, in scroll units: walking from photo k to k + 1, or pausing on photo k at stop s. */
export type TourPart = { kind: 'move' | 'pause'; k: number; s: number; a: number; b: number };

/** The walk as a timeline: each step between two photos is 1 unit, each pause `pause` units. `stops` are photo
 *  indexes in increasing order; the walk starts paused on the first one. */
export function tourTimeline(stops: number[], pause: number) {
  const parts: TourPart[] = [];
  let units = 0, k = 0;
  stops.forEach((stop, s) => {
    for (; k < stop; k++, units++) parts.push({ kind: 'move', k, s, a: units, b: units + 1 });
    parts.push({ kind: 'pause', k: stop, s, a: units, b: units + pause });
    units += pause;
  });
  return { parts, units };
}

/** The part under position `p` (in units) and the progress `u` (0..1) inside it. */
export function tourAt(parts: TourPart[], p: number) {
  const part = parts.find((x) => p < x.b) ?? parts[parts.length - 1];
  return { part, u: seg(p, part.a, part.b) };
}
