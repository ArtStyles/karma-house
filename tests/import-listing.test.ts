import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectAmenities, detectArea, detectBathrooms, detectBedrooms, detectCondition, detectFloor, detectNegotiable,
  detectOperation, detectPrice, detectType, normalizeText, parseListingText, stripContacts,
} from '../src/domain/importListing.ts';
import { findPlace, PLACES } from '../src/domain/places.ts';
import { emptyDraft, validateDraft, type ListingDraft } from '../src/domain/listings.ts';
import { AMENITIES, AMENITY_GROUPS, PROVINCES } from '../src/domain/listingOptions.ts';

const CONTACT_NOTE = 'Quitamos 1 dato de contacto: en KarmaHouse se habla por el chat.';
const complete = (draft: Partial<ListingDraft>) => validateDraft({ ...emptyDraft, ...draft, imageKey: 'vedado', clientRequestId: 'import-test' });

test('normalization turns keycap digits into digits and drops decoration, keeping line breaks', () => {
  assert.equal(normalizeText('Precio especial: 1️⃣2️⃣0️⃣0️⃣0️⃣ usd'), 'Precio especial: 12000 usd');
  assert.equal(normalizeText('🏡✨ Casa   en  Playa ✨🏡\n\n\n\n★ Sala ✔️\n☆☆☆\n• Cocina'), 'Casa en Playa\n\nSala\n\nCocina');
  assert.equal(normalizeText('   '), '');
});

test('contact data and the phrases that introduce it are removed and counted', () => {
  const { text, count } = stripContacts([
    'Casa linda', 'Llamar al 55550101 o 55550102', 'https://Wa.me/+5355550103', 'Tel: 7830 1234',
    'correo: venta@example.com', '+1 786 555 0104', 'Para más info escribir al whatsapp +53 5555 0105', 'TELÉFONO FIJO',
  ].join('\n'));
  assert.equal(text, 'Casa linda\nTELÉFONO FIJO');
  assert.equal(count, 7);
  const result = parseListingText('Vendo casa en Playa 📲55550106📲\nlinda y amplia, llamar al 55550107, t.me/vendedor');
  for (const value of [result.draft.title, result.draft.description]) assert.doesNotMatch(value ?? '', /5555|t\.me|llamar/i);
  assert.deepEqual(result.notes, ['Quitamos 3 datos de contacto: en KarmaHouse se habla por el chat.']);
  assert.deepEqual(parseListingText('Vendo casa con teléfono fijo y patio').notes, []);
});

test('removing contacts leaves no connector debris and keeps connectors in real sentences', () => {
  const cases: [string, string, number][] = [
    ['30 USD por noche. Escribir al whatsapp +53 55550123 o a casa.vedado@example.com', '30 USD por noche.', 2],
    ['Casa amplia. Llamar al 55550124 o al 55550125', 'Casa amplia.', 2],
    ['Sala y comedor, 55550126 o al 55550127.\nPatio', 'Sala y comedor\nPatio', 2],
    ['Casa en Playa. Escribir por whatsapp al wa.me/5355550128', 'Casa en Playa.', 1],
    ['Casa linda, por whatsapp al https://wa.me/5355550129', 'Casa linda', 1],
    ['55550130 o al\nCasa o apartamento', 'Casa o apartamento', 1],
    ['Casa o apartamento con sala y comedor, a 2 cuadras del mar y en buen estado.', 'Casa o apartamento con sala y comedor, a 2 cuadras del mar y en buen estado.', 0],
  ];
  for (const [input, text, count] of cases) assert.deepEqual(stripContacts(input), { text, count }, input);
  const result = parseListingText('Alquilo casa en Playa, 30 USD por noche. Escribir al whatsapp +53 55550123 o a casa.vedado@example.com');
  assert.equal(result.draft.description, 'Alquilo casa en Playa, 30 USD por noche.');
  assert.deepEqual(result.notes, ['Quitamos 2 datos de contacto: en KarmaHouse se habla por el chat.']);
});

