import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useMotionValueEvent, useReducedMotion, useScroll } from 'motion/react';
import { pickMode, type Mode } from './scroll';

type Nav = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };

/** The current mode as a ref, so scroll frames read it without re-rendering. Mirrored on <html data-mode> for CSS. */
export function useMode() {
  const reduce = useReducedMotion();
  const mode = useRef<Mode>('full');
  useEffect(() => {
    const nav = navigator as Nav;
    mode.current = pickMode({ reduce: Boolean(reduce), saveData: nav.connection?.saveData, deviceMemory: nav.deviceMemory });
    document.documentElement.dataset.mode = mode.current;
  }, [reduce]);
  return mode;
}

/** Elements marked data-part="name" inside `root`, collected after mount. These elements never get a JSX `style`:
 *  frames own their inline style. `still(true)` drops what frames wrote once, so the static CSS takes over. */
export function useParts(root: RefObject<HTMLElement | null>) {
  const parts = useRef<Record<string, HTMLElement>>({});
  const dirty = useRef(true);
  useEffect(() => {
    for (const el of root.current!.querySelectorAll<HTMLElement>('[data-part]')) parts.current[el.dataset.part!] = el;
  }, [root]);
  const still = useCallback((isStatic: boolean) => {
    if (!isStatic) { dirty.current = true; return false; }
    if (dirty.current) for (const el of Object.values(parts.current)) el.removeAttribute('style');
    dirty.current = false;
    return true;
  }, []);
  return { parts, still };
}

/** Runs frame(progress) while `track` scrolls: 0 when its top reaches the top of the viewport, 1 when its bottom
 *  reaches the bottom. Frames run once per animation frame through motion's scroll tracking. */
export function useStage(track: RefObject<HTMLElement | null>, frame: (p: number) => void) {
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', frame);
  useEffect(() => frame(scrollYProgress.get()), [frame, scrollYProgress]);
}

export function put(el: Element | undefined, transform: string, opacity?: number) {
  if (!el) return;
  const style = (el as HTMLElement).style;
  style.transform = transform;
  if (opacity !== undefined) style.opacity = String(opacity);
}

export function fade(el: Element | undefined, opacity: number) {
  if (el) (el as HTMLElement).style.opacity = String(opacity);
}
