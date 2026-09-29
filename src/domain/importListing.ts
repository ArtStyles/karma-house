import { normalizeSearch, type ListingDraft, type ListingType } from './listings.ts';
import { AMENITIES, type ListingCondition, type ListingOperation, type RentPeriod } from './listingOptions.ts';
import { parseDecimal } from './numericInput.ts';
import { findPlace } from './places.ts';

/**
 * Reads an ad written for Revolico or WhatsApp into a publish draft. Pure and conservative: a field
 * without evidence in the text stays empty. Every `detect*` function folds its input (no accents,
 * lower case), so it can be called on raw text.
 */

export type ImportField = 'operation' | 'title' | 'type' | 'location' | 'province' | 'price' | 'bedrooms' | 'bathrooms' | 'area'
  | 'floor' | 'condition' | 'priceNegotiable' | 'amenities' | 'description' | 'rentPeriod' | 'swapWants';
export interface ImportResult { draft: Partial<ListingDraft>; detected: ImportField[]; missing: ImportField[]; notes: string[] }

const FIELDS: readonly ImportField[] = ['operation', 'title', 'type', 'location', 'province', 'price', 'bedrooms', 'bathrooms', 'area',
  'floor', 'condition', 'priceNegotiable', 'amenities', 'description', 'rentPeriod', 'swapWants'];
const OTHER_CURRENCY_NOTE = 'El precio está en otra moneda; indícalo en USD.';

// ---- 1. Normalize ----

const DECORATION = /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\uFE0E\uFE0F\u200D\u20E3\u2022\u2190-\u21FF\u2500-\u27BF\u2B00-\u2BFF\u{E0020}-\u{E007F}]/gu;
const hasContent = (line: string) => /[\p{L}\p{N}]/u.test(line);