test('operation follows the earliest keyword and defaults to an undetected sale', () => {
  assert.equal(detectOperation('Vendo casa en Playa'), 'sale');
  assert.equal(detectOperation('Venta de apartamento'), 'sale');
  assert.equal(detectOperation('Se alquila apartamento'), 'rent');
  assert.equal(detectOperation('Rento casa en Guanabo'), 'rent');
  assert.equal(detectOperation('Permuto mi casa por un apartamento'), 'swap');
  assert.equal(detectOperation('Cambio mi apartamento por una casa'), 'swap');
  assert.equal(detectOperation('Busco casa en el Vedado'), 'wanted');
  assert.equal(detectOperation('Compro apartamento'), 'wanted');
  assert.equal(detectOperation('Permuto casa en Playa, busco apartamento en el Vedado'), 'swap');
  assert.equal(detectOperation('Busco casa, compro o permuto'), 'wanted');
  assert.equal(detectOperation('Vendo casa, busco comprador serio'), 'sale');
  assert.equal(detectOperation('Necesito vender urgente'), 'sale');
  assert.equal(detectOperation('Casa en Playa con patio'), undefined);
  const result = parseListingText('Casa en Playa con patio y garaje');
  assert.equal(result.draft.operation, 'sale');
  assert.equal(result.detected.includes('operation'), false);
});

test('price reads thousands, separators and currency, and rejects phones and other currencies', () => {
  assert.deepEqual(detectPrice('Precio:10mil usd'), { price: 10000, otherCurrency: false });
  assert.equal(detectPrice('Su precio es 18mil se deja vacía').price, 18000);
  assert.equal(detectPrice('Su precio es 18 mil').price, 18000);
  assert.equal(detectPrice('Lo dejo en 45k').price, 45000);
  assert.equal(detectPrice('Precio 45.000 USD').price, 45000);
  assert.equal(detectPrice('Vale 45,000').price, 45000);
  assert.equal(detectPrice('Solo $45000').price, 45000);
  assert.equal(detectPrice('Precio 15000 y me ajusto con dinero en mano').price, 15000);
  assert.equal(detectPrice('Precio 12.5 mil').price, 12500);
  assert.equal(detectPrice(normalizeText('Precio especial:\n1️⃣8️⃣0️⃣0️⃣0️⃣')).price, 18000);
  assert.equal(detectPrice('Precio a conversar 55550108').price, undefined);
  assert.deepEqual(detectPrice('Precio: 800000 cup'), { price: undefined, otherCurrency: true });
  assert.deepEqual(detectPrice('800000 cup'), { price: undefined, otherCurrency: true });
  assert.equal(detectPrice('Precio 25mil, se aceptan ofertas desde 20 mil').price, 25000);
  assert.equal(detectPrice('Casa 35 mil, reformada con 5 mil').price, 35000);
  assert.equal(detectPrice('Interesados escribir por privado').price, undefined);
  // Watch-outs: street numbers, voltages, counts and floors are never prices.
  assert.equal(detectPrice('calle 27 y a Paseo, 110V y 220V, 5 balcones, 1er piso').price, undefined);
  assert.equal(detectPrice('Precio a conversar, 120 m2').price, undefined);
  assert.equal(detectPrice('Alquilo a 35 usd la noche').price, 35);
  const result = parseListingText('Vendo casa en Playa. Precio: 800000 cup');
  assert.equal(result.draft.price, undefined);
  assert.deepEqual(result.notes, ['El precio está en otra moneda; indícalo en USD.']);
});

test('bedrooms and bathrooms come from digits, words, Cuban 3/4 and single bathroom lines', () => {
  for (const [text, bedrooms] of [
    ['3 habitación', 3], ['3 habitaciones', 3], ['2 cuartos', 2], ['2 dormitorios independientes', 2], ['1cuarto', 1],
    ['Un cuarto', 1], ['dos cuartos', 2], ['tres habitaciones', 3], ['Casa 3/4 en Playa', 3],
  ] as const) assert.equal(detectBedrooms(text), bedrooms, text);
  for (const text of ['2 plantas', 'el cuarto piso', '5 balcones', '1 cuarto de desahogo']) assert.equal(detectBedrooms(text), undefined, text);
  for (const [text, bathrooms] of [
    ['4 baños', 4], ['1 1/2 baños', 1], ['dos baños', 2], ['Sala\nBaño\nPatio', 1], ['baño enchapado', 1],
    ['sala de baño intercalado', 1], ['sala, cocina, 2 cuartos, baño y patio', 1],
  ] as const) assert.equal(detectBathrooms(text), bathrooms, text);
  for (const text of ['San Antonio de los Baños', 'baños nuevos', '2 cuartos con baño propio']) assert.equal(detectBathrooms(text), undefined, text);
});

test('area needs a square-metre unit and is never a frontage', () => {
  assert.equal(detectArea('120 m2'), 120);
  assert.equal(detectArea('85 m²'), 85);
  assert.equal(detectArea('90 mts'), 90);
  assert.equal(detectArea('200 metros cuadrados'), 200);
  assert.equal(detectArea('1.200 m2 de terreno'), 1200);
  assert.equal(detectArea('10 mts de frente'), undefined);
  assert.equal(detectArea('terreno de 10x20 mts'), undefined);
  assert.equal(detectArea('110V y 220V'), undefined);
});

