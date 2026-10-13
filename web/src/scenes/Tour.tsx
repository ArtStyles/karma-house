import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, ArrowRight, Pause } from 'lucide-react';
import { ASSISTED_CONTACT, PROOF, TOUR } from '../content';
import { useMode } from '../motion';
import { clamp, seg, smooth, tileRect, tourAt, tourTimeline } from '../scroll';
import data from '../tour-data.json';
import { createWalk, type Tex, type View } from '../tour-gl';
import { ARROW, SOL_BUTTON } from '../ui';

// A walk through one house, photo by photo (web/scripts/tour-assets.py). At each stop of TOUR the frame freezes
// into a duotone and the stop's text takes over. Without WebGL, motion or JavaScript, the stops read as photo panels.
// Scroll per step: 13 % of the screen per photo (--step in scenes.css); a pause lasts 5 steps, so the text stays readable.
const PAUSE = 5;
const STOPS = TOUR.map((stop) => data.frames.indexOf(stop.photo));
const { parts, units } = tourTimeline(STOPS, PAUSE);
const PAUSES = parts.filter((x) => x.kind === 'pause');
const photo = (n: string, width: number) => `/casa/${n}-${width}.webp`;
const srcSet = (n: string) => `${photo(n, 720)} 720w, ${photo(n, 1280)} 1280w`;
// A step without a fitted model: a gentle push toward the middle and a plain dissolve.
const PLAIN = { f: [0.5, 0.45], fwd: [0.14, 0.1, 0, 0], bwd: [0.14, 0.1, 0, 0] };

type Sharp = { tex?: Tex };

/** The visitor's choice to see the walk as plain sections, remembered on this device. The head script of index.html
 *  applies it before the first paint (html[data-walk="off"]). Switching keeps the reader on the same stop or section. */
export function useStill() {
  const [still, setStill] = useState(false);
  useEffect(() => setStill(document.documentElement.dataset.walk === 'off'), []);
  const toggle = useCallback(() => {
    const next = !still;
    const tour = document.querySelector('.tour')!, after = tour.nextElementSibling!;
    const inTour = tour.getBoundingClientRect().bottom > innerHeight / 2;
    // The stop on screen: the last one whose block starts above the middle of the viewport.
    const stop = Math.max(0, [...tour.querySelectorAll('.tour-stop')].filter((a) => a.getBoundingClientRect().top <= innerHeight / 2).length - 1);
    const top = after.getBoundingClientRect().top;
    document.documentElement.dataset.walk = next ? 'off' : 'on';
    try { localStorage.setItem('kh-walk', next ? 'off' : 'on'); } catch { /* storage blocked: the choice lasts this visit */ }
    setStill(next);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (inTour) document.getElementById(TOUR[stop].id)!.scrollIntoView({ behavior: 'instant' });
      else scrollBy({ top: after.getBoundingClientRect().top - top, behavior: 'instant' });
    }));
  }, [still]);
  return [still, toggle] as const;
}

