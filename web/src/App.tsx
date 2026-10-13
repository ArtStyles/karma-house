import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { ArrowRight, Menu, Pause, Play } from 'lucide-react';
import { CODE, CONTACT, LEGAL, NAV, RELEASE, structuredData } from './content';
import { Download } from './scenes/Download';
import { Questions } from './scenes/Questions';
import { Tour, useStill } from './scenes/Tour';
import { Trust } from './scenes/Trust';
import { ARROW, BUTTON, Cenefa, WRAP } from './ui';

function Brand() {
  return (
    <a className="inline-flex min-h-11 shrink-0 items-center gap-2.5 text-[1.35rem] tracking-[-.04em] text-blue" href="./" aria-label="KarmaHouse, inicio">
      <img src="/karmahouse-mark.png" width="40" height="31" alt="" className="h-[31px] w-10 object-contain dark:brightness-0 dark:invert" /><span><b className="font-extrabold">Karma</b>House</span>
    </a>
  );
}

/** Id of the navigation section crossing the middle of the viewport. */
function useCurrentSection() {
  const [current, setCurrent] = useState('');
  useEffect(() => {
    // A stop of the walk is marked by a small anchor; its article spans the whole pause, so watch that instead.
    const ids = new Map<Element, string>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = ids.get(entry.target)!;
        setCurrent((current) => (entry.isIntersecting ? id : current === id ? '' : current));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    for (const [id] of NAV) {
      const el = document.getElementById(id);
      if (!el) continue;
      const box = el.closest('article') ?? el;
      ids.set(box, id);
      observer.observe(box);
    }
    return () => observer.disconnect();
  }, []);
  return current;
}

// Native <details> keeps the menu usable; this only closes it after a choice or on Escape.
function MobileMenu({ current }: { current: string }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const onClick = (event: MouseEvent) => {
    if ((event.target as Element).closest('a[href^="#"]')) menu.current!.open = false;
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && menu.current!.open) {
      menu.current!.open = false;
      menu.current!.querySelector('summary')!.focus();
    }
  };
  return (
    <details className="relative md:hidden" ref={menu} onClick={onClick} onKeyDown={onKeyDown}>
      <summary className="flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold"><Menu className="size-4" aria-hidden="true" />Menú</summary>
      <nav aria-label="Navegación móvil" className="absolute right-0 top-[calc(100%+12px)] grid w-64 rounded-3xl border border-line bg-paper p-2 shadow-2xl">
        {[...NAV, ['descargar', 'Descargar app'] as const].map(([id, label]) => (
          <a key={id} href={`#${id}`} aria-current={current === id ? 'true' : undefined} className="flex min-h-11 items-center rounded-2xl px-4 text-sm hover:bg-arena aria-[current=true]:font-semibold aria-[current=true]:text-blue">{label}</a>
        ))}
      </nav>
    </details>
  );
}

function Header({ still, onToggle }: { still: boolean; onToggle: () => void }) {
  const current = useCurrentSection();
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-cal/85 backdrop-blur-md">
      <div className={`${WRAP} flex h-[76px] items-center justify-between gap-6`}>
        <Brand />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegación principal">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} aria-current={current === id ? 'true' : undefined} className="flex min-h-11 items-center text-sm text-body transition-colors hover:text-blue aria-[current=true]:font-semibold aria-[current=true]:text-blue">{label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {/* Shown by CSS only where the walk can animate (scenes.css). */}
          <button type="button" className="walk-switch size-11 items-center justify-center rounded-full text-body transition-colors hover:bg-arena hover:text-blue active:scale-[.98]" title={still ? 'Ver con animación' : 'Ver sin animación'} onClick={onToggle}>
            {still ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
            <span className="sr-only">{still ? 'Ver con animación' : 'Ver sin animación'}</span>
          </button>
          <a className={`${BUTTON} group min-h-11 px-5 max-sm:hidden`} href="#descargar">Descargar app <ArrowRight className={ARROW} aria-hidden="true" /></a>
          <MobileMenu current={current} />
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const column = 'flex flex-col items-start gap-0.5 text-sm [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-body [&_a:hover]:text-blue';
  return (
    <footer className="bg-arena">
      <Cenefa />
      <div className={`${WRAP} pb-8 pt-14`}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div><Brand /><p className="mt-4 text-sm leading-relaxed text-body">Un espacio para encontrar tu lugar.<br />Compra, venta, permuta y alquiler en Cuba.</p></div>
          <nav aria-label="Conoce KarmaHouse" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">KarmaHouse</h2><a href="#como-funciona">Cómo funciona</a><a href="#conversa">Chat privado</a><a href="#cuba">Toda Cuba</a><a href="#publicar">Publicar una vivienda</a><a href="#descargar">Android</a></nav>
          <nav aria-label="Ayuda y versiones" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">Te ayudamos</h2><a href="#preguntas">Preguntas frecuentes</a><a href={CONTACT}>Contacto</a><a href={RELEASE}>Versiones públicas</a><a href={CODE}>Código del proyecto</a></nav>
          <nav aria-label="Información legal" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">Legal</h2><a href={`${LEGAL}/privacidad.html`}>Privacidad</a><a href={`${LEGAL}/terminos.html`}>Términos de uso</a><a href={`${LEGAL}/eliminar-cuenta.html`}>Eliminar tu cuenta</a></nav>
        </div>
        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-line pt-6 text-xs text-body sm:flex-row"><span>© 2026 KarmaHouse</span><p>Las fotografías, la conversación y los formularios mostrados son ilustrativos. No representan anuncios ni usuarios reales.</p></div>
      </div>
    </footer>
  );
}

export default function App() {
  const [still, toggleStill] = useStill();
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <a className="fixed left-4 top-3 z-[60] -translate-y-24 rounded-full bg-paper px-5 py-3 text-sm font-semibold shadow-lg focus:translate-y-0" href="#contenido">Saltar al contenido</a>
        <Header still={still} onToggle={toggleStill} />
        <main id="contenido">
          <Tour still={still} onToggle={toggleStill} />
          <Trust />
          <Download />
          <Questions />
        </main>
        <Footer />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }} />
      </MotionConfig>
    </LazyMotion>
  );
}