test('type is the first house or apartment word', () => {
  assert.equal(detectType('Venta de apartamento'), 'Apartamento');
  assert.equal(detectType('Apto en Centro Habana'), 'Apartamento');
  assert.equal(detectType('Biplanta en Kohly'), 'Casa');
  assert.equal(detectType('Chalet en Miramar'), 'Casa');
  assert.equal(detectType('Casa con apartamento independiente'), 'Casa');
  assert.equal(detectType('Apartamento en una casa grande'), 'Apartamento');
  assert.equal(detectType('Reparto Casablanca'), undefined);
});

test('floor reads ordinals and ground floor, not storeys', () => {
  assert.equal(detectFloor('En alto 1er piso(solo tiene 2 plantas'), 1);
  assert.equal(detectFloor('la casa es un 1er piso'), 1);
  assert.equal(detectFloor('primer piso de una biplanta'), 1);
  assert.equal(detectFloor('3er piso'), 3);
  assert.equal(detectFloor('5to piso con ascensor'), 5);
  assert.equal(detectFloor('segundo piso'), 2);
  assert.equal(detectFloor('planta baja'), 0);
  assert.equal(detectFloor('apartamento en bajos'), 0);
  for (const text of ['edificio de 5 pisos', 'piso de granito', 'precios bajos', 'Primer y único piso', 'solo tiene 2 plantas']) assert.equal(detectFloor(text), undefined, text);
});

test('negotiable price and condition need their words', () => {
  for (const text of ['Precio 15000 y me ajusto', 'Precio a conversar', 'negociable', 'se escuchan ofertas']) assert.equal(detectNegotiable(text), true, text);
  assert.equal(detectNegotiable('Precio fijo'), false);
  assert.equal(detectCondition('buen estado constructivo'), 'good');
  assert.equal(detectCondition('en buenas condiciones'), 'good');
  assert.equal(detectCondition('casa para reparar'), 'needs-renovation');
  assert.equal(detectCondition('necesita reparación del techo'), 'needs-renovation');
  assert.equal(detectCondition('a estrenar'), 'new');
  assert.equal(detectCondition('recién construida'), 'new');
  assert.equal(detectCondition('casa amplia'), undefined);
});

test('the amenity catalogue is grouped and keeps every earlier value verbatim', () => {
  assert.deepEqual(AMENITY_GROUPS.map((group) => group.title), ['Servicios', 'Espacios', 'Equipamiento']);
  assert.deepEqual([...AMENITIES], AMENITY_GROUPS.flatMap((group) => group.items));
  assert.equal(new Set(AMENITIES).size, AMENITIES.length);
  assert.ok(AMENITIES.length <= 20);
  for (const earlier of ['Balcón', 'Patio', 'Garaje', 'Amueblado', 'Aire acondicionado', 'Ascensor', 'Terraza', 'Piscina', 'Cisterna', 'Tanque de agua', 'Entrada independiente']) {
    assert.ok(AMENITIES.includes(earlier), earlier);
  }
});

test('amenities map every synonym to the catalogue once', () => {
  const cases: [string, string[]][] = [
    ['Balcón', ['Balcón']], ['5 balcones', ['Balcón']], ['Patio comun c/un vecino', ['Patio']], ['Garaje', ['Garaje']],
    ['garage', ['Garaje']], ['2 terrazas', ['Terraza']], ['piscina', ['Piscina']], ['Cisterna con motor de agua', ['Cisterna']],
    ['ascensor', ['Ascensor']], ['elevador', ['Ascensor']], ['TANQUE ELEVADO GRANDE', ['Tanque de agua']],
    ['aire acondicionado nuevo (split)', ['Aire acondicionado']], ['split en el cuarto', ['Aire acondicionado']],
    ['Municipio Regla(puerta calle)', ['Entrada independiente']], ['entrada independiente', ['Entrada independiente']],
    ['amueblado', ['Amueblado']], ['con todo adentro', ['Amueblado']], ['se deja todo', ['Amueblado']],
    ['juego de sala', ['Amueblado']], ['Se deja:\nRefrigerador\nCama', ['Amueblado']],
    ['Su precio es 18mil se deja vacía', []],
    ['GAS DE LA CALLE, TELÉFONO FIJO, Placa libre, Azotea libre', ['Gas de la calle', 'Teléfono fijo', 'Azotea o placa libre']],
  ];
  for (const [text, amenities] of cases) assert.deepEqual(detectAmenities(text), amenities, text);
  const all = detectAmenities('balcón, patio, garaje, terraza, piscina, cisterna, ascensor, tanque, split, puerta calle, amueblado, balcones, '
    + 'gas de la calle, agua 24/7, teléfono fijo, inversor, portal, placa libre, parqueo');
  assert.deepEqual(all, [...AMENITIES]);
});

