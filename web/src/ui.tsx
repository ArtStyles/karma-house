import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, m, useInView, useReducedMotion, type Variants } from 'motion/react';
import { EASE } from './scroll';

export const WRAP = 'mx-auto w-full max-w-[1280px] px-4 sm:px-8 lg:px-12';
export const BUTTON = 'inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-blue px-6 text-sm font-semibold text-on-blue transition hover:bg-blue-hover active:scale-[.98]';
export const LINK = 'group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-blue';
export const ARROW = 'size-4 transition-transform group-hover:translate-x-1';

export function Eyebrow({ children, className = 'text-ocre' }: { children: ReactNode; className?: string }) {
  return <p className={`flex items-center gap-3 text-xs font-bold uppercase tracking-[.16em] ${className}`}><span className="h-0.5 w-8 bg-sol" aria-hidden="true" />{children}</p>;
}

/** A headline with its one blue phrase. */
export function Title({ title, accent }: { title: string; accent: string }) {
  return <>{title} <span className="text-blue">{accent}</span></>;
}

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

export function SectionHeading({ eyebrow, title, id, aside }: { eyebrow: string; title: ReactNode; id: string; aside: ReactNode }) {
  return (
    <Reveal className="grid items-end gap-6 md:grid-cols-[1.3fr_1fr]">
      <div><Eyebrow>{eyebrow}</Eyebrow><h2 id={id} className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">{title}</h2></div>
      <p className="text-[15px] leading-relaxed text-body md:justify-self-end md:text-right">{aside}</p>
    </Reveal>
  );
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

/** `lit="load"` lights the panes on first paint (CSS, before the JavaScript arrives), `"view"` when the window scrolls
 *  into view, `"always"` shows it lit. Under reduced motion the CSS animation is off and the panes show lit. */
export function Mediopunto({ className, delay = 0, lit = 'load' }: { className?: string; delay?: number; lit?: 'load' | 'view' | 'always' }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });
  const [below, setBelow] = useState(false);
  useEffect(() => { if (lit === 'view' && ref.current!.getBoundingClientRect().top > innerHeight) setBelow(true); }, [lit]);
  const animate = lit === 'load' || (lit === 'view' && below && inView);
  const dark = lit === 'view' && below && !inView;
  return (
    <svg ref={ref} className={className} viewBox="0 0 200 102" aria-hidden="true">
      {PANES.map(({ d, ring, i }) => (
        <path key={d} d={d} fill={ring === 0 ? 'var(--color-sol)' : GLASS[(i + ring) % GLASS.length]} fillOpacity={ring === 2 && i % 2 ? 0.55 : 0.9}
          stroke="var(--color-paper)" strokeWidth="2.6" strokeLinejoin="round"
          className={animate ? 'glass' : undefined} style={animate ? { animationDelay: `${delay + ring * 0.25 + i * 0.05}s` } : dark ? { opacity: 0 } : undefined} />
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
          exit={{ y: '-90%', opacity: 0 }} transition={{ duration: 0.6, ease: EASE }}>{verb.word}</m.span>
      </AnimatePresence>
    </span>
  );
}

/** Thin band of tiles, like the cenefa that borders a Cuban tiled floor. */
export function Cenefa({ className = '' }: { className?: string }) {
  return <div className={`losa h-7 text-ocre opacity-40 ${className}`} aria-hidden="true" />;
}
