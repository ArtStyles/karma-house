import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
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