export function Tour({ still, onToggle }: { still: boolean; onToggle: () => void }) {
  const root = useRef<HTMLElement>(null);
  const mode = useMode();
  // The photos of the plain sections exist only once the walk is flat; until then they sit in <noscript>, so the
  // animated walk does not download them up front (the preload scanner fetches even lazy images).
  const [flat, setFlat] = useState(false);

  useEffect(() => {
    const section = root.current!;
    const stage = section.querySelector<HTMLElement>('.tour-stage')!;
    const cards = [...section.querySelectorAll<HTMLElement>('.tour-text')];
    const goFlat = () => {
      section.dataset.flat = '';
      for (const card of cards) { card.removeAttribute('style'); card.removeAttribute('data-on'); }
      setFlat(true);
    };
    if (still) { goFlat(); return; }
    delete section.dataset.flat;
    let walk: ReturnType<typeof createWalk> = null;
    // The stage is sticky only when CSS pins the walk (JavaScript on, motion allowed).
    if (mode.current === 'full' && getComputedStyle(stage).position === 'sticky') {
      try { walk = createWalk(section.querySelector('canvas')!); } catch { walk = null; }
      // No WebGL: nothing to switch, so the header hides its switch.
      if (!walk) document.documentElement.dataset.gl = 'off';
    }
    if (!walk) { goFlat(); return; }
    setFlat(false);
    const gl = walk;
    const shade = section.querySelector<HTMLElement>('.tour-shade')!;
    const flash = section.querySelector<HTMLElement>('.tour-flash')!;
    const width = stage.clientWidth * Math.min(devicePixelRatio || 1, 1.5) > 900 ? 1280 : 720;
    const sharp = new Map<number, Sharp>();
    // Two small files hold every photo: depth.webp (all depth maps) and thumbs.webp (every photo small), in a grid.
    const grids: Record<'depth' | 'thumbs', { tex?: Tex; asked?: boolean }> = { depth: {}, thumbs: {} };
    let queued = 0, top = 0, alive = true, ready = false;

    const ask = (name: 'depth' | 'thumbs') => {
      const grid = grids[name];
      if (grid.asked) return;
      grid.asked = true;
      gl.load(`/casa/${name}.webp`).then((tex) => {
        if (!alive) { gl.free(tex); return; }
        if (tex) { grid.tex = tex; request(); } else setTimeout(() => { grid.asked = false; request(); }, 4000);
      });
    };
    const tile = (grid: Tex, k: number): View => ({ tex: grid, rect: tileRect(k, data.grid, grid.w, grid.h) });
    // The sharp photo once it has arrived, else its thumbnail: scrolling faster than the connection shows a soft
    // frame in the right place instead of freezing and then jumping. The hero waits for its sharp photo.
    const view = (k: number) => sharp.get(k)?.tex ?? (ready && grids.thumbs.tex ? tile(grids.thumbs.tex, k) : undefined);

    // Sharp photos load a few steps ahead of the camera, nearest first; those left far behind or ahead are freed.
    const want = (k: number) => {
      if (k < 0 || k >= data.frames.length || sharp.has(k)) return;
      const entry: Sharp = {};
      sharp.set(k, entry);
      gl.load(photo(data.frames[k], width)).then((tex) => {
        if (sharp.get(k) === entry && tex) { entry.tex = tex; request(); return; }
        gl.free(tex);
        if (sharp.get(k) === entry) setTimeout(() => { if (sharp.get(k) === entry) sharp.delete(k); }, 4000);
      });
    };
    const drop = (k: number) => { gl.free(sharp.get(k)!.tex); sharp.delete(k); };

    function frame() {
      queued = 0;
      const r = section.getBoundingClientRect();
      const p = clamp((top - r.top) / (r.height - stage.clientHeight)) * units;
      const { part, u } = tourAt(parts, p);
      const k = part.k;
      for (let n = k; n <= k + 5; n++) want(n);
      want(k - 1);
      for (const n of [...sharp.keys()]) if (n < k - 3 || n > k + 8) drop(n);

      const depth = grids.depth.tex, now = view(k), drift = [Math.sin(p * 0.9) * 0.008, Math.cos(p * 0.7) * 0.004];
      let tone = 0, text = -1, textO = 0, shutter = 0;
      if (part.kind === 'move') {
        const next = view(k + 1), pr = data.pairs[k] ?? PLAIN, w = smooth(seg(u, 0.1, 0.9));
        if (depth && now) {
          gl.clear();
          gl.draw(now, tile(depth, k), { focus: pr.f, ka: pr.fwd[0], kb: pr.fwd[1], shift: [pr.fwd[2] * u, pr.fwd[3] * u], amt: u, dir: 1, alpha: 1, drift });
          if (w > 0 && next) gl.draw(next, tile(depth, k + 1), { focus: pr.f, ka: pr.bwd[0], kb: pr.bwd[1], shift: [pr.bwd[2] * (1 - u), pr.bwd[3] * (1 - u)], amt: 1 - u, dir: -1, alpha: w, drift });
          ready = true;
          section.dataset.ready = '';
        }
      } else {
        const first = part.s === 0, last = part.s === TOUR.length - 1;
        tone = (first ? 1 : smooth(seg(u, 0, 0.14))) * (last ? 1 : 1 - smooth(seg(u, 0.86, 1)));
        if (depth && now) {
          gl.clear();
          gl.draw(now, tile(depth, k), { focus: [0.5, 0.45], ka: 0.03, kb: 0, amt: tone, dir: 1, alpha: 1, tone, drift: drift.map((d) => d * (1 - tone)) });
          ready = true;
          section.dataset.ready = '';
        }
        text = part.s;
        textO = (first ? 1 : smooth(seg(u, 0.1, 0.24))) * (last ? 1 : 1 - smooth(seg(u, 0.76, 0.9)));
        shutter = first ? 0 : Math.sin(Math.PI * seg(u, 0, 0.1)) * 0.25;
      }
      shade.style.opacity = String(tone);
      flash.style.opacity = String(shutter);
      cards.forEach((card, s) => {
        const o = s === text ? textO : 0;
        card.style.opacity = String(o);
        card.style.transform = `translateY(${(1 - o) * 18}px)`;
        card.toggleAttribute('data-on', o > 0.6);
      });
    }
    function request() { if (!queued) queued = requestAnimationFrame(frame); }
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      gl.resize(Math.round(stage.clientWidth * dpr), Math.round(stage.clientHeight * dpr));
      top = parseFloat(getComputedStyle(stage).top) || 0;
      request();
    }

    const sizes = new ResizeObserver(resize);
    sizes.observe(stage);
    addEventListener('scroll', request, { passive: true });
    ask('depth');
    for (let n = 0; n < 6; n++) want(n);
    ask('thumbs');
    return () => {
      alive = false;
      cancelAnimationFrame(queued);
      removeEventListener('scroll', request);
      sizes.disconnect();
      for (const n of [...sharp.keys()]) drop(n);
      gl.free(grids.depth.tex);
      gl.free(grids.thumbs.tex);
    };
  }, [mode, still]);

  return (
    <section ref={root} className="tour" aria-label="Recorrido por una casa" style={{ '--units': units } as CSSProperties}>
      <div className="tour-stage">
        <img className="tour-poster" src="/casa/hero-1280.webp" srcSet="/casa/hero-720.webp 720w, /casa/hero-1280.webp 1280w" sizes="100vw" alt="" fetchPriority="high" />
        <canvas aria-hidden="true" />
        <div className="tour-shade" />
        <div className="tour-flash" />
      </div>
      {TOUR.map((stop, s) => {
        const pause = PAUSES[s], Heading = s === 0 ? 'h1' : 'h2';
        const picture = (
          <figure className="tour-figure">
            <img className="tour-photo" src={photo(stop.photo, 1280)} srcSet={srcSet(stop.photo)} sizes="(min-width: 900px) 50vw, 100vw" width="1280" height="853" alt="" loading="lazy" decoding="async" />
            <figcaption className="tour-label">{stop.room} · Imagen ilustrativa</figcaption>
          </figure>
        );
        const style = { '--a': pause.a, '--len': pause.b - pause.a, '--mid': s === 0 ? 0 : (pause.b - pause.a) / 2 } as CSSProperties;
        return (
          <article key={stop.id} className="tour-stop" aria-labelledby={`${stop.id}-title`} style={style}>
            <span id={stop.id} className="tour-anchor" />
            {flat ? picture : <noscript>{picture}</noscript>}
            <div className="tour-text">
              {s > 0 && <p className="tour-num" aria-hidden="true">{String(s + 1).padStart(2, '0')}</p>}
              <p className="tour-kicker">{stop.kicker}</p>
              <Heading id={`${stop.id}-title`} className="tour-title">{stop.title} <span>{stop.accent}</span></Heading>
              <p className="tour-copy">{stop.text}</p>
              {s === 0 && (
                <>
                  <a className={`${SOL_BUTTON} tour-cta mt-8`} href="#descargar">Descarga KarmaHouse para Android <ArrowRight className={ARROW} aria-hidden="true" /></a>
                  <ul className="tour-proof">{PROOF.map((item) => <li key={item}>{item}</li>)}</ul>
                  <p className="tour-hint"><ArrowDown className="size-4" aria-hidden="true" />Desliza y recorre la casa</p>
                </>
              )}
              {stop.id === 'publicar' && <a className="tour-link" href={ASSISTED_CONTACT}>¿Prefieres ayuda? Escríbenos y preparamos tu anuncio contigo <ArrowRight className={ARROW} aria-hidden="true" /></a>}
              {s === TOUR.length - 1 && <a className={`${SOL_BUTTON} tour-cta mt-8`} href="#descargar">Descarga KarmaHouse para Android <ArrowRight className={ARROW} aria-hidden="true" /></a>}
              <span className="tour-rule" aria-hidden="true" />
            </div>
          </article>
        );
      })}
      {/* After the stops, so it stays above their navy fade. */}
      <div className="tour-bar">
        <button type="button" className="tour-switch" onClick={onToggle}><Pause className="size-3.5" aria-hidden="true" />Sin animación</button>
        <span className="tour-label" aria-hidden="true">Imagen ilustrativa</span>
      </div>
    </section>
  );
}
