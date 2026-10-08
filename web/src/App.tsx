import { useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation, m, useScroll, useTransform } from 'motion/react';
import {
  ArrowLeftRight, ArrowRight, Bell, Bookmark, CalendarDays, Check, ChevronDown, CirclePlus, CircleUser, Compass, Heart, House,
  KeyRound, Map as MapIcon, MapPin, Menu, MessageCircle, Plus, Search, ShieldCheck, SlidersHorizontal, Smartphone,
} from 'lucide-react';
import { Cenefa, Mediopunto, ProvinceMarquee, Reveal, Stagger, StaggerItem, VerbRotator } from './ui';

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

function HeroVisual() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 30]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.06, 1.16]);
  return (
    <figure ref={ref} className="relative mx-auto w-full max-w-[480px]">
      {/* A Cuban doorway: mediopunto transom over the door, the house seen through it. */}
      <div className="rounded-t-[999px] rounded-b-[34px] border border-line bg-paper p-2.5 shadow-[0_40px_80px_-40px_rgba(26,43,59,.45)]">
        <Mediopunto className="block w-full" delay={0.35} />
        <div className="my-1.5 h-2.5 rounded-full bg-ink/85" aria-hidden="true" />
        <div className="door relative aspect-[5/4] overflow-hidden rounded-b-[26px] rounded-t-md">
          <m.picture className="parallax absolute inset-0 block" style={{ y, scale }}>
            <source type="image/avif" srcSet="/vedado-640.avif 640w, /vedado-1200.avif 1200w" sizes="(min-width: 1024px) 460px, 92vw" />
            <img src="/vedado.jpg" width="1200" height="800" alt="Vivienda con portal, vegetación y jardín. Imagen ilustrativa." fetchPriority="high" className="size-full object-cover object-[58%_center]" />
          </m.picture>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" aria-hidden="true" />
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-cal/90 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur"><MapPin className="size-3.5 text-terracota" aria-hidden="true" />Hecho para Cuba</span>
          <p className="absolute bottom-5 left-5 font-display text-[1.6rem] leading-tight text-white">Cada hogar,<br />un nuevo comienzo.</p>
        </div>
      </div>
      <div className="rise absolute -right-3 bottom-28 hidden max-w-[17rem] items-center gap-3 rounded-2xl border border-line bg-paper/95 p-3.5 shadow-xl backdrop-blur sm:flex lg:-right-10" style={{ animationDelay: '1.2s' }}>
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-soft-blue text-blue"><MessageCircle className="size-5" aria-hidden="true" /></span>
        <span className="text-sm leading-snug"><strong className="block">Más cerca de tu próximo hogar</strong><span className="text-xs text-body">Mapa y conversación, en un mismo lugar.</span></span>
      </div>
      <figcaption className="mt-4 text-center text-xs text-body">Imagen ilustrativa. No corresponde a un anuncio.</figcaption>
    </figure>
  );
}

