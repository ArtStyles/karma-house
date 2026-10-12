import type { CSSProperties, ReactNode } from 'react';
import { Bell, CalendarDays, Check, ChevronLeft, CirclePlus, CircleUser, ClipboardPaste, Compass, Heart, House, MapPin, MessageCircle, Search, SlidersHorizontal } from 'lucide-react';
import { Barrio, HOUSE_PIN, PINS, PinIcon } from './Barrio';

// The phone mirrors the Android app: same labels, colours and layout as its Explorar, chat and Publicar screens.
// Photos, chats and form values are illustrative. Animated scenes pass `part`, a prefix for the data-part names
// their scroll frames look up; static copies omit it.
const dp = (part: string | undefined, name: string) => (part === undefined ? undefined : `${part}${name}`);

export function PhoneFrame({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <div className={`phone-frame ${className}`} role="img" aria-label={label}>
      <div className="phone-screen" aria-hidden="true">{children}</div>
    </div>
  );
}

export function ExploreBar({ part }: { part?: string }) {
  return (
    <div className="relative z-10 bg-[#F5F5F7] px-3 pb-2.5 pt-3.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[13px] tracking-[-.03em] text-[#0153A8]"><img src="/karmahouse-mark.png" alt="" width="20" height="16" className="h-4 w-5 object-contain" /><span><b className="font-extrabold">Karma</b>House</span></span>
        <span className="flex gap-1.5">{[Bell, MessageCircle].map((Icon, i) => <span key={i} className="grid size-7 place-items-center rounded-full bg-white"><Icon className="size-3.5" /></span>)}</span>
      </div>
      <p className="mt-2.5 text-[15px] font-bold tracking-[-.02em]">Encuentra tu casa en Cuba</p>
      <div className="mt-2 flex items-center gap-2 rounded-full border border-[#E5E5EA] bg-white py-1 pl-3 pr-1">
        <Search className="size-3.5" /><span className="flex-1 text-[#68686D]">Barrio, municipio o calle</span>
        <span className="grid size-6 place-items-center rounded-full bg-[#EAF3FF] text-[#0153A8]"><SlidersHorizontal className="size-3" /></span>
      </div>
      <div className="mt-2 flex gap-1.5 overflow-hidden whitespace-nowrap">
        <span className="phone-chip on"><MapPin className="size-3" />Toda Cuba</span>
        <span className="phone-chip" data-part={dp(part, 'chip')}>Casas</span>
        <span className="phone-chip">Apartamentos</span>
        <span className="phone-chip">Permutas</span>
      </div>
    </div>
  );
}

const TABS = [[Compass, 'Explorar'], [Heart, 'Favoritos'], [CirclePlus, 'Publicar'], [CircleUser, 'Mi espacio']] as const;

