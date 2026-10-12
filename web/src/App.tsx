import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { ArrowRight, Menu, MessageCircle, Plus, ShieldCheck, Smartphone } from 'lucide-react';
import { Cenefa, Mediopunto, Reveal, Stagger, StaggerItem } from './ui';
import { Cuba } from './scenes/Cuba';
import { Publish } from './scenes/Publish';
import { Tagline } from './scenes/Tagline';
import { Journey } from './scenes/Journey';

const RELEASE = 'https://github.com/ArtStyles/karma-house/releases';
const APK = `${RELEASE}/download/v0.1.20/KarmaHouse.apk`;
const SHA = `${APK}.sha256`;
const NOTES = `${RELEASE}/tag/v0.1.20`;
const INSTALL = `${RELEASE}/download/v0.1.20/INSTALACION.txt`;
const LEGAL = 'https://artstyles.github.io/karma-house';
const CONTACT = 'mailto:hernandezfrankjames@gmail.com';
const ASSISTED_EMAIL = 'fejames07@gmail.com';
const ASSISTED_CONTACT = `mailto:${ASSISTED_EMAIL}?subject=Ayuda%20para%20publicar%20en%20KarmaHouse`;

const WRAP = 'mx-auto w-full max-w-[1280px] px-4 sm:px-8 lg:px-12';
const BUTTON = 'inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-blue px-6 text-sm font-semibold text-on-blue transition hover:bg-blue-hover active:scale-[.98]';
const LINK = 'group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink transition-colors hover:text-blue';
const ARROW = 'size-4 transition-transform group-hover:translate-x-1';

function Eyebrow({ children, className = 'text-ocre' }: { children: string; className?: string }) {
  return <p className={`flex items-center gap-3 text-xs font-bold uppercase tracking-[.16em] ${className}`}><span className="h-0.5 w-8 bg-sol" aria-hidden="true" />{children}</p>;
}

function Brand() {
  return (
    <a className="inline-flex min-h-11 shrink-0 items-center gap-2.5 text-[1.35rem] tracking-[-.04em] text-blue" href="./" aria-label="KarmaHouse, inicio">
      <img src="/karmahouse-mark.png" width="40" height="31" alt="" className="h-[31px] w-10 object-contain" /><span><b className="font-extrabold">Karma</b>House</span>
    </a>
  );
}

const SECTIONS = [['#posibilidades', 'Qué puedes hacer'], ['#app', 'La experiencia'], ['#como-funciona', 'Cómo funciona'], ['#preguntas', 'Preguntas']];

