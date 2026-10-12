// Every fact and line of copy on the landing page. Only claims from BRAND.md § Facts and the live site.
export const VERSION = '0.1.20';
export const SITE = 'https://www.karmahouse.site/';
export const RELEASE = 'https://github.com/ArtStyles/karma-house/releases';
export const APK = `${RELEASE}/download/v${VERSION}/KarmaHouse.apk`;
export const SHA = `${APK}.sha256`;
export const NOTES = `${RELEASE}/tag/v${VERSION}`;
export const INSTALL = `${RELEASE}/download/v${VERSION}/INSTALACION.txt`;
export const CODE = 'https://github.com/ArtStyles/karma-house';
export const LEGAL = 'https://artstyles.github.io/karma-house';
export const CONTACT = 'mailto:hernandezfrankjames@gmail.com';
export const ASSISTED_EMAIL = 'fejames07@gmail.com';
export const ASSISTED_CONTACT = `mailto:${ASSISTED_EMAIL}?subject=Ayuda%20para%20publicar%20en%20KarmaHouse`;

/** Section ids in the main navigation, in page order. */
export const NAV: readonly (readonly [id: string, label: string])[] = [
  ['como-funciona', 'Cómo funciona'], ['cuba', 'Toda Cuba'], ['publicar', 'Publicar'], ['preguntas', 'Preguntas'],
];

export const PROOF = ['Anuncios revisados antes de publicarse', 'Chat privado', 'Toda Cuba'];

/** Same list and order as PROVINCES in src/domain/listingOptions.ts: west to east, then the special municipality. */
export const PROVINCES = ['Pinar del Río', 'Artemisa', 'La Habana', 'Mayabeque', 'Matanzas', 'Villa Clara', 'Cienfuegos', 'Sancti Spíritus',
  'Ciego de Ávila', 'Camagüey', 'Las Tunas', 'Holguín', 'Granma', 'Santiago de Cuba', 'Guantánamo', 'Isla de la Juventud'] as const;

/** A step of a pinned scene. `accent` is the headline's one blue phrase, shown after `title`. */
export type Step = { label: string; title: string; accent: string; text: string };

export const JOURNEY: Step[] = [
  { label: 'Mapa', title: 'Busca', accent: 'con contexto.', text: 'Filtra por precio, habitaciones y estado, y mira las viviendas en el mapa. Quien publica decide si la ubicación es exacta o aproximada.' },
  { label: 'Ficha', title: 'Conoce cada', accent: 'vivienda.', text: 'Revisa fotos y detalles, y guarda las que te interesen para volver a ellas.' },
  { label: 'Chat', title: 'Habla directo con', accent: 'quien publica.', text: 'Cada anuncio tiene su conversación. Otros usuarios no ven tu teléfono ni tu correo.' },
  { label: 'Visita', title: 'Visitas y ofertas,', accent: 'dentro del chat.', text: 'Propón un día y recibe la respuesta en la misma conversación. La negociación y el cierre son entre las partes.' },
];

export const PUBLISH: Step[] = [
  { label: 'Pega tu anuncio', title: 'Pega el texto y', accent: 'se rellena solo.', text: 'Si ya tienes tu anuncio escrito, usa «Pegar anuncio». Revisas el resultado y añades tus fotos antes de enviarlo.' },
  { label: 'Revisión', title: 'Se revisa antes de', accent: 'publicarse.', text: 'Los anuncios pasan por moderación antes de aparecer en el catálogo. Si hay que corregir algo, ves el motivo y lo cambias.' },
  { label: 'En el mapa', title: 'Tu vivienda,', accent: 'en el mapa.', text: 'Aparece en el catálogo y en el mapa, con la ubicación exacta o aproximada que elijas. Publicar es gratis y sin comisión.' },
];

/** The tagline, word by word; `true` marks its one blue phrase. */
export const TAGLINE: (readonly [word: string, blue: boolean])[][] = [
  [['Un', false], ['espacio', false], ['para', false]],
  [['encontrar', false], ['tu', true], ['lugar.', true]],
];

export const OPERATIONS = [
  { icon: 'house', title: 'Comprar', text: 'Busca por zona, presupuesto y características. Guarda las viviendas que te interesen.', href: '#como-funciona', cta: 'Encuentra tu lugar', tone: 'text-blue bg-blue/10' },
  { icon: 'key', title: 'Vender', text: 'Presenta tu vivienda con fotos y detalles. Recibe consultas en su propia conversación.', href: '#publicar', cta: 'Da a conocer tu vivienda', tone: 'text-terracota bg-terracota/10' },
  { icon: 'swap', title: 'Permutar', text: 'Cuenta qué ofreces y qué buscas a cambio, con o sin una diferencia de dinero.', href: '#publicar', cta: 'Explora otra posibilidad', tone: 'text-persiana bg-persiana/10' },
  { icon: 'calendar', title: 'Alquilar', text: 'Publica o busca alquileres por mes o por noche, con el precio y las condiciones a la vista.', href: '#como-funciona', cta: 'Piensa en tu próxima estancia', tone: 'text-ocre bg-ocre/10' },
] as const;