function Hero() {
  return (
    <section className="relative overflow-clip" aria-labelledby="hero-title">
      <div className={`${WRAP} grid items-center gap-14 pb-16 pt-10 lg:grid-cols-[1.2fr_1fr] lg:gap-14 lg:pb-24 lg:pt-14`}>
        <div>
          <div className="rise"><Eyebrow>Viviendas en Cuba</Eyebrow></div>
          <div className="rise" style={{ animationDelay: '80ms' }}>
            <h1 id="hero-title" className="mt-6 text-[clamp(2.6rem,5.4vw,4.6rem)] leading-[1.05]">
              Tu casa en Cuba,<br />para <span className="sr-only">comprar, vender, permutar o alquilar</span><VerbRotator />
            </h1>
          </div>
          <div className="rise" style={{ animationDelay: '160ms' }}><p className="mt-7 max-w-[30rem] text-[1.075rem] leading-relaxed text-body">Compra, vende, permuta o alquila. Un espacio para encontrar tu lugar en Cuba y hablar directamente con quien publica.</p></div>
          <div className="rise mt-9 flex flex-wrap items-center gap-x-7 gap-y-3" style={{ animationDelay: '240ms' }}>
            <a className={`${BUTTON} group`} href="#descargar">Descargar para Android <ArrowRight className={ARROW} aria-hidden="true" /></a>
            <a className={LINK} href="#publicar">Publica tu vivienda <ArrowRight className={ARROW} aria-hidden="true" /></a>
          </div>
          <div className="rise" style={{ animationDelay: '320ms' }}>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-body" aria-label="Características de KarmaHouse">
              {['Publicación gratuita', 'Chat privado', 'Anuncios revisados antes de publicarse'].map((text) => (
                <li key={text} className="flex items-center gap-2"><Check className="size-4 text-persiana" aria-hidden="true" />{text}</li>
              ))}
            </ul>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>
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

const OPERATIONS = [
  { icon: House, title: 'Comprar', text: 'Busca por zona, presupuesto y características. Guarda las viviendas que te interesen.', href: '#app', cta: 'Encuentra tu lugar', tone: 'text-blue bg-blue/10' },
  { icon: KeyRound, title: 'Vender', text: 'Presenta tu vivienda con fotos y detalles. Recibe consultas en su propia conversación.', href: '#como-funciona', cta: 'Da a conocer tu vivienda', tone: 'text-terracota bg-terracota/10' },
  { icon: ArrowLeftRight, title: 'Permutar', text: 'Cuenta qué ofreces y qué buscas a cambio, con o sin una diferencia de dinero.', href: '#como-funciona', cta: 'Explora otra posibilidad', tone: 'text-persiana bg-persiana/10' },
  { icon: CalendarDays, title: 'Alquilar', text: 'Publica o busca alquileres por mes o por noche, con el precio y las condiciones a la vista.', href: '#app', cta: 'Piensa en tu próxima estancia', tone: 'text-ocre bg-ocre/10' },
];

function Possibilities() {
  return (
    <section className="py-20 lg:py-28" id="posibilidades" aria-labelledby="possibilities-title">
      <div className={WRAP}>
        <SectionHeading eyebrow="Un lugar, muchas posibilidades" id="possibilities-title" title="¿Cuál es tu próximo paso?"
          aside={<>Hay distintas formas de cambiar de hogar.<br />KarmaHouse tiene un espacio para cada una.</>} />
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPERATIONS.map(({ icon: Icon, title, text, href, cta, tone }) => (
            <StaggerItem key={title} as="article" className="group relative flex flex-col rounded-[28px] border border-line bg-paper p-7 transition-[translate,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_30px_60px_-36px_rgba(26,43,59,.45)]">
              <span className={`grid size-12 place-items-center rounded-2xl ${tone}`}><Icon className="size-[22px]" aria-hidden="true" /></span>
              <h3 className="mt-7 text-[1.75rem]">{title}</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-body">{text}</p>
              <a className={`${LINK} mt-auto pt-6`} href={href}>{cta} <ArrowRight className={ARROW} aria-hidden="true" /></a>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

// The phone mirrors the real Android interface (same labels, colours and layout as the app's Explorar tab),
// with an illustrative photo and placeholder bars instead of an invented listing.
const APP = { paper: 'bg-[#F5F5F7]', ink: 'text-[#1D1D1F]', muted: 'text-[#68686D]', border: 'border-[#E5E5EA]' };

function PhoneScreen() {
  return (
    <div className={`relative h-full overflow-hidden ${APP.paper} ${APP.ink} px-3.5 pt-5 text-[11px]`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] tracking-[-.03em] text-[#0153A8]"><img src="/karmahouse-mark.png" alt="" width="20" height="16" className="h-4 w-5 object-contain" /><span><b className="font-extrabold">Karma</b>House</span></span>
        <span className="flex gap-1.5">{[Bell, MessageCircle].map((Icon, i) => <span key={i} className="grid size-7 place-items-center rounded-full bg-white"><Icon className="size-3.5" /></span>)}</span>
      </div>
      <p className="mt-3 text-[17px] font-bold tracking-[-.02em]">Encuentra tu casa en Cuba</p>
      <div className={`mt-2.5 flex items-center gap-2 rounded-full border ${APP.border} bg-white py-1 pl-3 pr-1`}>
        <Search className="size-3.5" /><span className={`flex-1 ${APP.muted}`}>Barrio, municipio o calle</span>
        <span className="grid size-6 place-items-center rounded-full bg-[#EAF3FF] text-[#0153A8]"><SlidersHorizontal className="size-3" /></span>
      </div>
      <div className="mt-2.5 flex gap-1.5 overflow-hidden whitespace-nowrap">
        <span className={`flex shrink-0 items-center gap-1 rounded-full border ${APP.border} bg-white px-2.5 py-1`}><MapPin className="size-3" />Toda Cuba<ChevronDown className="size-3" /></span>
        {['Casas', 'Apartamentos', 'Permutas'].map((chip) => <span key={chip} className={`shrink-0 rounded-full border ${APP.border} bg-white px-2.5 py-1`}>{chip}</span>)}
      </div>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <span className="flex items-center gap-0.5 text-[#0153A8]">Más recientes<ChevronDown className="size-3" /></span>
        <Bookmark className="size-3.5" />
        <span className={`flex items-center gap-1 rounded-full border ${APP.border} bg-white px-2 py-0.5`}><MapIcon className="size-3" />Mapa</span>
      </div>
      {[['/vedado-640.avif', '/vedado.jpg'], ['/interior-640.avif', '/interior.jpg']].map(([avif, jpg]) => (
        <div key={jpg} className="mt-2.5">
          <div className="relative h-[118px] overflow-hidden rounded-xl">
            <picture><source type="image/avif" srcSet={avif} /><img src={jpg} alt="" loading="lazy" className="size-full object-cover" /></picture>
            <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-white"><Heart className="size-3" /></span>
          </div>
          <div className="mt-2 space-y-1.5" aria-hidden="true">
            <span className="block h-2.5 w-1/2 rounded-full bg-[#DCDCE0]" /><span className="block h-2 w-4/5 rounded-full bg-[#E5E5EA]" /><span className="block h-2 w-3/5 rounded-full bg-[#E5E5EA]" />
          </div>
        </div>
      ))}
      <div className="absolute inset-x-3 bottom-3 flex justify-between rounded-full bg-white p-1 shadow-[0_6px_20px_rgba(0,0,0,.12)]">
        {[[Compass, 'Explorar'], [Heart, 'Favoritos'], [CirclePlus, 'Publicar'], [CircleUser, 'Mi espacio']].map(([Icon, label], i) => {
          const Glyph = Icon as typeof Compass;
          return <span key={label as string} className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1 text-[9px] ${i ? APP.muted : 'bg-[#EAF3FF] font-semibold text-[#0153A8]'}`}><Glyph className="size-3.5" />{label as string}</span>;
        })}
      </div>
    </div>
  );
}

function PhoneShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [22, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  return (
    <div ref={ref} className="relative mx-auto w-full max-w-[420px] pb-6 [perspective:1400px]">
      <m.div style={{ rotateX, scale }} className="tilt mx-auto aspect-[9/19] w-[min(290px,78vw)] origin-bottom overflow-hidden rounded-[44px] border-[9px] border-[#14202c] shadow-[0_50px_90px_-40px_rgba(14,34,54,.6)]"
        role="img" aria-label="Pantalla Explorar de la app KarmaHouse para Android: búsqueda por barrio, municipio o calle, filtros y viviendas. Imagen y datos ilustrativos.">
        <PhoneScreen />
      </m.div>
      <Reveal className="relative z-10 -mt-32 ml-auto w-[min(260px,76vw)] sm:absolute sm:-right-6 sm:bottom-16 sm:mt-0" hidden={{ opacity: 0, x: 30 }} amount={0.8} delay={0.2}>
      <div className="rounded-[22px] border border-line bg-paper p-3.5 shadow-2xl"
        role="img" aria-label="Ejemplo ilustrativo de una conversación: consulta de disponibilidad y propuesta de visita pendiente de respuesta.">
        <div className="flex items-center gap-2.5" aria-hidden="true">
          <span className="grid size-8 place-items-center rounded-full bg-soft-blue text-blue"><House className="size-4" /></span>
          <span className="flex-1 text-xs leading-tight"><strong className="block">Tu próxima vivienda</strong><span className="text-[11px] text-body">Conversación privada</span></span>
          <span className="size-2 rounded-full bg-persiana" />
        </div>
        <div className="mt-3 grid gap-1.5 text-[11.5px]" aria-hidden="true">
          <p className="w-fit max-w-[92%] rounded-2xl rounded-tl-sm bg-arena px-3 py-2">Hola, ¿podemos coordinar una visita?</p>
          <p className="w-fit max-w-[92%] justify-self-end rounded-2xl rounded-tr-sm bg-blue px-3 py-2 text-on-blue">Claro. ¿Te viene bien el sábado?</p>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-line p-2">
            <CalendarDays className="size-4 text-blue" /><span className="flex-1 leading-tight"><strong className="block">Propuesta de visita</strong><span className="text-body">Sábado · 10:30 a. m.</span></span>
            <span className="rounded-full bg-sol/25 px-2 py-0.5 text-[10px] font-semibold text-ocre">Pendiente</span>
          </div>
        </div>
        <p className="mt-2.5 text-center text-[10px] text-body" aria-hidden="true">Ejemplo de uso · No es una conversación real</p>
      </div>
      </Reveal>
      <p className="mt-6 text-center text-xs text-body">Interfaz de KarmaHouse para Android. Imagen y datos ilustrativos.</p>
    </div>
  );
}

function Experience() {
  return (
    <section className="relative overflow-clip bg-arena py-20 lg:py-28" id="app" aria-labelledby="experience-title">
      <div className="losa absolute inset-0 text-ocre opacity-[.06]" aria-hidden="true" />
      <div className={`${WRAP} relative grid items-center gap-16 lg:grid-cols-2`}>
        <PhoneShowcase />
        <div>
          <Reveal>
            <Eyebrow>La experiencia KarmaHouse</Eyebrow>
            <h2 id="experience-title" className="mt-5 text-[clamp(2.1rem,4vw,3.4rem)]">Del mapa a la conversación. <span className="text-blue">Todo más cerca.</span></h2>
            <p className="mt-6 max-w-[28rem] leading-relaxed text-body">Una vivienda es mucho más que una foto. Conoce la zona, revisa sus detalles y conversa antes de dar el siguiente paso.</p>
          </Reveal>
          <Stagger as="ul" className="mt-10 grid gap-3">
            {[
              [MapPin, 'Busca con contexto', 'Filtra por precio, habitaciones y estado. Ubica las viviendas en el mapa.'],
              [MessageCircle, 'Habla directamente', 'Cada anuncio tiene su conversación. Tu teléfono y tu correo no se muestran a otros usuarios.'],
              [CalendarDays, 'Organiza visitas y ofertas', 'Envía propuestas y consulta sus respuestas dentro del chat, sin perder el hilo.'],
            ].map(([Icon, title, text]) => {
              const Glyph = Icon as typeof MapPin;
              return (
                <StaggerItem key={title as string} as="li" className="flex gap-4 rounded-3xl border border-line bg-paper/80 p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-soft-blue text-blue"><Glyph className="size-5" aria-hidden="true" /></span>
                  <div><h3 className="font-sans text-base font-semibold tracking-normal">{title as string}</h3><p className="mt-1 text-sm leading-relaxed text-body">{text as string}</p></div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="py-20 lg:py-28" id="como-funciona" aria-labelledby="steps-title">
      <div className={WRAP}>
        <SectionHeading eyebrow="Así funciona" id="steps-title" title="De una idea a tu próxima visita."
          aside={<>Busca una vivienda o publica la tuya.<br />El siguiente paso empieza con una conversación.</>} />
        <div className="relative mt-14">
          <Reveal className="absolute inset-x-[8%] top-[1.9rem] hidden h-px origin-left bg-gradient-to-r from-sol via-terracota to-blue md:block" hidden={{ scaleX: 0 }} amount={0.8} />
          <Stagger as="ol" className="relative grid gap-10 md:grid-cols-3 md:gap-8">
            {[
              ['Explora o publica', 'Encuentra lo que buscas o presenta tu vivienda con fotos, ubicación y detalles.'],
              ['Conoce y compara', 'Consulta las características, guarda tus favoritos y pregunta lo que necesites.'],
              ['Acuerda el siguiente paso', 'Propón una visita o una oferta. La negociación y el cierre se realizan entre las partes.'],
            ].map(([title, text], i) => (
              <StaggerItem key={title} as="li" className="md:text-center">
                <span className="grid size-[3.8rem] place-items-center rounded-full border border-line bg-cal font-display text-2xl text-ocre md:mx-auto">0{i + 1}</span>
                <h3 className="mt-6 text-2xl">{title}</h3>
                <p className="mt-3 max-w-[22rem] text-[15px] leading-relaxed text-body md:mx-auto">{text}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
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
          <Mediopunto animated={false} className="pointer-events-none absolute -bottom-[26rem] left-1/2 w-[64rem] max-w-none -translate-x-1/2 opacity-[.14]" />
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

function Publication() {
  return (
    <section className="py-20 lg:py-28" id="publicar" aria-labelledby="publication-title">
      <div className={WRAP}>
        <SectionHeading eyebrow="Dale un lugar a tu vivienda" title="Publica a tu manera." id="publication-title" aside={<>Prepara tu anuncio en la app<br />o pide ayuda para dar el primer paso.</>} />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <article className="min-w-0 rounded-3xl border border-line bg-paper p-6 sm:p-8">
            <h3 className="text-2xl">Publicar por mi cuenta</h3>
            <p className="mt-5 text-[15px] leading-relaxed text-body">Entra en «Publicar» desde la app. Completa los datos y añade tus fotos; si ya tienes el texto, usa «Pegar anuncio» y revisa el resultado antes de enviarlo.</p>
            <a className={`${BUTTON} group mt-6 max-w-full`} href="#descargar">Empezar en la app <ArrowRight className={ARROW} aria-hidden="true" /></a>
          </article>
          <article className="min-w-0 rounded-3xl border border-line bg-paper p-6 sm:p-8">
            <h3 className="text-2xl">Publicar con ayuda de KarmaHouse</h3>
            <p className="mt-5 text-[15px] leading-relaxed text-body">Escríbenos con la operación, provincia, zona aproximada, características, precio y moneda o condiciones. Adjunta fotos propias y nítidas si ofreces una vivienda.</p>
            <p className="mt-5 text-[15px] leading-relaxed text-body">Revisamos el anuncio contigo. La cuenta oficial necesita tu autorización expresa antes de publicarlo. Si después solicitas gestionarlo, podrás aceptar o rechazar una invitación de traspaso que conserva el enlace, las fotos y los favoritos.</p>
            <a className={`${BUTTON} group mt-6 max-w-full`} href={ASSISTED_CONTACT}>Escribir para pedir ayuda <MessageCircle className="size-4 shrink-0" aria-hidden="true" /></a>
            <p className="mt-5 break-words text-sm leading-relaxed text-body">Se abrirá tu aplicación de correo. Revisa y envía el mensaje desde allí. También puedes escribir directamente a <a className="text-blue underline underline-offset-4" href={`mailto:${ASSISTED_EMAIL}`}>{ASSISTED_EMAIL}</a>.</p>
          </article>
        </div>
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
          <Hero />
          <ProvinceMarquee />
          <Possibilities />
          <Experience />
          <Publication />
          <HowItWorks />
          <Trust />
          <Download />
          <Questions />
        </main>
        <Footer />
      </MotionConfig>
    </LazyMotion>
  );
}