/** Trimmed lines, lines without letters or digits emptied, at most one blank line in a row. */
function tidy(text: string): string {
  return text.split('\n').map((line) => line.trim()).map((line) => (hasContent(line) ? line : ''))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Keycap emoji become digits; other emoji and decorative symbols go; spaces unify; line breaks stay. */
export function normalizeText(text: string): string {
  return tidy(text.normalize('NFC')
    .replace(/([0-9])\uFE0F?\u20E3/g, '$1').replace(/\u{1F51F}/gu, '10')
    .replace(DECORATION, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' '));
}

// ---- 2. Contact ----

const MARK = '\u0000';
const CONTACTS: RegExp[] = [
  /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|t\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/\S*/gi,
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\+\s*1[\s.-]*\(?\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4}(?!\d)/g,
  /\+\s*53[\s.-]*\d(?:[\s.-]?\d){6,7}(?!\d)/g,
  /(?<![\d.,])(?:53[\s-]?)?5\d{3}[\s-]?\d{4}(?!\d)/g,
];
/** A landline only counts after a word that announces it; the word stays when it is a feature («teléfono fijo»). */
const LANDLINE = /(\b(?:llamar(?:[ \t]+al)?|ll[aá]mame|tel[eé]fonos?(?:[ \t]+fijo)?|telf?|tlf|whatsapp|wsp|m[oó]vil|cel(?:ular)?)\.?[ \t]*:?[ \t]*(?:al[ \t]+)?)(\d(?:[ -]?\d){6,7})(?!\d)/gi;
const INTRO_WORD = String.raw`(?:para[ \t]+m[aá]s[ \t]+info(?:rmaci[oó]n)?|m[aá]s[ \t]+info(?:rmaci[oó]n)?|interesad[oa]s|llamar|ll[aá]mame|ll[aá]menme|llamen|llame|escribir|escr[ií]beme|escr[ií]banme|escriban|contactar|contactos?|tel[eé]fonos?|telf?|tlf|whatsapp|wsp|cel(?:ular)?|m[oó]vil|correo|e-?mail|info(?:rmaci[oó]n)?|v[ií]a)`;
const INTRO_LINK = String.raw`(?:al|a|o|y|el|mi|por|n[uú]mero|mediante)`;
const INTRO = String.raw`(?:\b${INTRO_WORD}(?:[ \t.:,/-]*(?:${INTRO_WORD}|${INTRO_LINK})\b)*[ \t.:,/-]*)`;
/** Removed contacts plus the phrase before each and the «o» / «y» / «,» that join several of them. */
const CONTACT_RUN = new RegExp(`${INTRO}?${MARK}(?:[ \\t,/-]*(?:(?:o|y|u)\\b[ \\t,/-]*)?${INTRO}?${MARK})*`, 'giu');

/** Removes Cuban and US phones, WhatsApp and Telegram links, emails and the phrases that introduce them. */
export function stripContacts(text: string): { text: string; count: number } {
  let count = 0;
  let marked = text;
  for (const pattern of CONTACTS) marked = marked.replace(pattern, () => { count += 1; return MARK; });
  marked = marked.replace(LANDLINE, (_match, intro: string) => { count += 1; return intro + MARK; });
  const lines = marked.split('\n').flatMap((line) => {
    if (!line.includes(MARK)) return [line];
    const rest = line.replace(CONTACT_RUN, ' ').replace(/[ \t]+([.,;:!?])/g, '$1').replace(/([.,;:!?])[.,;:]+/g, '$1')
      .replace(/[\s,;]+$/, '');
    return hasContent(rest) ? [rest] : [];
  });
  return { text: tidy(lines.join('\n')), count };
}

// ---- 3. Operation ----

const OPERATIONS: [ListingOperation, RegExp][] = [
  ['wanted', /\b(?:busco|necesito|compro)\b(?!\s+(?:vender|alquilar|rentar|permutar|comprador|inquilino))/],
  ['swap', /\b(?:permuto|permuta|permutar)\b|\bcambio\b[^.\n]{0,60}\bpor\b/],
  ['rent', /\b(?:alquilo|rento|arriendo|alquila|renta|alquiler)\b/],
  ['sale', /\b(?:vendo|vende|venta|vender)\b/],
];

/** The earliest operation word: swap ads say «busco» for what they want back, sale ads «busco comprador». */
export function detectOperation(text: string): ListingOperation | undefined {
  const folded = normalizeSearch(text);
  let best: { operation: ListingOperation; index: number } | undefined;
  for (const [operation, pattern] of OPERATIONS) {
    const index = folded.search(pattern);
    if (index >= 0 && (!best || index < best.index)) best = { operation, index };
  }
  return best?.operation;
}

// ---- 4. Price ----

const NUMBER = /(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)(?!\d)/g;

/** A USD price, or none. `otherCurrency` says a number was written in CUP, MLC, euros or pesos. */
export function detectPrice(text: string): { price: number | undefined; otherCurrency: boolean } {
  const folded = normalizeSearch(text);
  let otherCurrency = false;
  const candidates: { value: number; strong: boolean }[] = [];
  for (const match of folded.matchAll(NUMBER)) {
    const raw = match[1];
    const end = match.index + raw.length;
    const before = folded.slice(Math.max(0, match.index - 25), match.index);
    const thousands = /^\s*(?:mil|k)\b/.exec(folded.slice(end));
    const after = folded.slice(end + (thousands?.[0].length ?? 0), end + 40);
    if (/^\s*(?:cup|cuc|mn|m\.n|mlc|eur|euros?|pesos)\b/.test(after)) { otherCurrency = true; continue; }
    if (/^\s*(?:m2|m²|mt2|mts|metros|v\b|w\b|kw|km|%|x\s*\d)/.test(after)) continue;
    const digits = raw.replace(/\D/g, '');
    if (/^5\d{7}$/.test(digits)) continue;
    const currency = /^\s*(?:usd|us\$|\$|dolares|dls)/.test(after) || /\$\s*$/.test(before);
    const priceWord = /precio[^\d]{0,20}$/.test(before);
    let value: number;
    if (thousands) value = Math.round(Number(raw.replace(',', '.')) * 1000);
    else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) value = Number(digits);
    else if (/^\d+$/.test(raw) && (currency ? raw.length >= 2 : priceWord && raw.length >= 3) && raw.length <= 8) value = Number(raw);
    else continue;
    if (value > 0 && value <= 100_000_000) candidates.push({ value, strong: currency || priceWord });
  }
  const price = candidates.find((candidate) => candidate.strong)?.value
    ?? (candidates.length ? Math.max(...candidates.map((candidate) => candidate.value)) : undefined);
  return { price, otherCurrency };
}

