import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m, useInView, useReducedMotion, type Variants } from 'motion/react';
import { Pause, Play } from 'lucide-react';

const EASE = [0.22, 1, 0.36, 1] as const;

// The prerendered HTML shows everything. After hydration, content still below the fold is hidden
// (off screen, so nobody sees it go) and animates in when scrolled to; content already on screen stays put.
// Slow connections and no-JS visitors therefore always get the full page.
function useReveal(amount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount });
  const [below, setBelow] = useState(false);
  useEffect(() => { if (ref.current!.getBoundingClientRect().top > innerHeight) setBelow(true); }, []);
  return { ref, initial: false as const, animate: below && !inView ? 'hidden' : 'shown' };
}

type Hidden = { opacity?: number; x?: number; y?: number; scaleX?: number };

/** Fades content up once when it scrolls into view. */
export function Reveal({ children, className, delay = 0, hidden = { opacity: 0, y: 24 }, amount = 0.25 }:
  { children?: ReactNode; className?: string; delay?: number; hidden?: Hidden; amount?: number }) {
  const variants: Variants = {
    hidden: { ...hidden, transition: { duration: 0 } },
    shown: { opacity: 1, x: 0, y: 0, scaleX: 1, transition: { duration: 0.7, ease: EASE, delay } },
  };
  return <m.div className={className} variants={variants} {...useReveal(amount)}>{children}</m.div>;
}

const group: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.08 } } };
const item: Variants = { hidden: { opacity: 0, y: 28, transition: { duration: 0 } }, shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } };

/** A list whose children (use <StaggerItem>) appear one after another. */
export function Stagger({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'ol' | 'ul' }) {
  const Tag = m[as] as typeof m.div;
  return <Tag className={className} variants={group} {...useReveal(0.2)}>{children}</Tag>;
}

export function StaggerItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'li' | 'article' }) {
  const Tag = m[as] as typeof m.div;
  return <Tag className={className} variants={item}>{children}</Tag>;
}

// Mediopunto: the half-moon stained-glass window above Cuban doors. Panes light up from the hub outwards.
const GLASS = ['var(--color-blue)', 'var(--color-sol)', 'var(--color-terracota)', 'var(--color-persiana)'];
const C = 100;
const point = (r: number, a: number) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
function pane(r0: number, r1: number, a0: number, a1: number) {
  const inner = r0 ? `L${point(r0, a1)} A${r0} ${r0} 0 0 0 ${point(r0, a0)}` : `L${C} ${C}`;
  return `M${point(r1, a0)} A${r1} ${r1} 0 0 1 ${point(r1, a1)} ${inner} Z`;
}
const RINGS: [number, number, number][] = [[0, 24, 1], [24, 60, 5], [60, 97, 9]];
const PANES = RINGS.flatMap(([r0, r1, n], ring) =>
  Array.from({ length: n }, (_, i) => ({ d: pane(r0, r1, Math.PI + (i * Math.PI) / n, Math.PI + ((i + 1) * Math.PI) / n), ring, i })));

// Panes light up with a CSS animation, so the hero animates on first paint even before the JavaScript arrives.
export function Mediopunto({ className, delay = 0, animated = true }: { className?: string; delay?: number; animated?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 200 102" aria-hidden="true">
      {PANES.map(({ d, ring, i }) => (
        <path key={d} d={d} fill={ring === 0 ? 'var(--color-sol)' : GLASS[(i + ring) % GLASS.length]} fillOpacity={ring === 2 && i % 2 ? 0.55 : 0.9}
          stroke="var(--color-cal)" strokeWidth="2.6" strokeLinejoin="round"
          className={animated ? 'glass' : undefined} style={animated ? { animationDelay: `${delay + ring * 0.25 + i * 0.05}s` } : undefined} />
      ))}
    </svg>
  );
}

export const VERBS = [
  { word: 'comprar', tone: 'bg-blue' },
  { word: 'vender', tone: 'bg-terracota' },
  { word: 'permutar', tone: 'bg-persiana' },
  { word: 'alquilar', tone: 'bg-ocre' },
];

/** Cycles once through the four operations and settles on the first, so it stops before five seconds (WCAG 2.2.2). */
export function VerbRotator() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (reduce || step >= VERBS.length) return;
    const timer = setTimeout(() => setStep(step + 1), step === 0 ? 1400 : 1000);
    return () => clearTimeout(timer);
  }, [reduce, step]);
  const verb = VERBS[step % VERBS.length];
  return (
    <span className={`relative -my-1 inline-grid justify-items-center overflow-hidden rounded-[0.32em] px-[0.34em] pb-[0.06em] align-baseline text-cal transition-colors duration-500 ${verb.tone}`} aria-hidden="true">
      {VERBS.map(({ word }) => <span key={word} className="invisible col-start-1 row-start-1">{word}</span>)}
      <AnimatePresence initial={false}>
        <m.span key={verb.word} className="col-start-1 row-start-1" initial={{ y: '90%', opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-90%', opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 26 }}>{verb.word}</m.span>
      </AnimatePresence>
    </span>
  );
}

// Same list and order as PROVINCES in src/domain/listingOptions.ts (the app's own source).
const PROVINCES = ['Pinar del Río', 'Artemisa', 'La Habana', 'Mayabeque', 'Matanzas', 'Villa Clara', 'Cienfuegos', 'Sancti Spíritus',
  'Ciego de Ávila', 'Camagüey', 'Las Tunas', 'Holguín', 'Granma', 'Santiago de Cuba', 'Guantánamo', 'Isla de la Juventud'];

export function ProvinceMarquee() {
  const [paused, setPaused] = useState(false);
  const row = (hidden?: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {PROVINCES.map((name) => (
        <li key={name} className="flex items-center whitespace-nowrap font-display text-xl text-espuma md:text-2xl">
          {name}<span className="mx-6 inline-block size-1.5 rotate-45 bg-sol" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className="bg-mar text-espuma">
      <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-4 py-5 sm:px-8 lg:px-12">
        <p className="hidden max-w-[11rem] shrink-0 text-xs font-semibold uppercase leading-snug tracking-[.14em] text-sol sm:block">Las 15 provincias y la Isla de la Juventud</p>
        <div className="group relative min-w-0 flex-1 overflow-x-auto [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] [scrollbar-width:none]">
          <div className="marquee flex w-max" data-paused={paused}>{row()}{row(true)}</div>
        </div>
        <button type="button" onClick={() => setPaused(!paused)} aria-pressed={paused}
          className="grid size-11 shrink-0 place-items-center rounded-full border border-white/20 text-espuma transition hover:bg-white/10 motion-reduce:hidden">
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          <span className="sr-only">{paused ? 'Reanudar' : 'Pausar'} la lista de provincias</span>
        </button>
      </div>
    </div>
  );
}

/** Thin band of tiles, like the cenefa that borders a Cuban tiled floor. */
export function Cenefa({ className = '' }: { className?: string }) {
  return <div className={`losa h-7 text-ocre opacity-40 ${className}`} aria-hidden="true" />;
}