export const TRUST = [
  ['Revisión antes de publicar', 'Los anuncios pasan por moderación. Una revisión del anuncio no certifica la propiedad ni sustituye las comprobaciones antes de un acuerdo.'],
  ['Tu ubicación, a tu manera', 'Quien publica puede indicar una ubicación exacta o aproximada. Decide cuánto compartir.'],
  ['Control de tu cuenta', 'Reporta anuncios, bloquea contactos o elimina tu cuenta y tus datos desde Ajustes.'],
] as const;

export const INSTALL_STEPS = [
  ['Descarga y abre el APK.', 'Usa el botón de esta página. Si Android lo solicita, autoriza al navegador para instalar desde este origen.'],
  ['Deja que Android lo analice.', 'Mantén Play Protect activo. Si solicita un análisis, espera el resultado antes de instalar.'],
  ['Entra y empieza.', 'Inicia sesión o regístrate con tu correo y confirma el enlace que recibas. Para actualizar, instala sobre la versión anterior.'],
] as const;

/** Text with optional inline links, so the FAQ renders as HTML and also feeds structured data as plain text. */
export type Part = string | { text: string; href: string };
export const plain = (parts: Part[]) => parts.map((p) => (typeof p === 'string' ? p : p.text)).join('');

export const FAQ: { q: string; a: Part[] }[] = [
  { q: '¿Cuánto cuesta usar KarmaHouse?', a: ['Publicar, buscar y conversar es gratis. KarmaHouse no cobra comisión por las operaciones ni interviene en la negociación entre las partes.'] },
  { q: '¿Ya puedo descargar la app?', a: [`Sí. KarmaHouse ${VERSION} está disponible para Android 7 o superior. `, { text: 'Descarga el APK oficial', href: APK }, ' e instálalo siguiendo las instrucciones de esta página. Si ya tienes KarmaHouse, instala la actualización sobre la versión anterior.'] },
  { q: '¿Por qué Android puede mostrar un aviso?', a: ['El APK se instalará fuera de Google Play. Android puede pedir autorización para ese origen y Play Protect puede solicitar un análisis. Mantén Play Protect activo y espera el resultado. Si identifica el archivo como dañino, detén la instalación y contacta con nosotros.'] },
  { q: '¿Cómo compruebo que el APK es el original?', a: ['Descárgalo desde el enlace oficial de esta página y compara su hash con el ', { text: 'archivo SHA-256 de esta versión', href: SHA }, '. Las ', { text: 'notas de la entrega', href: NOTES }, ' también lo incluyen. Compararlo permite detectar cambios; no sustituye al análisis de Play Protect ni implica una aprobación de Google.'] },
  { q: '¿Quién ve mi teléfono o mi correo?', a: ['Otros usuarios no ven esos datos de tu cuenta. La conversación ocurre dentro de la app y puedes bloquear o reportar contactos.'] },
  { q: '¿Qué significa que un anuncio esté revisado?', a: ['Se modera antes de aparecer en el catálogo. Si se rechaza, quien publica puede consultar el motivo y corregirlo. La revisión no certifica la titularidad del inmueble ni garantiza una operación.'] },
  { q: '¿Puedo usarla sin Internet?', a: ['Necesitas conexión para consultar el catálogo y conversar. Los borradores de tus anuncios se guardan en el teléfono hasta que puedas publicarlos.'] },
  { q: '¿Qué ocurre con los enlaces a viviendas?', a: ['Un enlace compartido permite consultar la ficha de una vivienda publicada en el navegador. Con la app instalada, puedes abrirla en KarmaHouse para guardarla o escribir.'] },
];

/** JSON-LD for the page: the app and the FAQ, generated from the same copy the page shows. */
export function structuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'MobileApplication', name: 'KarmaHouse', operatingSystem: 'Android 7 o superior', applicationCategory: 'LifestyleApplication',
        softwareVersion: VERSION, downloadUrl: APK, url: SITE, inLanguage: 'es', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } },
      { '@type': 'FAQPage', mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plain(a) } })) },
    ],
  };
}