test('area reads decimals and phrases, and prefers the home over its parts', () => {
  assert.equal(detectArea('Casa con 60.30m2 de construcción'), 60.3);
  assert.equal(detectArea('71 m²'), 71);
  assert.equal(detectArea('más de 100 m2'), 100);
  assert.equal(detectArea('portal de 16m2, sala, cocina. Tiene más de 100 m2'), 100);
  assert.equal(detectArea('patio de 20 m2 y casa de 85 m2'), 85);
  for (const text of ['terraza de 30m2', 'garaje de 18 m2', 'patio de 20 m2', 'cuarto de 5 m x 2 m', 'puerta de alto 1.35 m', 'lote de 5 mts x 20 mts']) {
    assert.equal(detectArea(text), undefined, text);
  }
});

test('price reads «30mil», cents after a decimal comma, and ignores litres, years, steps and watts', () => {
  assert.equal(detectPrice('Precio 30mil USD').price, 30000);
  assert.deepEqual(detectPrice('PRECIO DE VENTA: 90.000,00 USD o 85.000,00€'), { price: 90000, otherCurrency: true });
  const euros = parseListingText('Vendo casa en Playa\nPRECIO DE VENTA: 90.000,00 USD o 85.000,00€');
  assert.equal(euros.draft.price, '90000');
  assert.deepEqual(euros.notes, []);
  for (const text of ['cisterna de 13 mil litros', 'calentador de agua de 70 litros', 'construido 1946', 'construida en 1958', '54 escalones', '110W y 220W']) {
    assert.equal(detectPrice(text).price, undefined, text);
  }
  assert.equal(detectPrice('Cisterna de 13 mil litros. Precio 30mil USD').price, 30000);
});

test('rooms read tight lists and add up qualified bathroom lines, never potential rooms', () => {
  assert.equal(detectBedrooms('Sala,Comedor,cocina,baño,3 habitaciones'), 3);
  assert.equal(detectBathrooms('Sala,Comedor,cocina,baño,3 habitaciones'), 1);
  assert.equal(detectBedrooms('4 cuartos, 1 baño'), 4);
  assert.equal(detectBathrooms('4 cuartos, 1 baño'), 1);
  assert.equal(detectBathrooms('Sala\n1 Baño principal\n1 Baño de servicio\nPatio'), 2);
  assert.equal(detectBathrooms('Baño\n2 baños'), 2);
  assert.equal(detectBathrooms('Casa con 2 baños.\n2 baños'), 2);
  assert.equal(detectBathrooms('2 baños en la primera planta\n1 baño en la segunda planta'), 3);
  for (const text of ['Espacio para 3 cuartos', 'placa libre para 2 cuartos más', '3 Plantas', 'Agua 24/7']) assert.equal(detectBedrooms(text), undefined, text);
  assert.equal(detectBedrooms('2 cuartos. Placa libre para 2 cuartos más'), 2);
  for (const detect of [detectBathrooms, detectArea, detectFloor]) assert.equal(detect('Agua 24/7'), undefined);
  assert.equal(detectPrice('Agua 24/7').price, undefined);
});

test('floor reads levels, «en alto» and «abajo», never where a room sits', () => {
  assert.equal(detectFloor('Apto en 2do nivel'), 2);
  assert.equal(detectFloor('Casa en altos de un biplanta'), 1);
  assert.equal(detectFloor('Casa en alto'), 1);
  assert.equal(detectFloor('Es la parte de abajo de un biplanta'), 0);
  assert.equal(detectFloor('Sala\nBajos\nPatio'), 0);
  assert.equal(detectFloor('ubicado en planta baja'), 0);
  for (const text of ['2 baños en la primera planta', '3 cuartos en el segundo piso', 'baño en el 2do nivel', 'casa de 2 niveles', 'de un solo nivel', 'precios bajos']) {
    assert.equal(detectFloor(text), undefined, text);
  }
  assert.equal(detectType('Apto en Habana Vieja'), 'Apartamento');
  assert.equal(detectType('Casa en alto de un biplanta'), 'Casa');
  assert.deepEqual(findPlace('Casa en el Náutico'), { location: 'Náutico', province: 'La Habana' });
});

