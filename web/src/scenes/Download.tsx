import { ArrowRight, Smartphone } from 'lucide-react';
import { APK, INSTALL, INSTALL_STEPS, NOTES, SHA, VERSION } from '../content';
import { ARROW, Mediopunto, Reveal, SOL_BUTTON, WRAP } from '../ui';

/** The navy panel that closes the page. The large mediopunto lights pane by pane when it scrolls into view. */
export function Download() {
  return (
    <section className="pb-20 lg:pb-28" id="descargar" aria-labelledby="android-title">
      <div className={WRAP}>
        <div className="relative grid gap-12 overflow-hidden rounded-[40px] bg-mar px-6 py-14 text-espuma sm:px-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-14 lg:p-16">
          <Mediopunto lit="view" delay={0.1} className="pointer-events-none absolute -bottom-[26rem] left-1/2 w-[64rem] max-w-none -translate-x-1/2 opacity-[.16]" />
          <Reveal className="relative">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-sol">
              <span className="relative flex size-2" aria-hidden="true"><span className="absolute inline-flex size-full rounded-full bg-sol opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex size-2 rounded-full bg-sol" /></span>
              Disponible para Android · {VERSION}
            </span>
            <h2 id="android-title" className="mt-7 text-[clamp(2.3rem,4.4vw,3.8rem)] text-white">Tu búsqueda,<br /><span className="text-sol">también en tu bolsillo.</span></h2>
            <p className="mt-6 max-w-[28rem] leading-relaxed">KarmaHouse para Android reúne catálogo, mapa y conversaciones. Fotos optimizadas y ahorro de datos para aprovechar mejor tu conexión.</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3">
              <a className={SOL_BUTTON} href={APK}>Descarga KarmaHouse para Android <ArrowRight className={ARROW} aria-hidden="true" /></a>
              <a className="inline-flex min-h-11 items-center text-sm font-semibold text-white underline-offset-4 hover:underline" href={NOTES}>Ver la versión</a>
            </div>
            <p className="mt-7 text-xs leading-relaxed">Versión {VERSION} · Android 7 o superior<br />Publicar, buscar y conversar es gratis</p>
            <p className="mt-3 text-xs leading-relaxed">APK firmado con el certificado oficial de KarmaHouse. <a className="text-white underline underline-offset-4" href={INSTALL}>Instrucciones para instalar y actualizar</a> · <a className="text-white underline underline-offset-4" href={SHA}>Comprobación SHA-256</a></p>
          </Reveal>
          <Reveal delay={0.1} className="relative rounded-[28px] border border-white/10 bg-white/[.04] p-7 backdrop-blur-sm">
            <Smartphone className="size-8 text-sol" aria-hidden="true" />
            <h3 className="mt-5 font-sans text-lg font-semibold tracking-normal text-white">Instala KarmaHouse en tres pasos</h3>
            <ol className="mt-6 grid gap-5">
              {INSTALL_STEPS.map(([title, text], i) => (
                <li key={title} className="flex gap-4">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sol/15 text-xs font-bold text-sol">{i + 1}</span>
                  <span className="text-sm leading-relaxed"><strong className="block text-white">{title}</strong>{text}</span>
                </li>
              ))}
            </ol>
            <a className="group mt-7 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-sol" href="#preguntas">Resuelve tus dudas sobre la instalación <ArrowRight className={ARROW} aria-hidden="true" /></a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
