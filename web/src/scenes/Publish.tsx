import { useCallback, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { ASSISTED_CONTACT, ASSISTED_EMAIL, PUBLISH } from '../content';
import { fade, put, useMode, useParts, useStage } from '../motion';
import { PhoneFrame, PublishScreen } from '../phone/Phone';
import { easeOut, seg, stepAt } from '../scroll';
import { ARROW, BUTTON, Eyebrow, Title, WRAP } from '../ui';

/** Paste an ad and the form fills itself, it goes through review, and it appears on the map. */
export function Publish() {
  const track = useRef<HTMLDivElement>(null);
  const mode = useMode();
  const { parts, still } = useParts(track);
  const [step, setStep] = useState(0);

  const frame = useCallback((p: number) => {
    if (still(mode.current === 'static')) return;
    const P = parts.current, s = seg(p, 0.06, 1);
    const press = (a: number) => 1 - 0.05 * Math.sin(Math.PI * seg(s, a, a + 0.05));
    put(P['pub-paste'], `scale(${press(0.03)})`);
    const note = easeOut(seg(s, 0.05, 0.13));
    put(P['pub-note'], `translateY(${(1 - note) * -36}px)`, note);
    for (let i = 0; i < 4; i++) {
      const f = easeOut(seg(s, 0.14 + i * 0.04, 0.2 + i * 0.04));
      P[`pub-f${i}`].style.clipPath = `inset(0 ${(1 - f) * 100}% 0 0)`;
    }
    put(P['pub-send'], `scale(${press(0.36)})`);
    put(P['pub-status'], `translateY(${(1 - easeOut(seg(s, 0.4, 0.48))) * 140}%)`);
    const live = seg(s, 0.56, 0.62);
    fade(P['pub-review'], 1 - live);
    fade(P['pub-live'], live);
    put(P['pub-map'], `translateX(${(1 - easeOut(seg(s, 0.68, 0.78))) * 102}%)`);
    const pin = easeOut(seg(s, 0.8, 0.88));
    put(P['pub-pin'], `translate(-50%, -100%) translateY(${-28 * (1 - pin)}px) scale(${0.6 + 0.4 * pin})`, pin);
    const toast = easeOut(seg(s, 0.88, 0.94));
    put(P['pub-toast'], `translateY(${(1 - toast) * 8}px)`, toast);
    setStep(stepAt(s, 3));
  }, [mode, parts, still]);

  useStage(track, frame);

  return (
    <section id="publicar" aria-labelledby="publication-title">
      <div ref={track} className="publish track" style={{ '--screens': 3.6 } as CSSProperties}>
        <div className="stage">
          <div className={`${WRAP} publish-layout`}>
            <div>
              <Eyebrow>Dale un lugar a tu vivienda</Eyebrow>
              <h2 id="publication-title" className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">Publica en <span className="text-blue">tres gestos.</span></h2>
              <ol className="publish-steps mt-8">
                {PUBLISH.map((s, i) => (
                  <li key={s.label} className={i === step ? 'on' : undefined}>
                    <p className="text-xs font-bold uppercase tracking-[.16em] text-ocre">{i + 1} · {s.label}</p>
                    <h3 className="mt-2 text-[clamp(1.5rem,3vw,2.2rem)]"><Title title={s.title} accent={s.accent} /></h3>
                    <p className="mt-3 max-w-[28rem] leading-relaxed text-body">{s.text}</p>
                  </li>
                ))}
              </ol>
            </div>
            <div className="publish-visual">
              <PhoneFrame className="publish-phone" label="Pantalla Publicar de la app KarmaHouse: un anuncio pegado rellena el formulario, pasa la revisión y aparece en el mapa. Ejemplo de uso.">
                <PublishScreen part="pub-" />
              </PhoneFrame>
            </div>
          </div>
        </div>
      </div>
      <div className={`${WRAP} grid gap-6 pb-20 md:grid-cols-2 lg:pb-28`}>
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
