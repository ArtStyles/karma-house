import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeftRight, ArrowRight, CalendarDays, House, KeyRound } from 'lucide-react';
import { OPERATIONS, PROVINCES } from '../content';
import { useMode, useParts, useStage } from '../motion';
import { easeOut, seg } from '../scroll';
import { ARROW, Eyebrow, LINK, SectionHeading, Stagger, StaggerItem, WRAP } from '../ui';

type CubaMap = typeof import('../cuba-map');
const ICONS = { house: House, key: KeyRound, swap: ArrowLeftRight, calendar: CalendarDays };

/** The island appears west to east and each territory lights up with its name; then the four operations. */
export function Cuba() {
  const track = useRef<HTMLDivElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const [map, setMap] = useState<CubaMap | null>(null);
  const lit = useRef<Element[][]>([]);
  const progress = useRef(0);

  const frame = useCallback((p: number) => {
    progress.current = p;
    if (still(mode.current === 'static')) {
      for (const els of lit.current) for (const el of els) el.classList.add('lit');
      return;
    }
    const reveal = easeOut(seg(p, 0.02, 0.55));
    if (parts.current.reveal) parts.current.reveal.style.clipPath = `inset(-4% ${(1 - reveal) * 100}% -4% -4%)`;
    lit.current.forEach((els, i) => { for (const el of els) el.classList.toggle('lit', p > 0.06 + i * 0.034); });
  }, [mode, parts, still]);

  useStage(track, frame);

  // The outlines (25 KB) load only when the scene comes near.
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      import('../cuba-map').then((mod) => setMap(mod));
    }, { rootMargin: '800px 0px' });
    observer.observe(track.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    lit.current = PROVINCES.map((_, i) => [...track.current!.querySelectorAll(`[data-province="${i}"]`)]);
    frame(progress.current);
  }, [map, frame]);

  return (
    <section id="cuba" aria-labelledby="cuba-title">
      <div ref={track} className="cuba track" style={{ '--screens': 1.8 } as CSSProperties}>
        <div className="stage">
          <div className={`${WRAP} grid gap-8 py-10 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:gap-16 lg:py-16`}>
            <div>
              <Eyebrow>Las 15 provincias y la Isla de la Juventud</Eyebrow>
              <h2 id="cuba-title" className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">Toda Cuba, <span className="text-blue">en un mismo lugar.</span></h2>
              <p className="mt-5 max-w-[28rem] leading-relaxed text-body">Busca y publica en cualquier provincia. Filtra por zona y mira cada vivienda en el mapa.</p>
              <ol className="cuba-list mt-7 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3 sm:text-sm lg:grid-cols-2">
                {PROVINCES.map((name, i) => <li key={name} data-province={i}>{name}</li>)}
              </ol>
            </div>
            <figure className="cuba-figure m-0">
              <div data-part="reveal">
                {map ? (
                  <svg viewBox={map.CUBA_VIEWBOX} className="cuba-map" role="img" aria-label="Mapa de Cuba con sus 15 provincias y la Isla de la Juventud">
                    {map.CUBA_PROVINCES.map(({ name, d }, i) => <path key={name} d={d} data-province={i} />)}
                  </svg>
                ) : <div className="cuba-map" />}
              </div>
              <figcaption className="mt-3 text-xs text-body">Mapa: © colaboradores de OpenStreetMap (ODbL), vía geoBoundaries.</figcaption>
            </figure>
          </div>
        </div>
      </div>
      <div id="posibilidades" className={`${WRAP} py-20 lg:py-28`}>
        <SectionHeading eyebrow="Un lugar, muchas posibilidades" id="possibilities-title" title="¿Cuál es tu próximo paso?"
          aside={<>Hay distintas formas de cambiar de hogar.<br />KarmaHouse tiene un espacio para cada una.</>} />
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPERATIONS.map(({ icon, title, text, href, cta, tone }) => {
            const Icon = ICONS[icon];
            return (
              <StaggerItem key={title} as="article" className="group relative flex flex-col rounded-[28px] border border-line bg-paper p-7 transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-36px_rgba(26,43,59,.45)]">
                <span className={`grid size-12 place-items-center rounded-2xl ${tone}`}><Icon className="size-[22px]" aria-hidden="true" /></span>
                <h3 className="mt-7 text-[1.75rem]">{title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-body">{text}</p>
                <a className={`${LINK} mt-auto pt-6`} href={href}>{cta} <ArrowRight className={ARROW} aria-hidden="true" /></a>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