// ---- 5. Rooms, bathrooms, area ----

const WORD_NUMBERS: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
const COUNT = String.raw`(\d{1,2}|un|uno|una|dos|tres|cuatro|cinco|seis)`;
const count = (value: string) => WORD_NUMBERS[value] ?? Number(value);
const inRange = (value: number, max = 20) => (Number.isInteger(value) && value >= 1 && value <= max ? value : undefined);

const BEDROOMS = new RegExp(String.raw`(?<![a-z\d/])${COUNT}\s*(?:cuartos?|habitacion(?:es)?|dormitorios?|recamaras?)\b(?!\s+de\s+(?:bano|desahogo|servicio|pilas|lavado|criad))|(?<![\d/])(\d)\s*\/\s*4\b`);
const BATHROOMS = new RegExp(String.raw`(?<![a-z\d/])${COUNT}(?:\s+(?:y\s+)?(?:1\/2|medio))?\s*banos?\b`);
/** «Baño» as a line or a list item, not «con baño» (an en-suite says nothing about the total). */
const ONE_BATHROOM = /(?:^|[,;]|\by\b)[ \t]*(?:un[ \t]+)?(?:(?:sala|cuarto)[ \t]+de[ \t]+)?bano\b/m;
const AREA = /(?<!x\s*)(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(?:m2|m²|mt2|mts2?|metros(?:\s+cuadrados)?)(?![a-z\d])(?!\s+(?:de\s+)?(?:frente|fondo|largo|ancho|lineales))/;

/** «3 cuartos», «1cuarto», «dos habitaciones», Cuban «3/4». Never «2 plantas» or «cuarto de desahogo». */
export function detectBedrooms(text: string): number | undefined {
  const match = BEDROOMS.exec(normalizeSearch(text));
  return match ? inRange(count(match[1] ?? match[2])) : undefined;
}

/** «2 baños», «1 1/2 baños» (the half is not counted), or 1 for a single «Baño» line or list item. */
export function detectBathrooms(text: string): number | undefined {
  const folded = normalizeSearch(text);
  const match = BATHROOMS.exec(folded);
  if (match) return inRange(count(match[1]));
  return ONE_BATHROOM.test(folded) ? 1 : undefined;
}

/** Square metres; a frontage («10 mts de frente») or a side of «10x20» is not an area. */
export function detectArea(text: string): number | undefined {
  const match = AREA.exec(normalizeSearch(text));
  if (!match) return undefined;
  const area = parseDecimal(match[1].replace(',', '.'));
  return area > 0 && area <= 10_000 ? area : undefined;
}

// ---- 6. Type and floor ----

export function detectType(text: string): ListingType | undefined {
  const match = /\b(?:(apartamentos?|apartamentico|aptos?|penthouse)|casas?|casita|biplanta|chalet)\b/.exec(normalizeSearch(text));
  return match ? (match[1] ? 'Apartamento' : 'Casa') : undefined;
}

const ORDINALS: Record<string, number> = { primer: 1, primero: 1, segundo: 2, tercer: 3, tercero: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10 };
const FLOOR = /(?<![\d/])(\d{1,2})\s*(?:er|ero|ro|do|to|no|mo|vo|o|º|°)?\s*piso\b|\b(primer|primero|segundo|tercer|tercero|cuarto|quinto|sexto|septimo|octavo|noveno|decimo)\s+piso\b|(\bplanta\s+baja\b|\b(?:en|unos|los|son|un)\s+bajos\b)/;

/** «3er piso», «segundo piso», «planta baja» → 0. «5 pisos» (storeys) and «2 plantas» are not a floor. */
export function detectFloor(text: string): number | undefined {
  const match = FLOOR.exec(normalizeSearch(text));
  if (!match) return undefined;
  if (match[3]) return 0;
  const floor = match[1] ? Number(match[1]) : ORDINALS[match[2]];
  return floor <= 99 ? floor : undefined;
}

// ---- 7. Negotiable and condition ----

export function detectNegotiable(text: string): boolean {
  return /\bnegociable\b|se escuchan ofertas|escucho ofertas|me ajusto|precio a conversar|conversable/.test(normalizeSearch(text));
}

const CONDITIONS: [ListingCondition, RegExp][] = [
  ['good', /\b(?:buen estado|buenas condiciones|excelente estado|excelentes condiciones)/],
  ['needs-renovation', /\b(?:a reparar|para reparar|necesita reparaci|a remodelar|para remodelar)/],
  ['new', /\b(?:recien construid|a estrenar|nueva construccion)/],
];

export function detectCondition(text: string): ListingCondition | undefined {
  const folded = normalizeSearch(text);
  let best: { condition: ListingCondition; index: number } | undefined;
  for (const [condition, pattern] of CONDITIONS) {
    const index = folded.search(pattern);
    if (index >= 0 && (!best || index < best.index)) best = { condition, index };
  }
  return best?.condition;
}

// ---- 8. Amenities ----

const AMENITY_PATTERNS: Record<string, RegExp> = {
  'Balcón': /\bbalcon(?:es)?\b/,
  'Patio': /\bpatios?\b/,
  'Garaje': /\bgara[jg]es?\b/,
  // «Se deja:» heads a furniture list; «se deja vacía» is the opposite.
  'Amueblado': /\bamueblad|con todo adentro|se deja todo|juego de sala|\bse dejan?[ \t]*(?::|\n)/,
  'Aire acondicionado': /aire acondicionado|\bsplits?\b/,
  'Ascensor': /\b(?:ascensor|elevador)(?:es)?\b/,
  'Terraza': /\bterrazas?\b/,
  'Piscina': /\bpiscinas?\b/,
  'Cisterna': /\bcisternas?\b/,
  'Tanque de agua': /\btanques?\b/,
  'Entrada independiente': /puerta calle|entrada independiente/,
};

/** Only catalogue values, in catalogue order, once each. */
export function detectAmenities(text: string): string[] {
  const folded = normalizeSearch(text);
  return AMENITIES.filter((amenity) => AMENITY_PATTERNS[amenity]?.test(folded));
}

// ---- 10. Rent and swap ----

/** The period an ad states; the caller falls back to a month. */
export function detectRentPeriod(text: string): RentPeriod | undefined {
  const folded = normalizeSearch(text);
  if (/\bpor noche\b|\bla noche\b|\bx noche\b|\/\s*noche\b|\bdiario\b|\bpor dia\b/.test(folded)) return 'day';
  if (/\bal mes\b|\bpor mes\b|\bx mes\b|\/\s*mes\b|\bmensual(?:es)?\b/.test(folded)) return 'month';
  return undefined;
}

/** What follows «por», «busco» or «necesito» after the swap word, to the end of the sentence, if it says enough. */
export function detectSwapWants(text: string): string | undefined {
  // `normalizeSearch` keeps one character per character of NFC text, so indexes match `text`.
  const folded = normalizeSearch(text);
  const start = folded.search(OPERATIONS[1][1]);
  if (start < 0) return undefined;
  const lead = /\b(?:por|busco|necesito)\b\s*/g;
  lead.lastIndex = start;
  const match = lead.exec(folded);
  if (!match) return undefined;
  const from = match.index + match[0].length;
  const wants = text.trim().slice(from).split(/[.!?;\n]/)[0].replace(/[\s,:-]+$/, '').trim();
  return wants.length >= 20 ? wants.slice(0, 500) : undefined;
}

// ---- 11. Title ----

const TITLE_OPERATION = /\b(?:vendo|vende|venta|vender|alquilo|alquila|alquiler|rento|renta|arriendo|permuto|permuta|busco|necesito|compro)\b/;
const GENERIC_WORDS = new Set(['se', 'vende', 'vendo', 'venta', 'en', 'de', 'la', 'el', 'una', 'un', 'casa', 'apartamento', 'apto', 'vivienda', 'alquila', 'alquilo', 'alquiler', 'renta', 'rento']);

/**
 * The first line that names an operation (a decorated first line is usually the seller's nickname),
 * else one that names a house or apartment, else the first with three letters; never a «Precio…»
 * line. Its first sentence, at most 100 characters. «Venta de casa
 * en Playa» says nothing a type and a place would not, so it becomes «Casa en Playa».
 */
export function buildTitle(text: string, type: ListingType | undefined, place: { location: string; province: string } | null): string {
  const lines = text.split('\n').filter((line) => (line.match(/\p{L}/gu) ?? []).length >= 3 && !/^\s*precio\b/i.test(line));
  const line = lines.find((item) => TITLE_OPERATION.test(normalizeSearch(item)))
    ?? lines.find((item) => detectType(item)) ?? lines[0];
  if (!line) return '';
  let title = (/^.*?[.!?](?=\s|$)/.exec(line)?.[0] ?? line)
    .replace(/^[^\p{L}\p{N}¿¡(]+/u, '').replace(/[^\p{L}\p{N})]+$/u, '');
  if (title.length > 100) {
    title = title.slice(0, 100);
    const space = title.lastIndexOf(' ');
    if (space > 60) title = title.slice(0, space);
    title = title.replace(/[^\p{L}\p{N})]+$/u, '');
  }
  const where = place?.location || place?.province;
  if (!where) return title;
  let rest = normalizeSearch(title);
  for (const name of [place?.location, place?.province]) if (name) rest = rest.replace(normalizeSearch(name), ' ');
  const generic = rest.split(/[^a-z0-9]+/).filter(Boolean).every((word) => GENERIC_WORDS.has(word));
  return generic ? `${type ?? 'Vivienda'} en ${where}` : title;
}

