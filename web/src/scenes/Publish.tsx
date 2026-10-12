import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { ASSISTED_CONTACT, ASSISTED_EMAIL, PUBLISH } from '../content';
import { fade, put, useMode, useParts, useStage } from '../motion';
import { MapScreen, PasteScreen, ReviewScreen } from '../phone/Phone';
import { seg, smooth, stepAt } from '../scroll';
import { ARROW, BUTTON, Eyebrow, Title, WRAP } from '../ui';

const SCREENS = [PasteScreen, ReviewScreen, MapScreen];
const LABELS = [
  'Pantalla Nuevo anuncio de la app: un texto pegado rellena operación, tipo, provincia, habitaciones y baños. Ejemplo de uso.',
  'Pantalla Mis anuncios: el anuncio pasa de enviado a en revisión y a publicado. Imagen ilustrativa.',
  'Mapa del barrio con la vivienda publicada y su ubicación aproximada. Ejemplo de uso.',
];

/** «Publica en tres gestos» as a book: each page turns over its left edge as you scroll, revealing the next. */
export function Publish() {
  const track = useRef<HTMLDivElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const [step, setStep] = useState(0);

  const frame = useCallback((p: number) => {
    if (still(mode.current === 'static')) return;
    const s = seg(p, 0.04, 0.96);
    let turned = 1;
    PUBLISH.forEach((_, k) => {
      const turn = k < PUBLISH.length - 1 ? smooth(seg(s, (k + 1) / 3 - 0.13, (k + 1) / 3 + 0.02)) : 0;
      put(parts.current[`page${k}`], `rotateY(${-104 * turn}deg) scale(${0.96 + 0.04 * turned})`);
      fade(parts.current[`shade${k}`], 0.5 * turn);
      turned = turn;
    });
    setStep(stepAt(s, 3));
  }, [mode, parts, still]);

  useStage(track, frame);

  return (
    <section id="publicar" aria-labelledby="publication-title">
      <div className={`${WRAP} pt-20 lg:pt-28`}>
        <Eyebrow>Dale un lugar a tu vivienda</Eyebrow>
        <h2 id="publication-title" className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">Publica en <span className="text-blue">tres gestos.</span></h2>
        <p className="mt-4 max-w-[34rem] leading-relaxed text-body">Así preparas tu anuncio en la app. Pasa la página.</p>
      </div>
      <div ref={track} className="publish track" style={{ '--screens': 3.4 } as CSSProperties}>
        <div className="stage">
          <div className={`${WRAP} h-full`}>
            <div className="book">
              {PUBLISH.map((s, k) => {
                const Screen = SCREENS[k];
                return (
                  <article key={s.label} className={`page${k === step ? ' on' : ''}`} data-part={`page${k}`}>
                    <div>
                      <div className="page-head"><p className="page-num">{k + 1}</p><p className="page-label">{s.label}</p></div>
                      <h3 className="page-title"><Title title={s.title} accent={s.accent} /></h3>
                      <p className="page-copy">{s.text}</p>
                    </div>
                    <div className="page-visual" role="img" aria-label={LABELS[k]}><div className="grid size-full place-items-center" aria-hidden="true"><Screen /></div></div>
                    <span className="page-shade" data-part={`shade${k}`} aria-hidden="true" />
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className={`${WRAP} grid gap-6 pb-20 pt-6 md:grid-cols-2 lg:pb-28`}>
        <article className="min-w-0 rounded-3xl border border-line bg-paper p-6 sm:p-8">
          <h3 className="text-2xl">Publicar por mi cuenta</h3>
          <p className="mt-5 text-[15px] leading-relaxed text-body">Entra en «Publicar» desde la app. Completa los datos y añade tus fotos; si ya tienes el texto, usa «Pegar anuncio» y revisa el resultado antes de enviarlo.</p>
          <a className={`${BUTTON} group mt-6 max-w-full`} href="#descargar">Empezar en la app <ArrowRight className={ARROW} aria-hidden="true" /></a>
        </article>
        <article className="min-w-0 rounded-3xl border border-line bg-paper p-6 sm:p-8">
          <h3 className="text-2xl">¿Prefieres ayuda?</h3>
          <p className="mt-5 text-[15px] leading-relaxed text-body">KarmaHouse puede preparar el anuncio contigo por correo. Escríbenos con la operación, provincia, zona aproximada, características, precio y moneda o condiciones. Adjunta fotos propias y nítidas si ofreces una vivienda.</p>
          <p className="mt-5 text-[15px] leading-relaxed text-body">Revisamos el anuncio contigo. La cuenta oficial necesita tu autorización expresa antes de publicarlo. Si después solicitas gestionarlo, podrás aceptar o rechazar una invitación de traspaso que conserva el enlace, las fotos y los favoritos.</p>
          <a className={`${BUTTON} group mt-6 max-w-full`} href={ASSISTED_CONTACT}>Escribir para pedir ayuda <MessageCircle className="size-4 shrink-0" aria-hidden="true" /></a>
          <p className="mt-5 break-words text-sm leading-relaxed text-body">Se abrirá tu aplicación de correo. Revisa y envía el mensaje desde allí. También puedes escribir directamente a <a className="text-blue underline underline-offset-4" href={`mailto:${ASSISTED_EMAIL}`}>{ASSISTED_EMAIL}</a>.</p>
        </article>
      </div>
    </section>
  );
}