// Native <details> keeps the menu usable; this only closes it after a choice or on Escape.
function MobileMenu() {
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
        {[...SECTIONS, ['#descargar', 'Descargar app']].map(([href, label]) => (
          <a key={href} href={href} className="flex min-h-11 items-center rounded-2xl px-4 text-sm hover:bg-arena">{label}</a>
        ))}
      </nav>
    </details>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-line/70 bg-cal/85 backdrop-blur-md">
      <div className={`${WRAP} flex h-[76px] items-center justify-between gap-6`}>
        <Brand />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Navegación principal">
          {SECTIONS.map(([href, label]) => <a key={href} href={href} className="flex min-h-11 items-center text-sm text-body transition-colors hover:text-blue">{label}</a>)}
        </nav>
        <div className="flex items-center gap-3">
          <a className={`${BUTTON} group min-h-11 px-5 max-sm:hidden`} href="#descargar">Descargar app <ArrowRight className={ARROW} aria-hidden="true" /></a>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

function SectionHeading({ eyebrow, title, id, aside }: { eyebrow: string; title: ReactNode; id: string; aside: ReactNode }) {
  return (
    <Reveal className="grid items-end gap-6 md:grid-cols-[1.3fr_1fr]">
      <div><Eyebrow>{eyebrow}</Eyebrow><h2 id={id} className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">{title}</h2></div>
      <p className="text-[15px] leading-relaxed text-body md:justify-self-end md:text-right">{aside}</p>
    </Reveal>
  );
}

function Trust() {
  return (
    <section className="pb-20 lg:pb-28" aria-labelledby="trust-title">
      <div className={WRAP}>
        <div className="relative grid gap-12 overflow-hidden rounded-[40px] border border-line bg-paper p-7 sm:p-12 lg:grid-cols-[.9fr_1.1fr] lg:p-16">
          <Reveal className="relative">
            <span className="grid size-12 place-items-center rounded-2xl bg-persiana/10 text-persiana"><ShieldCheck className="size-6" aria-hidden="true" /></span>
            <div className="mt-7"><Eyebrow className="text-persiana">Más claridad, desde el inicio</Eyebrow></div>
            <h2 id="trust-title" className="mt-5 text-[clamp(2.1rem,4vw,3.2rem)]">Tu confianza<br />también tiene su lugar.</h2>
            <p className="mt-5 max-w-[22rem] text-[15px] leading-relaxed text-body">Herramientas para compartir lo necesario y mantener el control de tu experiencia.</p>
          </Reveal>
          <Stagger className="relative grid gap-3">
            {[
              ['Revisión antes de publicar', 'Los anuncios pasan por moderación. Una revisión del anuncio no certifica la propiedad ni sustituye las comprobaciones antes de un acuerdo.'],
              ['Tu ubicación, a tu manera', 'Quien publica puede indicar una ubicación exacta o aproximada. Decide cuánto compartir.'],
              ['Control de tu cuenta', 'Reporta anuncios, bloquea contactos o elimina tu cuenta y tus datos desde Ajustes.'],
            ].map(([title, text], i) => (
              <StaggerItem key={title} as="article" className="flex gap-5 rounded-3xl bg-cal p-6">
                <span className="pt-0.5 font-display text-lg text-persiana">0{i + 1}</span>
                <div><h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3><p className="mt-1.5 text-sm leading-relaxed text-body">{text}</p></div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  );
}

function Download() {
  return (
    <section className="pb-20 lg:pb-28" id="descargar" aria-labelledby="android-title">
      <div className={WRAP}>
        <div className="relative grid gap-12 overflow-hidden rounded-[40px] bg-mar px-6 py-14 text-espuma sm:px-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-14 lg:p-16">
          <Mediopunto lit="always" className="pointer-events-none absolute -bottom-[26rem] left-1/2 w-[64rem] max-w-none -translate-x-1/2 opacity-[.14]" />
          <Reveal className="relative">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-sol">
              <span className="relative flex size-2" aria-hidden="true"><span className="absolute inline-flex size-full rounded-full bg-sol opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex size-2 rounded-full bg-sol" /></span>
              Disponible para Android · 0.1.20
            </span>
            <h2 id="android-title" className="mt-7 text-[clamp(2.3rem,4.4vw,3.8rem)] text-white">Tu búsqueda,<br /><span className="text-sol">también en tu bolsillo.</span></h2>
            <p className="mt-6 max-w-[28rem] leading-relaxed">KarmaHouse para Android reúne catálogo, mapa y conversaciones. Fotos optimizadas y ahorro de datos para aprovechar mejor tu conexión.</p>
            <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3">
              <a className="group inline-flex min-h-12 items-center gap-3 rounded-full bg-sol px-6 text-sm font-semibold text-mar transition hover:bg-[#f0c46a] active:scale-[.98]" href={APK}>Descargar APK <ArrowRight className={ARROW} aria-hidden="true" /></a>
              <a className="inline-flex min-h-11 items-center text-sm font-semibold text-white underline-offset-4 hover:underline" href={NOTES}>Ver la versión</a>
            </div>
            <p className="mt-7 text-xs leading-relaxed">Versión 0.1.20 · Android 7 o superior<br />Publicar y contactar es gratis</p>
            <p className="mt-3 text-xs leading-relaxed">APK firmado con el certificado oficial de KarmaHouse. <a className="text-white underline underline-offset-4" href={INSTALL}>Instrucciones para instalar y actualizar</a> · <a className="text-white underline underline-offset-4" href={SHA}>Comprobación SHA-256</a></p>
          </Reveal>
          <Reveal delay={0.1} className="relative rounded-[28px] border border-white/10 bg-white/[.04] p-7 backdrop-blur-sm">
            <Smartphone className="size-8 text-sol" aria-hidden="true" />
            <h3 className="mt-5 font-sans text-lg font-semibold tracking-normal text-white">Instala KarmaHouse en tres pasos</h3>
            <ol className="mt-6 grid gap-5">
              {[
                ['Descarga y abre el APK.', 'Usa el botón de esta página. Si Android lo solicita, autoriza al navegador para instalar desde este origen.'],
                ['Deja que Android lo analice.', 'Mantén Play Protect activo. Si solicita un análisis, espera el resultado antes de instalar.'],
                ['Entra y empieza.', 'Inicia sesión o regístrate con tu correo y confirma el enlace que recibas. Para actualizar, instala sobre la versión anterior.'],
              ].map(([title, text], i) => (
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

const FAQ: [string, ReactNode][] = [
  ['¿Cuánto cuesta usar KarmaHouse?', 'Publicar, buscar y conversar es gratis. KarmaHouse no cobra comisión por las operaciones ni interviene en la negociación entre las partes.'],
  ['¿Ya puedo descargar la app?', <>Sí. KarmaHouse 0.1.20 está disponible para Android 7 o superior. <a href={APK}>Descarga el APK oficial</a> e instálalo siguiendo las instrucciones de esta página. Si ya tienes KarmaHouse, instala la actualización sobre la versión anterior.</>],
  ['¿Por qué Android puede mostrar un aviso?', 'El APK se instalará fuera de Google Play. Android puede pedir autorización para ese origen y Play Protect puede solicitar un análisis. Mantén Play Protect activo y espera el resultado. Si identifica el archivo como dañino, detén la instalación y contacta con nosotros.'],
  ['¿Cómo compruebo que el APK es el original?', <>Descárgalo desde el enlace oficial de esta página y compara su hash con el <a href={SHA}>archivo SHA-256 de esta versión</a>. Las <a href={NOTES}>notas de la entrega</a> también lo incluyen. Compararlo permite detectar cambios; no sustituye al análisis de Play Protect ni implica una aprobación de Google.</>],
  ['¿Quién ve mi teléfono o mi correo?', 'Otros usuarios no ven esos datos de tu cuenta. La conversación ocurre dentro de la app y puedes bloquear o reportar contactos.'],
  ['¿Qué significa que un anuncio esté revisado?', 'Se modera antes de aparecer en el catálogo. Si se rechaza, quien publica puede consultar el motivo y corregirlo. La revisión no certifica la titularidad del inmueble ni garantiza una operación.'],
  ['¿Puedo usarla sin Internet?', 'Necesitas conexión para consultar el catálogo y conversar. Los borradores de tus anuncios se guardan en el teléfono hasta que puedas publicarlos.'],
  ['¿Qué ocurre con los enlaces a viviendas?', 'Un enlace compartido permite consultar la ficha de una vivienda publicada en el navegador. Con la app instalada, puedes abrirla en KarmaHouse para guardarla o escribir.'],
];

function Questions() {
  return (
    <section className="pb-24 lg:pb-32" id="preguntas" aria-labelledby="questions-title">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20`}>
        <Reveal className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow>Antes de empezar</Eyebrow>
          <h2 id="questions-title" className="mt-5 text-[clamp(2.1rem,4vw,3.2rem)]">Buenas preguntas.<br />Respuestas claras.</h2>
          <p className="mt-5 text-[15px] text-body">Lo esencial sobre KarmaHouse, tu cuenta y la instalación.</p>
          <a className={`${LINK} mt-4 text-blue!`} href={CONTACT}>Escríbenos si necesitas ayuda <ArrowRight className={ARROW} aria-hidden="true" /></a>
        </Reveal>
        <Reveal delay={0.1} className="faq border-t border-line">
          {FAQ.map(([question, answer]) => (
            <details key={question} className="group border-b border-line">
              <summary className="flex min-h-16 items-center justify-between gap-6 py-4 text-[15px] font-semibold transition-colors hover:text-blue">
                {question}<span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-blue transition-transform duration-300 group-open:rotate-45"><Plus className="size-4" aria-hidden="true" /></span>
              </summary>
              <p className="pb-6 pr-12 text-[15px] leading-relaxed text-body [&_a]:text-blue [&_a]:underline [&_a]:underline-offset-4">{answer}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
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
          <nav aria-label="Conoce KarmaHouse" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">KarmaHouse</h2><a href="#posibilidades">Qué puedes hacer</a><a href="#app">La experiencia</a><a href="#publicar">Publicar una vivienda</a><a href="#como-funciona">Cómo funciona</a><a href="#descargar">Android</a></nav>
          <nav aria-label="Ayuda y versiones" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">Te ayudamos</h2><a href="#preguntas">Preguntas frecuentes</a><a href={CONTACT}>Contacto</a><a href={RELEASE}>Versiones públicas</a><a href="https://github.com/ArtStyles/karma-house">Código del proyecto</a></nav>
          <nav aria-label="Información legal" className={column}><h2 className="mb-2 font-sans text-sm font-semibold tracking-normal">Legal</h2><a href={`${LEGAL}/privacidad.html`}>Privacidad</a><a href={`${LEGAL}/terminos.html`}>Términos de uso</a><a href={`${LEGAL}/eliminar-cuenta.html`}>Eliminar tu cuenta</a></nav>
        </div>
        <div className="mt-12 flex flex-col justify-between gap-3 border-t border-line pt-6 text-xs text-body sm:flex-row"><span>© 2026 KarmaHouse</span><p>Las fotografías y la conversación mostradas son ilustrativas. No representan anuncios ni usuarios reales.</p></div>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <a className="fixed left-4 top-3 z-[60] -translate-y-24 rounded-full bg-paper px-5 py-3 text-sm font-semibold shadow-lg focus:translate-y-0" href="#contenido">Saltar al contenido</a>
        <Header />
        <main id="contenido">
          <Journey />
          <Cuba />
          <Tagline />
          <Publish />
          <Trust />
          <Download />
          <Questions />
        </main>
        <Footer />
      </MotionConfig>
    </LazyMotion>
  );
}
