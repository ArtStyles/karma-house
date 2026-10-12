import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { OPERATIONS } from '../content';
import { put, useMode, useParts, useStage } from '../motion';
import { easeOut, seg } from '../scroll';
import { ARROW, Eyebrow, LINK, SectionHeading, Stagger, StaggerItem, WRAP } from '../ui';

type CubaMap = typeof import('../cuba-map');

// The hydraulic floor tile of .losa (index.css) at half size, used as the island's fill pattern.
const TILE = 'M14 3c3.5 4.5 3.5 6.5 0 11-3.5-4.5-3.5-6.5 0-11zM14 25c-3.5-4.5-3.5-6.5 0-11 3.5 4.5 3.5 6.5 0 11zM3 14c4.5-3.5 6.5-3.5 11 0-4.5 3.5-6.5 3.5-11 0zM25 14c-4.5 3.5-6.5 3.5-11 0 4.5-3.5 6.5-3.5 11 0zM0 4.5 4.5 0M23.5 0 28 4.5M0 23.5 4.5 28M28 23.5 23.5 28';

/** «Toda Cuba»: the island, tiled like a Cuban floor, appears west to east while the afternoon sun crosses it. */
export function Cuba() {
  const track = useRef<HTMLDivElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const [map, setMap] = useState<CubaMap | null>(null);
  const progress = useRef(0);

  const frame = useCallback((p: number) => {
    progress.current = p;
    if (still(mode.current === 'static')) return;
    const reveal = easeOut(seg(p, 0.04, 0.6));
    parts.current.island.style.clipPath = `inset(-30% ${(1 - reveal) * 100}% -30% -30%)`;
    put(parts.current.sun, `translateX(${-110 + 330 * seg(p, 0, 1)}%)`, mode.current === 'full' ? 1 : 0);
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

  useEffect(() => frame(progress.current), [map, frame]);

  return (
    <section id="cuba" aria-labelledby="cuba-title">
      <div ref={track} className="cuba track" style={{ '--screens': 1.7 } as CSSProperties}>
        <div className="stage">
          <div className="losa absolute inset-0 text-espuma opacity-[.035]" aria-hidden="true" />
          <div className={`${WRAP} cuba-layout`}>
            <div className="mx-auto max-w-[46rem] text-center">
              <Eyebrow className="justify-center text-sol">Las 15 provincias y la Isla de la Juventud</Eyebrow>
              <h2 id="cuba-title" className="mt-5 text-[clamp(2.4rem,5.4vw,4.4rem)] text-white">Toda Cuba, <span className="text-sol">en un mismo lugar.</span></h2>
              <p className="mx-auto mt-5 max-w-[32rem] leading-relaxed">Busca y publica en cualquier provincia. Filtra por zona y mira cada vivienda en el mapa.</p>
            </div>
            <figure className="cuba-figure">
              <div className="cuba-island" data-part="island">
                {map ? (
                  <svg viewBox={map.CUBA_VIEWBOX} role="img" aria-label="Silueta de Cuba, de Pinar del Río a Guantánamo y la Isla de la Juventud">
                    <defs>
                      <clipPath id="cuba-shape">{map.CUBA_PROVINCES.map(({ name, d }) => <path key={name} d={d} />)}</clipPath>
                      <pattern id="cuba-losa" width="28" height="28" patternUnits="userSpaceOnUse">
                        <path d={TILE} fill="none" stroke="var(--color-sol)" strokeWidth=".9" />
                        <circle cx="14" cy="14" r="1.8" fill="none" stroke="var(--color-sol)" strokeWidth=".9" />
                      </pattern>
                    </defs>
                    <g clipPath="url(#cuba-shape)">
                      <rect width="1000" height="343" className="cuba-ground" />
                      <rect width="1000" height="343" fill="url(#cuba-losa)" opacity=".55" />
                    </g>
                  </svg>
                ) : <div className="cuba-box" />}
              </div>
              <div className="cuba-sun" data-part="sun" aria-hidden="true" />
              <figcaption>Mapa: © colaboradores de OpenStreetMap (ODbL), vía geoBoundaries.</figcaption>
            </figure>
          </div>
        </div>
      </div>
      <Operations />
    </section>
  );
}

/** The four operations as translucent cards over soft afternoon light; a small mediopunto arch in each tone. */
function Operations() {
  return (
    <div id="posibilidades" className="ops relative isolate overflow-hidden py-20 lg:py-28">
      <div className="ops-light" aria-hidden="true"><span /><span /><span /></div>
      <div className={WRAP}>
        <SectionHeading eyebrow="Un lugar, muchas posibilidades" id="possibilities-title" title={<>¿Cuál es tu <span className="text-blue">próximo paso?</span></>}
          aside={<>Hay distintas formas de cambiar de hogar.<br />KarmaHouse tiene un espacio para cada una.</>} />
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPERATIONS.map(({ kicker, title, text, href, cta, tone }) => (
            <StaggerItem key={title} as="article" className={`op-card op-${tone}`}>
              <p className="op-kicker">{kicker}</p>
              <h3 className="mt-4 text-[clamp(2rem,2.6vw,2.5rem)]">{title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-body">{text}</p>
              <a className={`${LINK} mt-auto pt-6`} href={href}>{cta} <ArrowRight className={ARROW} aria-hidden="true" /></a>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </div>
  );
}
