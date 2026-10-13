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

export const PROOF = ['Gratis y sin comisión', 'Chat privado', 'Anuncios revisados antes de publicarse'];

/** Same list and order as PROVINCES in src/domain/listingOptions.ts: west to east, then the special municipality. */
export const PROVINCES = ['Pinar del Río', 'Artemisa', 'La Habana', 'Mayabeque', 'Matanzas', 'Villa Clara', 'Cienfuegos', 'Sancti Spíritus',
  'Ciego de Ávila', 'Camagüey', 'Las Tunas', 'Holguín', 'Granma', 'Santiago de Cuba', 'Guantánamo', 'Isla de la Juventud'] as const;

/** A pause of the house walk: the photo (web/public/casa) where the walk stops, and the text it shows there.
 *  `accent` is the headline's one coloured phrase, shown after `title`; `caption` describes the room's photo. */
export type Stop = { id: string; photo: string; caption: string; title: string; accent: string; text: string };

export const TOUR: Stop[] = [
  { id: 'inicio', photo: '000', caption: 'El portal, con la puerta abierta', title: 'Tu casa en Cuba,', accent: 'para comprar, vender, permutar o alquilar.',
    text: 'Habla directamente con quien publica. Publicar, buscar y conversar es gratis.' },
  { id: 'como-funciona', photo: '150', caption: 'La sala, a media tarde', title: 'Encuentra tu casa', accent: 'por zona, precio y estado.',
    text: 'Filtra lo que buscas y mira cada vivienda en el mapa. Quien publica decide si muestra la ubicación exacta o aproximada.' },
  { id: 'conversa', photo: '200', caption: 'El comedor, abierto al jardín', title: 'Conversa con', accent: 'quien publica.',
    text: 'Cada anuncio tiene su chat privado: otros usuarios no ven tu teléfono ni tu correo. Visitas y ofertas se proponen en la misma conversación.' },
  { id: 'cuba', photo: '240', caption: 'El patio de la fuente', title: 'Las 15 provincias', accent: 'y la Isla de la Juventud.',
    text: 'Compra, vende, permuta o alquila en cualquier lugar de Cuba, y mira las viviendas en el mapa.' },
  { id: 'publicar', photo: '290', caption: 'El estudio, junto a la ventana', title: 'Pega tu anuncio', accent: 'y se rellena solo.',
    text: 'Pegas el texto de tu anuncio y el formulario se completa. Los anuncios se revisan antes de publicarse.' },
  { id: 'android', photo: '400', caption: 'La azotea, al atardecer', title: 'Cada hogar,', accent: 'un nuevo comienzo.',
    text: `KarmaHouse ${VERSION} para Android 7 o superior. Sin comisión: la negociación y el cierre son entre las partes.` },
];

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
