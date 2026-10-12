import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Check, MapPin } from 'lucide-react';
import { JOURNEY, PROOF } from '../content';
import { fade, put, useMode, useParts, useStage } from '../motion';
import { HOUSE_PIN, PINS } from '../phone/Barrio';
import { BarrioMap, BottomNav, ChatScreen, ExploreBar, ListingSheet, PhoneFrame } from '../phone/Phone';
import { cardSizes, easeOut, mix, seg, stepAt } from '../scroll';
import { ARROW, BUTTON, Eyebrow, LINK, Mediopunto, Title, VerbRotator, WRAP } from '../ui';

type Sizes = ReturnType<typeof cardSizes> & { dy: number };
const BUBBLES = [['b1', 0.58, 0.63], ['b2', 0.63, 0.68], ['b3', 0.68, 0.73], ['b4', 0.94, 0.98]] as const;

/** Hero and «Del mapa a la conversación»: the arch window turns into the phone, the camera pulls back from the
 *  house to the barrio (the house becomes the terracotta pin), then map, listing, chat and visit. */
export function Journey() {
  const track = useRef<HTMLElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const sizes = useRef<Sizes | null>(null);
  const progress = useRef(0);
  const [step, setStep] = useState(-1);

  const frame = useCallback((p: number) => {
    progress.current = p;
    const P = parts.current, size = sizes.current;
    if (still(mode.current === 'static') || !size || !P.card) return;
    const full = mode.current === 'full';
    const m = easeOut(seg(p, 0.03, 0.17));
    const s = seg(p, 0.15, 1);

    // 1. The arch window becomes the phone.
    const W = mix(size.archW, size.phoneW, m), H = mix(size.archH, size.phoneH, m), pad = mix(size.pad, 7, m);
    const r1 = mix(size.archW / 2, 36, m), r2 = mix(30, 36, m);
    const sway = full ? ` rotateY(${Math.sin(s * Math.PI * 2) * 3.5 * m}deg) rotateX(${2 * Math.sin(s * Math.PI) * m}deg)` : '';
    Object.assign(P.card.style, {
      width: `${W}px`, height: `${H}px`, borderRadius: `${r1}px ${r1}px ${r2}px ${r2}px`,
      transform: `translate(-50%, -50%) translateY(${size.dy * m}px)${sway}`,
    });
    const sr = mix(4, 29, m), sb = mix(22, 29, m);
    Object.assign(P.screen.style, {
      top: `${pad + size.transom * (1 - m)}px`, left: `${pad}px`, right: `${pad}px`, bottom: `${pad}px`, borderRadius: `${sr}px ${sr}px ${sb}px ${sb}px`,
    });
    put(P.transom, `translateY(${-14 * m}px) scale(${1 - 0.08 * m})`, 1 - seg(m, 0, 0.55));
    put(P.photo, `scale(${1 - 0.95 * easeOut(seg(m, 0.1, 1))})`, 1 - seg(m, 0.55, 0.95));
    fade(P.caption, 1 - seg(m, 0, 0.3));
    put(P.hero, `translateY(${-24 * easeOut(seg(p, 0.015, 0.07))}px)`, 1 - seg(p, 0.015, 0.06));
    P.hero.style.visibility = p > 0.07 ? 'hidden' : '';
    fade(P.losa, 0.06 * m);
    if (full) { fade(P.sun1, 0.7 * (1 - s * 0.7)); fade(P.sun2, 0.55 * s); }

    // 2. The story inside the same phone.
    const settle = easeOut(seg(s, 0, 0.2));
    put(P.plane, `scale(${(1 + 2.6 * (1 - m)) * (1.06 - 0.06 * settle)})${full ? ` rotateX(${12 * (1 - settle) * m}deg)` : ''}`, seg(m, 0.25, 0.7));
    PINS.forEach((_, i) => {
      const d = i === HOUSE_PIN ? seg(m, 0.7, 1) : easeOut(seg(s, 0.02 + i * 0.02, 0.09 + i * 0.02));
      const grow = i === HOUSE_PIN ? 1 + 0.4 * easeOut(seg(s, 0.2, 0.26)) : 1;
      put(P[`pin${i}`], `translate(-50%, -100%) translateY(${-24 * (1 - d)}px) scale(${(0.6 + 0.4 * d) * grow})`, d);
    });
    put(P.ui, `translateY(${-10 * (1 - seg(m, 0.6, 1))}px)`, seg(m, 0.6, 1));
    P.chip.classList.toggle('on', s > 0.12);
    put(P.sheet, `translateY(${(1 - easeOut(seg(s, 0.26, 0.36))) * 105}%)`);
    fade(P.heart, seg(s, 0.4, 0.44));
    const saved = easeOut(seg(s, 0.42, 0.46)) * (1 - seg(s, 0.49, 0.52));
    put(P.saved, `translateY(${(1 - saved) * 8}px)`, saved);
    put(P.chat, `translateX(${(1 - easeOut(seg(s, 0.5, 0.6))) * 102}%)`);
    for (const [name, a, b] of BUBBLES) { const t = easeOut(seg(s, a, b)); put(P[name], `translateY(${(1 - t) * 12}px)`, t); }
    const visit = easeOut(seg(s, 0.76, 0.84));
    put(P.visit, `translateY(${(1 - visit) * 14}px) scale(${0.96 + 0.04 * visit})`, visit);
    const ok = seg(s, 0.87, 0.93);
    fade(P.wait, 1 - ok);
    fade(P.ok, ok);
    P.tick.style.clipPath = `inset(0 ${100 - easeOut(ok) * 100}% 0 0)`;
    setStep(p < 0.1 ? -1 : stepAt(s, 4));
  }, [mode, parts, still]);

  useStage(track, frame);

  // Card sizes depend on the visual area; on phones the card also moves up into the room the hero copy leaves.
  useEffect(() => {
    const P = parts.current;
    const wide = matchMedia('(min-width: 1024px)');
    const measure = () => {
      const vis = P.visual.getBoundingClientRect();
      if (!vis.height) return;
      const base = cardSizes(vis.width, vis.height);
      let phoneH = base.phoneH, dy = 0;
      if (!wide.matches) {
        const from = P.stepsBox.getBoundingClientRect().bottom + 14, to = vis.bottom - 4;
        phoneH = Math.min(to - from, 640);
        dy = (from + to) / 2 - (vis.top + vis.bottom) / 2;
      }
      sizes.current = { ...base, phoneH, phoneW: (phoneH * 9) / 19.5, dy };
      P.transom.style.width = `${base.iw}px`;
      frame(progress.current);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(P.stage);
    document.fonts?.ready.then(measure);
    measure();
    return () => observer.disconnect();
  }, [frame, parts]);

  return (
    <section ref={track} id="como-funciona" className="journey track" style={{ '--screens': 5.6 } as CSSProperties} aria-labelledby="hero-title">
      <span id="app" className="absolute top-[22%]" aria-hidden="true" />
      <div className="stage" data-part="stage">
        <div className="glow glow-sol" data-part="sun1" aria-hidden="true" />
        <div className="glow glow-terracota" data-part="sun2" aria-hidden="true" />
        <div className="losa journey-losa pinned-only" data-part="losa" aria-hidden="true" />
        <div className={`${WRAP} journey-layout`}>
          <div className="journey-text">
            <div className="journey-hero" data-part="hero">
              <div className="rise"><Eyebrow>Viviendas en Cuba</Eyebrow></div>
              <h1 id="hero-title" className="rise mt-5 text-[clamp(2.2rem,5.4vw,4.6rem)] leading-[1.05] sm:mt-6" style={{ animationDelay: '80ms' }}>
                Tu casa en Cuba,<br />para <span className="sr-only">comprar, vender, permutar o alquilar</span><VerbRotator />
              </h1>
              <p className="rise mt-4 max-w-[31rem] leading-relaxed text-body sm:mt-6 sm:text-[1.075rem]" style={{ animationDelay: '160ms' }}>
                Compra, vende, permuta o alquila, y habla directamente con quien publica. Gratis y sin comisión.
              </p>
              <div className="rise mt-6 flex flex-wrap items-center gap-x-7 gap-y-1 sm:mt-8 sm:gap-y-3" style={{ animationDelay: '240ms' }}>
                <a className={`${BUTTON} group`} href="#descargar">Descarga KarmaHouse para Android <ArrowRight className={ARROW} aria-hidden="true" /></a>
                <a className={LINK} href="#publicar">Publica tu vivienda <ArrowRight className={ARROW} aria-hidden="true" /></a>
              </div>
              <ul className="rise mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-body max-sm:hidden" style={{ animationDelay: '320ms' }} aria-label="Características de KarmaHouse">
                {PROOF.map((text) => (
                  <li key={text} className="flex items-center gap-2"><Check className="size-4 text-persiana" aria-hidden="true" />{text}</li>
                ))}
              </ul>
            </div>
            <div className="journey-steps" data-part="stepsBox">
              <ol>
                {JOURNEY.map((s, i) => (
                  <li key={s.label} className={i === step ? 'on' : undefined}>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-ocre">{i + 1} · {s.label}</p>
                    <h2 className="mt-3 text-[clamp(1.9rem,4.2vw,3.4rem)]"><Title title={s.title} accent={s.accent} /></h2>
                    <p className="mt-4 max-w-[30rem] leading-relaxed text-body">{s.text}</p>
                  </li>
                ))}
              </ol>
              <PhoneFrame className="static-only mx-auto mt-12 w-[min(300px,80vw)]" label="Pantalla Explorar de la app KarmaHouse: mapa del barrio con viviendas y la ficha de una vivienda. Imagen y datos ilustrativos.">
                <BarrioMap /><ExploreBar />
                <div className="absolute inset-x-0 bottom-0 z-10"><ListingSheet /></div>
              </PhoneFrame>
            </div>
          </div>
          <div className="journey-visual" data-part="visual">
            <div className="journey-card" data-part="card" role="img"
              aria-label="Ventana en arco con una vivienda que se convierte en la app KarmaHouse: mapa del barrio, ficha, conversación privada y propuesta de visita aceptada. Imagen y datos ilustrativos.">
              <div className="journey-transom" data-part="transom" aria-hidden="true"><Mediopunto className="block w-full" delay={0.35} /><i /></div>
              <div className="journey-screen" data-part="screen" aria-hidden="true">
                <div className="journey-plane pinned-only" data-part="plane"><BarrioMap part="" /></div>
                <div className="journey-photo" data-part="photo">
                  <picture>
                    <source type="image/avif" srcSet="/vedado-640.avif 640w, /vedado-1200.avif 1200w" sizes="(min-width: 1024px) 420px, 90vw" />
                    <img src="/vedado.jpg" width="1200" height="800" alt="" fetchPriority="high" className="size-full object-cover object-[58%_center]" />
                  </picture>
                  <div className="absolute inset-0 bg-gradient-to-t from-mar/70 via-mar/0 to-mar/0" />
                  <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-cal/90 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur"><MapPin className="size-3.5 text-terracota" aria-hidden="true" />Hecho para Cuba</span>
                  <p className="absolute bottom-5 left-5 font-display text-[clamp(.95rem,4.2cqw,1.6rem)] leading-tight text-white">Cada hogar,<br />un nuevo comienzo.</p>
                </div>
                <div className="journey-ui pinned-only" data-part="ui"><ExploreBar part="" /><BottomNav /></div>
                <div className="journey-sheet pinned-only" data-part="sheet"><ListingSheet part="" /></div>
                <div className="journey-chat pinned-only" data-part="chat"><ChatScreen part="" /></div>
              </div>
            </div>
            <p className="journey-caption" data-part="caption">Imagen ilustrativa. No corresponde a un anuncio.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
