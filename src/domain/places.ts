import { normalizeSearch } from './listings.ts';
import { PROVINCES } from './listingOptions.ts';

export interface Place { name: string; province: string }
export interface FoundPlace { location: string; province: string }

const HAVANA = 'La Habana';
const havana = (names: string[]): Place[] => names.map((name) => ({ name, province: HAVANA }));
const inProvince = (province: string, names: string[]): Place[] => names.map((name) => ({ name, province }));

/**
 * Municipalities of La Habana, frequent Havana neighbourhoods and the main towns of every other
 * province. A capital that shares its province's name (Matanzas, Holguín…) is left out on purpose:
 * that name alone cannot say whether the town or the whole province is meant, so it reads as the province.
 */
export const PLACES: readonly Place[] = [
  ...havana([
    'Playa', 'Plaza de la Revolución', 'Centro Habana', 'Habana Vieja', 'Regla', 'Habana del Este', 'Guanabacoa',
    'San Miguel del Padrón', 'Diez de Octubre', 'Cerro', 'Marianao', 'La Lisa', 'Boyeros', 'Arroyo Naranjo', 'Cotorro',
    'Vedado', 'Nuevo Vedado', 'Miramar', 'Siboney', 'Kohly', 'Cubanacán', 'Jaimanitas', 'Santa Fe', 'Almendares', 'Buenavista',
    'Santos Suárez', 'La Víbora', 'Lawton', 'Luyanó', 'Sevillano', 'Alamar', 'Guanabo', 'Cojímar', 'Bacuranao', 'Campo Florido',
    'Tarará', 'Santa María del Mar', 'Casablanca', 'La Ciruela', 'Mantilla', 'Párraga', 'La Güinera', 'Altahabana', 'Fontanar',
    'Santiago de las Vegas', 'Wajay', 'Calabazar', 'Capdevila', 'Casino Deportivo', 'Cayo Hueso', 'Los Sitios', 'Pogolotti',
    'Ayestarán', 'La Coronela', 'Juanelo',
  ]),
  ...inProvince('Pinar del Río', ['Viñales', 'Consolación del Sur', 'San Juan y Martínez', 'Los Palacios']),
  ...inProvince('Artemisa', ['San Antonio de los Baños', 'Bauta', 'Mariel', 'Guanajay', 'Bahía Honda']),
  ...inProvince('Mayabeque', ['San José de las Lajas', 'Güines', 'Santa Cruz del Norte', 'Jaruco', 'Bejucal']),
  ...inProvince('Matanzas', ['Varadero', 'Cárdenas', 'Jovellanos', 'Jagüey Grande']),
  ...inProvince('Villa Clara', ['Santa Clara', 'Remedios', 'Caibarién', 'Sagua la Grande', 'Placetas', 'Camajuaní']),
  ...inProvince('Cienfuegos', ['Cruces', 'Palmira', 'Rodas', 'Aguada de Pasajeros', 'Cumanayagua']),
  ...inProvince('Sancti Spíritus', ['Trinidad', 'Cabaiguán', 'Jatibonico', 'Yaguajay']),
  ...inProvince('Ciego de Ávila', ['Morón', 'Chambas', 'Majagua']),
  ...inProvince('Camagüey', ['Nuevitas', 'Guáimaro', 'Santa Cruz del Sur']),
  ...inProvince('Las Tunas', ['Puerto Padre', 'Amancio', 'Jesús Menéndez']),
  ...inProvince('Holguín', ['Gibara', 'Banes', 'Moa', 'Mayarí', 'Sagua de Tánamo']),
  ...inProvince('Granma', ['Bayamo', 'Manzanillo', 'Jiguaní', 'Niquero']),
  ...inProvince('Santiago de Cuba', ['Palma Soriano', 'Contramaestre']),
  ...inProvince('Guantánamo', ['Baracoa', 'Caimanera', 'Maisí']),
  ...inProvince('Isla de la Juventud', ['Nueva Gerona']),
];

/** Other spellings people write; `strict` names are everyday words, so they only count after «en» or «municipio». */
const ALIASES: { alias: string; name: string; strict?: boolean }[] = [
  { alias: 'playa', name: 'Playa', strict: true },
  { alias: 'plaza', name: 'Plaza de la Revolución', strict: true },
  { alias: 'la habana vieja', name: 'Habana Vieja' },
  { alias: '10 de octubre', name: 'Diez de Octubre' },
  { alias: 'vibora', name: 'La Víbora' },
  { alias: 'alta habana', name: 'Altahabana' },
  { alias: 'el wajay', name: 'Wajay' },
  { alias: 'kolhy', name: 'Kohly' },
];
const PROVINCE_ALIASES: Record<string, string> = { habana: HAVANA, santiago: 'Santiago de Cuba', pinar: 'Pinar del Río' };

interface Key { key: string; place: FoundPlace; pattern: RegExp }
const key = (name: string, place: FoundPlace, strict = false): Key => ({
  key: name, place,
  pattern: new RegExp(`${strict ? '(?:\\ben|municipio|mcpio\\.?|mpio\\.?)\\s+' : ''}(?<![a-z0-9])${name}(?![a-z0-9])`),
});
const placeKeys: Key[] = [
  ...PLACES.filter((place) => !ALIASES.some((alias) => alias.strict && alias.name === place.name))
    .map((place) => key(normalizeSearch(place.name), { location: place.name, province: place.province })),
  ...ALIASES.map(({ alias, name, strict }) => {
    const place = PLACES.find((item) => item.name === name)!;
    return key(alias, { location: place.name, province: place.province }, strict);
  }),
];
const provinceKeys: Key[] = [
  ...PROVINCES.map((province) => key(normalizeSearch(province), { location: '', province })),
  ...Object.entries(PROVINCE_ALIASES).map(([alias, province]) => key(alias, { location: '', province })),
];

function earliest(text: string, keys: Key[]): FoundPlace | null {
  let best: { index: number; length: number; place: FoundPlace } | null = null;
  for (const { key, place, pattern } of keys) {
    const match = pattern.exec(text);
    if (!match) continue;
    const index = match.index + match[0].length - key.length;
    if (!best || index < best.index || (index === best.index && key.length > best.length)) best = { index, length: key.length, place };
  }
  return best?.place ?? null;
}

/**
 * The place an ad names, ignoring accents and case, by whole words. The earliest mention wins (an ad
 * names its own place before the one it wants in return) and, at the same spot, the longest name
 * («Centro Habana» over «Habana»). Only a province named: that province and an empty location.
 */
export function findPlace(text: string): FoundPlace | null {
  const folded = normalizeSearch(text).replace(/\s+/g, ' ');
  return earliest(folded, placeKeys) ?? earliest(folded, provinceKeys);
}