test('contacts separated by slashes or misspelt are removed; bare contact phrases go uncounted', () => {
  assert.deepEqual(stripContacts('Casa en Playa\n+53 55550101/+53 55550102'), { text: 'Casa en Playa', count: 2 });
  assert.deepEqual(stripContacts('Casa en Playa. Info por whatsap al 55550103'), { text: 'Casa en Playa.', count: 1 });
  assert.deepEqual(stripContacts('Casa en Playa\nContacto: +53 55550104'), { text: 'Casa en Playa', count: 1 });
  assert.deepEqual(stripContacts('Casa en Playa\nEscribir directamente al whatsapp\nMás detalles al privado'), { text: 'Casa en Playa', count: 0 });
  assert.deepEqual(stripContacts('Casa en Playa. Más detalles al privado.'), { text: 'Casa en Playa.', count: 0 });
  assert.deepEqual(stripContacts('Patio privado con árboles'), { text: 'Patio privado con árboles', count: 0 });
  assert.deepEqual(parseListingText('Vendo casa en Playa\nMás detalles al privado').notes, []);
});

test('the new amenities read their synonyms and skip negations', () => {
  const cases: [string, string[]][] = [
    ['gas de la calle', ['Gas de la calle']], ['Gas de balita', []], ['cocina de gas con balita', []],
    ['Agua 24/7', ['Agua todos los días']], ['agua todos los días', ['Agua todos los días']], ['agua siempre', ['Agua todos los días']],
    ['no falta el agua', ['Agua todos los días']], ['agua días alternos', []], ['el agua entra un día sí y otro no', []],
    ['teléfono fijo', ['Teléfono fijo']], ['respaldo energético', ['Respaldo eléctrico']], ['planta eléctrica', ['Respaldo eléctrico']],
    ['inversor con baterías', ['Respaldo eléctrico']], ['paneles solares', ['Respaldo eléctrico']],
    ['portal amplio', ['Portal']], ['azotea libre', ['Azotea o placa libre']], ['placa libre', ['Azotea o placa libre']],
    ['parqueo', ['Parqueo']], ['garaje', ['Garaje']], ['totalmente climatizada', ['Aire acondicionado']],
    ['cocina equipada', ['Amueblado']], ['llave en mano', ['Amueblado']],
    ['No barbacoa', []], ['sin garaje', []], ['no tiene patio', []], ['sin garaje, con patio', ['Patio']],
  ];
  for (const [text, amenities] of cases) assert.deepEqual(detectAmenities(text), amenities, text);
});

test('a fixed price is read as not negotiable; condition reads restorations and skips small details', () => {
  assert.equal(detectNegotiable('NO INTERMEDIARIOS'), undefined);
  assert.equal(detectNegotiable('Precio fijo'), false);
  assert.equal(detectNegotiable('Precio 40mil USD, no negociable'), false);
  assert.equal(detectNegotiable('Precio 40mil USD negociable'), true);
  assert.equal(parseListingText('Vendo casa en Playa. Precio fijo 40mil USD').draft.priceNegotiable, false);
  assert.equal(detectCondition('en perfecto estado'), 'good');
  assert.equal(detectCondition('totalmente restaurada'), 'good');
  assert.equal(detectCondition('recién remodelado'), 'good');
  assert.equal(detectCondition('necesita de muy pequeños detalles'), undefined);
  assert.equal(detectCondition('le quedan detalles por terminar'), undefined);
});

test('full sale written the way Havana ads read today', () => {
  const ad = [
    '🔥🔥SE VENDE APTO EN EL NÁUTICO🔥🔥', 'Apto en 2do nivel, totalmente restaurado',
    'Sala,Comedor,cocina equipada,3 habitaciones', '1 Baño principal', '1 Baño de servicio',
    'portal de 16m2, más de 100 m2 en total', 'Gas de la calle, agua 24/7, sin garaje', 'Espacio para 2 cuartos más en la placa libre',
    'PRECIO DE VENTA: 90.000,00 USD o 85.000,00€ no negociable', 'NO INTERMEDIARIOS', 'Más detalles al privado',
    'Contacto: +53 55550160/+53 55550161',
  ].join('\n');
  const result = parseListingText(ad);
  assert.deepEqual({ ...result.draft, description: undefined }, {
    operation: 'sale', title: 'Apartamento en Náutico', type: 'Apartamento', location: 'Náutico', province: 'La Habana',
    price: '90000', bedrooms: '3', bathrooms: '2', area: '100', floor: '2', condition: 'good', priceNegotiable: false,
    amenities: ['Gas de la calle', 'Agua todos los días', 'Portal', 'Azotea o placa libre', 'Amueblado'], description: undefined,
  });
  assert.doesNotMatch(result.draft.description ?? '', /5555|privado|Contacto/);
  assert.deepEqual(result.notes, ['Quitamos 2 datos de contacto: en KarmaHouse se habla por el chat.']);
  assert.equal(complete(result.draft).ok, true);
});