// ---- Everything together ----

function requiredFields(operation: ListingOperation): ImportField[] {
  const wanted = operation === 'wanted';
  return FIELDS.filter((field) => ['title', 'location', 'province', 'price', 'bedrooms', 'description'].includes(field)
    || (!wanted && ['type', 'bathrooms', 'area'].includes(field))
    || (operation === 'swap' && field === 'swapWants'));
}

const contactNote = (removed: number) =>
  `Quitamos ${removed} ${removed === 1 ? 'dato' : 'datos'} de contacto: en KarmaHouse se habla por el chat.`;

export function parseListingText(text: string): ImportResult {
  const { text: clean, count: contacts } = stripContacts(normalizeText(text));
  const notes = contacts ? [contactNote(contacts)] : [];
  if (!clean) return { draft: {}, detected: [], missing: requiredFields('sale'), notes };

  const found = detectOperation(clean);
  const operation = found ?? 'sale';
  const wanted = operation === 'wanted';
  const draft: Partial<ListingDraft> = { operation };
  const detected = new Set<ImportField>(found ? ['operation'] : []);
  const fill = <Field extends ImportField>(field: Field, value: ListingDraft[Field] | undefined) => {
    if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) return;
    draft[field] = value;
    detected.add(field);
  };
  const asText = (value: number | undefined) => (value === undefined ? undefined : String(value));

  const place = findPlace(clean);
  const type = detectType(clean);
  const { price, otherCurrency } = detectPrice(clean);
  if (price === undefined && otherCurrency) notes.push(OTHER_CURRENCY_NOTE);

  fill('title', buildTitle(clean, type, place));
  fill('type', type);
  fill('location', place?.location);
  fill('province', place?.province);
  fill('price', asText(price));
  fill('bedrooms', asText(detectBedrooms(clean)));
  if (!wanted) {
    fill('bathrooms', asText(detectBathrooms(clean)));
    fill('area', asText(detectArea(clean)));
    fill('floor', asText(detectFloor(clean)));
    fill('condition', detectCondition(clean));
    fill('priceNegotiable', detectNegotiable(clean) || undefined);
    fill('amenities', detectAmenities(clean));
  }
  fill('description', clean.slice(0, 2000));
  if (operation === 'rent') {
    const period = detectRentPeriod(clean);
    fill('rentPeriod', period);
    draft.rentPeriod = period ?? 'month';
  }
  if (operation === 'swap') fill('swapWants', detectSwapWants(clean));

  const isEmpty = (field: ImportField) => draft[field] === undefined || draft[field] === '';
  return {
    draft,
    detected: FIELDS.filter((field) => detected.has(field)),
    missing: requiredFields(operation).filter(isEmpty),
    notes,
  };
}