export function BottomNav() {
  return (
    <div className="absolute inset-x-2.5 bottom-2.5 z-10 flex rounded-full bg-white p-1 text-[9px] shadow-[0_6px_20px_rgba(0,0,0,.12)]">
      {TABS.map(([Icon, label], i) => (
        <span key={label} className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1 ${i ? 'text-[#68686D]' : 'bg-[#EAF3FF] font-semibold text-[#0153A8]'}`}><Icon className="size-3.5" />{label}</span>
      ))}
    </div>
  );
}

export function BarrioMap({ part }: { part?: string }) {
  return (
    <>
      <Barrio />
      {PINS.map(([x, y], i) => (
        <span key={i} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
          <span className="phone-pin" data-part={dp(part, `pin${i}`)}><PinIcon house={i === HOUSE_PIN} /></span>
        </span>
      ))}
    </>
  );
}

export function ListingSheet({ part }: { part?: string }) {
  return (
    <div className="phone-sheet">
      <span className="mx-auto mb-2 block h-1 w-9 rounded-full bg-[#E5E5EA]" />
      <div className="relative h-[118px] overflow-hidden rounded-2xl">
        <picture><source type="image/avif" srcSet="/vedado-640.avif" /><img src="/vedado.jpg" alt="" loading="lazy" className="size-full object-cover object-[58%_center]" /></picture>
        <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold">Imagen ilustrativa</span>
        <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-white">
          <Heart className="col-start-1 row-start-1 size-3.5" />
          <Heart className="col-start-1 row-start-1 size-3.5 fill-[#A84C33] text-[#A84C33] opacity-0" data-part={dp(part, 'heart')} />
        </span>
      </div>
      <div className="mt-2.5 grid gap-1.5"><span className="block h-2.5 w-1/2 rounded-full bg-[#DCDCE0]" /><span className="block h-2 w-4/5 rounded-full bg-[#E5E5EA]" /><span className="block h-2 w-3/5 rounded-full bg-[#E5E5EA]" /></div>
      <span className="phone-toast" data-part={dp(part, 'saved')}>Guardada en Favoritos</span>
    </div>
  );
}

export function ChatScreen({ part }: { part?: string }) {
  const bubble = (name: string, text: string, me: boolean) => <p className={`phone-bubble${me ? ' me' : ''}`} data-part={dp(part, name)}>{text}</p>;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-[#E5E5EA] bg-white px-2.5 pb-2.5 pt-4">
        <ChevronLeft className="size-4 text-[#0153A8]" />
        <span className="grid size-8 place-items-center rounded-full bg-[#EAF3FF] text-[#0153A8]"><House className="size-4" /></span>
        <span className="leading-tight"><strong className="block">Tu próxima vivienda</strong><span className="text-[10px] text-[#68686D]">Conversación privada</span></span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-1.5 p-2.5">
        {bubble('b1', 'Hola, ¿sigue disponible?', true)}
        {bubble('b2', 'Sí. ¿Quieres verla esta semana?', false)}
        {bubble('b3', '¿Podemos coordinar una visita?', true)}
        <div className="phone-visit" data-part={dp(part, 'visit')}>
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#EAF3FF] text-[#0153A8]"><CalendarDays className="size-3.5" /></span>
          <span className="min-w-0 flex-1 leading-tight"><strong className="block">Propuesta de visita</strong><span className="text-[10px] text-[#68686D]">Sábado · 10:30 a. m.</span></span>
          <span className="grid text-[10px] font-bold">
            <span className="col-start-1 row-start-1 rounded-full bg-[#F7EAD0] px-2 py-0.5 text-[#7A5212]" data-part={dp(part, 'wait')}>Pendiente</span>
            <span className="col-start-1 row-start-1 inline-flex items-center gap-0.5 rounded-full bg-[#E1EEE4] px-2 py-0.5 text-[#2C5638] opacity-0" data-part={dp(part, 'ok')}>
              <Check className="phone-tick size-2.5" strokeWidth={3.4} data-part={dp(part, 'tick')} />Aceptada
            </span>
          </span>
        </div>
        {bubble('b4', 'Perfecto, te espero el sábado.', false)}
      </div>
      <div className="mx-2.5 rounded-full border border-[#E5E5EA] bg-white px-3 py-1.5 text-[#68686D]">Escribe un mensaje</div>
      <p className="py-2 text-center text-[10px] text-[#68686D]">Ejemplo de uso · No es una conversación real</p>
    </div>
  );
}

// Publish pages: larger app screens (13 px text) so they read at a glance. Illustrative example data.
const AD = 'Vendo casa con portal y patio en La Habana. 3 habitaciones, 2 baños, cocina y sala comedor.';
const FIELDS = [['Operación', 'Venta'], ['Tipo', 'Casa'], ['Provincia', 'La Habana'], ['Habitaciones', '3'], ['Baños', '2']] as const;
const TIMELINE = ['Enviado', 'En revisión', 'Publicado'];

function AppTop({ title }: { title: string }) {
  return <div className="flex items-center gap-2 border-b border-[#E5E5EA] bg-white px-4 py-3 font-semibold"><ChevronLeft className="size-4 text-[#0153A8]" />{title}</div>;
}

export function PasteScreen() {
  return (
    <div className="app-screen">
      <AppTop title="Nuevo anuncio" />
      <div className="grid gap-2.5 p-4">
        <span className="phone-paste"><ClipboardPaste className="size-4" />Pegar anuncio</span>
        <p className="app-note"><span className="mb-1 block text-[11px] font-semibold text-[#68686D]">Texto pegado</span>{AD}</p>
        <div className="grid gap-1.5">
          {FIELDS.map(([label, value], i) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-[#E5E5EA] bg-white px-3 py-2" style={{ '--i': i } as CSSProperties}>
              <span className="text-[#68686D]">{label}</span><b className="app-fill">{value}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReviewScreen() {
  return (
    <div className="app-screen">
      <AppTop title="Mis anuncios" />
      <div className="grid gap-4 p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-[#E5E5EA] bg-white p-2.5">
          <picture><source type="image/avif" srcSet="/vedado-640.avif" /><img src="/vedado.jpg" alt="" loading="lazy" className="size-16 rounded-xl object-cover" /></picture>
          <span className="min-w-0 flex-1 leading-snug">
            <strong className="block">Casa con portal</strong>
            <span className="block text-[#68686D]">Venta · La Habana</span>
            <span className="text-[11px] text-[#68686D]">Imagen ilustrativa</span>
          </span>
          <span className="grid text-[11px] font-bold">
            <span className="app-review col-start-1 row-start-1 rounded-full bg-[#F7EAD0] px-2.5 py-1 text-[#7A5212]">En revisión</span>
            <span className="app-live col-start-1 row-start-1 rounded-full bg-[#E1EEE4] px-2.5 py-1 text-[#2C5638]">Publicado</span>
          </span>
        </div>
        <ol className="app-timeline">
          {TIMELINE.map((label, i) => (
            <li key={label} style={{ '--i': i } as CSSProperties}><span className="app-tick"><Check className="size-3.5" strokeWidth={3} /></span>{label}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function MapScreen() {
  return (
    <div className="app-screen">
      <Barrio />
      <span className="absolute left-4 top-4 z-10 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold shadow-sm"><MapPin className="mr-1 inline size-3.5 text-[#A84C33]" />Ubicación aproximada</span>
      <span className="absolute left-[58%] top-[54%]"><span className="phone-pin app-pin"><PinIcon house /></span></span>
      <span className="app-toast">Tu vivienda ya está en el mapa</span>
    </div>
  );
}