test('places match whole words without accents, earliest first, and fall back to the province', () => {
  assert.deepEqual(findPlace('Venta de Casa en playa'), { location: 'Playa', province: 'La Habana' });
  assert.deepEqual(findPlace('cerca de la playa'), null);
  assert.deepEqual(findPlace('Municipio Regla(puerta calle) Reparto la ciruela'), { location: 'Regla', province: 'La Habana' });
  assert.deepEqual(findPlace('en el Vedado, zona alta'), { location: 'Vedado', province: 'La Habana' });
  assert.deepEqual(findPlace('en NUEVO VEDADO'), { location: 'Nuevo Vedado', province: 'La Habana' });
  assert.deepEqual(findPlace('apartamento en Centro Habana'), { location: 'Centro Habana', province: 'La Habana' });
  assert.deepEqual(findPlace('casa en Santos Suarez'), { location: 'Santos Suárez', province: 'La Habana' });
  assert.deepEqual(findPlace('Cruces, Cienfuegos'), { location: 'Cruces', province: 'Cienfuegos' });
  assert.deepEqual(findPlace('en Santiago de las Vegas'), { location: 'Santiago de las Vegas', province: 'La Habana' });
  assert.deepEqual(findPlace('casa en Villa Clara'), { location: '', province: 'Villa Clara' });
  assert.deepEqual(findPlace('en la Habana'), { location: '', province: 'La Habana' });
  assert.deepEqual(findPlace('Altahabana'), { location: 'Altahabana', province: 'La Habana' });
  assert.deepEqual(findPlace('calle 27 y a Paseo'), null);
  for (const place of PLACES) assert.ok(PROVINCES.includes(place.province), place.name);
  assert.ok(PLACES.length >= 80);
});

test('rent reads nightly and monthly prices', () => {
  const nightly = parseListingText('Se alquila apartamento en Miramar, 35 usd por noche');
  assert.equal(nightly.draft.rentPeriod, 'day');
  assert.ok(nightly.detected.includes('rentPeriod'));
  const monthly = parseListingText('Alquilo casa en Playa, 300 usd al mes');
  assert.equal(monthly.draft.rentPeriod, 'month');
  assert.equal(monthly.draft.price, '300');
  const unstated = parseListingText('Alquilo casa en Playa, 300 usd');
  assert.equal(unstated.draft.rentPeriod, 'month');
  assert.equal(unstated.detected.includes('rentPeriod'), false);
});

test('a swap keeps what the owner wants in return when it says enough', () => {
  const swap = parseListingText('Permuto casa en Playa por apartamento en el Vedado con 2 cuartos. Casa amplia con patio.');
  assert.equal(swap.draft.swapWants, 'apartamento en el Vedado con 2 cuartos');
  assert.equal(parseListingText('Permuto casa por apto. Casa amplia con patio y garaje.').draft.swapWants, undefined);
  assert.equal(parseListingText('Vendo casa por cambio de residencia').draft.swapWants, undefined);
});

test('a generic title becomes type and place, a long one is cut', () => {
  assert.equal(parseListingText('Venta de Casa en playa\nSala, cocina y patio').draft.title, 'Casa en Playa');
  assert.equal(parseListingText('Se vende apartamento\nen el Vedado, 2 cuartos').draft.title, 'Apartamento en Vedado');
  assert.equal(parseListingText('Se vende casa\nSala, cocina y patio').draft.title, 'Se vende casa');
  assert.equal(parseListingText('Permuto casa en Cruces, Cienfuegos\nSala').draft.title, 'Permuto casa en Cruces, Cienfuegos');
  assert.equal(parseListingText('Precio especial: 25000 USD\nCasa en el Vedado, zona alta, 3 cuartos').draft.title, 'Casa en el Vedado, zona alta, 3 cuartos');
  assert.equal(parseListingText('~Yuli Propiedades~\nLinda casa en Guanabo\nSala').draft.title, 'Linda casa en Guanabo');
  const long = parseListingText(`Vendo ${'casa muy amplia y luminosa '.repeat(8)}`);
  assert.ok((long.draft.title ?? '').length <= 100);
});

