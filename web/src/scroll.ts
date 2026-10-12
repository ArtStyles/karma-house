// Pure helpers for the scroll scenes. No DOM, so node --test can import them.
export const EASE = [0.22, 1, 0.36, 1] as const;

export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x));
/** Progress of `p` inside the window [a, b], clamped to 0..1. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Close to the brand curve cubic-bezier(.22,1,.36,1) and cheap enough to run every frame. */
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 4.2);
/** Index of the active step when `s` (0..1) is split into `count` equal parts. */
export const stepAt = (s: number, count: number) => Math.min(count - 1, Math.floor(clamp(s) * count));

export type Mode = 'full' | 'lite' | 'static';
/** 'static' when the visitor asks for reduced motion, 'lite' with data saver or ≤ 2 GB of memory, otherwise 'full'. */
export function pickMode({ reduce, saveData, deviceMemory }: { reduce: boolean; saveData?: boolean; deviceMemory?: number }): Mode {
  if (reduce) return 'static';
  if (saveData || (deviceMemory !== undefined && deviceMemory <= 2)) return 'lite';
  return 'full';
}

/** Journey card sizes: the arch window of the hero (10 px frame, mediopunto, bar, 5:4 photo) and the phone it becomes. */
export function cardSizes(w: number, h: number) {
  const pad = 10;
  const iw = Math.max(160, Math.min(w * 0.94 - 2 * pad, 420, (h - 64) / 1.31));
  const phoneH = Math.min(h - 8, 640);
  return { pad, iw, archW: iw + 2 * pad, archH: 36 + 1.31 * iw, transom: iw * 0.51 + 16, phoneH, phoneW: (phoneH * 9) / 19.5 };
}