test('a one-paragraph ad keeps the title up to the place or the type', () => {
  const rent = parseListingText('Alquilo apartamento amueblado en el Vedado, 2do piso, 2 habitaciones, 1 baño, balcón y aire acondicionado. 40 USD por noche.');
  assert.equal(rent.draft.title, 'Alquilo apartamento amueblado en el Vedado');
  const sale = parseListingText('Vendo casa colonial en Santos Suárez con portal, 3 cuartos, 2 baños, patio y garaje. Precio 60000 USD.');
  assert.equal(sale.draft.title, 'Vendo casa colonial en Santos Suárez');
  const early = parseListingText('Vendo, por viaje, casa en Playa con garaje, 3 cuartos, 2 baños, patio y terraza. Precio 50000 USD.');
  assert.equal(early.draft.title, 'Vendo, por viaje, casa en Playa');
  assert.ok((parseListingText('Vendo, por viaje, casa en Playa con garaje').draft.title ?? '').length >= 15);
});

test('description is cut to 2000 characters', () => {
  const result = parseListingText(`Vendo casa en Playa. ${'Sala amplia y ventilada. '.repeat(200)}`);
  assert.equal(result.draft.description?.length, 2000);
});

test('empty text returns an empty draft with what a sale needs', () => {
  for (const text of ['', '   \n  ', '🏡✨🏡']) {
    assert.deepEqual(parseListingText(text), {
      draft: {}, detected: [], notes: [],
      missing: ['title', 'type', 'location', 'province', 'price', 'bedrooms', 'bathrooms', 'description'],
    });
  }
});

test('full sale listed line by line', () => {
  const ad = [
    '🏡✨~Casas de Yuli~✨🏡', 'Venta de Casa en playa', 'Consta:', '✅Sala', '✅Cocina', '✅Comedor', '✅2 cuartos', '✅Baño',
    '✅Patio comun c/un vecino', 'CARACTERÍSTICAS:', '▪️GAS DE LA CALLE', '▪️TANQUE ELEVADO GRANDE', '▪️TELÉFONO FIJO',
    '▪️Placa libre', 'Se deja:', 'Juego de sala', 'Refrigerador', 'Precio:10mil usd', '📲55550111📲',
  ].join('\n');
  const result = parseListingText(ad);
  assert.deepEqual(result.draft, {
    operation: 'sale', title: 'Casa en Playa', type: 'Casa', location: 'Playa', province: 'La Habana', price: '10000',
    bedrooms: '2', bathrooms: '1', amenities: ['Gas de la calle', 'Teléfono fijo', 'Tanque de agua', 'Patio', 'Azotea o placa libre', 'Amueblado'],
    description: [
      '~Casas de Yuli~', 'Venta de Casa en playa', 'Consta:', 'Sala', 'Cocina', 'Comedor', '2 cuartos', 'Baño',
      'Patio comun c/un vecino', 'CARACTERÍSTICAS:', 'GAS DE LA CALLE', 'TANQUE ELEVADO GRANDE', 'TELÉFONO FIJO',
      'Placa libre', 'Se deja:', 'Juego de sala', 'Refrigerador', 'Precio:10mil usd',
    ].join('\n'),
  });
  assert.deepEqual(result.detected, ['operation', 'title', 'type', 'location', 'province', 'price', 'bedrooms', 'bathrooms', 'amenities', 'description']);
  assert.deepEqual(result.missing, [], 'the surface is optional');
  assert.deepEqual(result.notes, [CONTACT_NOTE]);
});

test('full sale written as a paragraph', () => {
  const ad = 'Vendo apartamento en el Vedado, zona alta, calle 27 y a Paseo. 3er piso, 2 dormitorios independientes, 1 1/2 baños, '
    + 'sala comedor, cocina, balcón a la calle, 85 m2. Buen estado constructivo, tanque y cisterna con motor de agua, 110V y 220V. '
    + 'Precio 45.000 USD negociable. Interesados llamar al 55550122 o escribir al whatsapp +53 55550123.';
  const result = parseListingText(ad);
  assert.deepEqual(result.draft, {
    operation: 'sale', title: 'Apartamento en Vedado', type: 'Apartamento',
    location: 'Vedado', province: 'La Habana', price: '45000', bedrooms: '2', bathrooms: '1', area: '85', floor: '3',
    condition: 'good', priceNegotiable: true, amenities: ['Cisterna', 'Tanque de agua', 'Balcón'],
    description: 'Vendo apartamento en el Vedado, zona alta, calle 27 y a Paseo. 3er piso, 2 dormitorios independientes, 1 1/2 baños, '
      + 'sala comedor, cocina, balcón a la calle, 85 m2. Buen estado constructivo, tanque y cisterna con motor de agua, 110V y 220V. '
      + 'Precio 45.000 USD negociable.',
  });
  assert.deepEqual(result.detected, ['operation', 'title', 'type', 'location', 'province', 'price', 'bedrooms', 'bathrooms', 'area', 'floor', 'condition', 'priceNegotiable', 'amenities', 'description']);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.notes, ['Quitamos 2 datos de contacto: en KarmaHouse se habla por el chat.']);
  assert.equal(complete(result.draft).ok, true);
});

test('full swap', () => {
  const ad = [
    'Permuto casa en Cruces, Cienfuegos',
    'Casa de 2 plantas, 3 habitaciones, 2 baños, garaje y 2 terrazas. 140 m2. Placa libre.',
    'Busco apartamento en La Habana, preferiblemente en Centro Habana o Plaza.',
    'Contacto: 55550133',
  ].join('\n');
  const result = parseListingText(ad);
  assert.deepEqual(result.draft, {
    operation: 'swap', title: 'Permuto casa en Cruces, Cienfuegos', type: 'Casa', location: 'Cruces', province: 'Cienfuegos',
    bedrooms: '3', bathrooms: '2', area: '140', amenities: ['Terraza', 'Azotea o placa libre', 'Garaje'],
    swapWants: 'apartamento en La Habana, preferiblemente en Centro Habana o Plaza',
    description: ad.split('\n').slice(0, 3).join('\n'),
  });
  assert.deepEqual(result.detected, ['operation', 'title', 'type', 'location', 'province', 'bedrooms', 'bathrooms', 'area', 'amenities', 'description', 'swapWants']);
  assert.deepEqual(result.missing, ['price']);
  assert.deepEqual(result.notes, [CONTACT_NOTE]);
});

test('full rent', () => {
  const ad = [
    '🌴 Se alquila apartamento en Miramar 🌴',
    '2 cuartos con aire acondicionado (split), 1 baño, cocina equipada, balcón con vista al mar. 60 m2.',
    'Amueblado. 5to piso con ascensor.',
    '35 usd por noche, mínimo 3 noches.',
    'WhatsApp: https://wa.me/5355550144',
  ].join('\n');
  const result = parseListingText(ad);
  assert.deepEqual(result.draft, {
    operation: 'rent', title: 'Apartamento en Miramar', type: 'Apartamento', location: 'Miramar', province: 'La Habana',
    price: '35', bedrooms: '2', bathrooms: '1', area: '60', floor: '5', rentPeriod: 'day',
    amenities: ['Balcón', 'Amueblado', 'Aire acondicionado', 'Ascensor'],
    description: [
      'Se alquila apartamento en Miramar',
      '2 cuartos con aire acondicionado (split), 1 baño, cocina equipada, balcón con vista al mar. 60 m2.',
      'Amueblado. 5to piso con ascensor.',
      '35 usd por noche, mínimo 3 noches.',
    ].join('\n'),
  });
  assert.deepEqual(result.detected, ['operation', 'title', 'type', 'location', 'province', 'price', 'bedrooms', 'bathrooms', 'area', 'floor', 'amenities', 'description', 'rentPeriod']);
  assert.deepEqual(result.missing, []);
  assert.equal(complete(result.draft).ok, true);
});

test('full wanted ad', () => {
  const ad = [
    'Busco casa o apartamento en Nuevo Vedado o Plaza.',
    'Mínimo 2 cuartos, 2 baños, preferiblemente con garaje.',
    'Presupuesto hasta 30mil usd.',
    'Llamar al 55550155',
  ].join('\n');
  const result = parseListingText(ad);
  assert.deepEqual(result.draft, {
    operation: 'wanted', title: 'Busco casa o apartamento en Nuevo Vedado o Plaza', type: 'Casa', location: 'Nuevo Vedado',
    province: 'La Habana', price: '30000', bedrooms: '2', description: ad.split('\n').slice(0, 3).join('\n'),
  });
  assert.deepEqual(result.detected, ['operation', 'title', 'type', 'location', 'province', 'price', 'bedrooms', 'description']);
  assert.deepEqual(result.missing, []);
  assert.equal(complete(result.draft).ok, true);
});
