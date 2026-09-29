# Importar anuncio, comodidades del mercado y superficie opcional: verificación

30 de septiembre de 2026. Commits `3e9ad5a`…`ea5a438` en `main`. Diseños: [importar](superpowers/specs/2026-09-30-import-listing-design.md), [superficie opcional](superpowers/specs/2026-09-30-optional-area-design.md).

## Origen de los patrones

Doce anuncios reales de Revolico aportados por el usuario como capturas. Revolico bloquea la lectura automática con la verificación anti-bots de Cloudflare, tanto en el navegador integrado como en Chrome controlado por la extensión; no se intentó saltarla. Los anuncios de las pruebas están redactados para este repositorio, con teléfonos ficticios `55550101`-`55550199`.

## Pruebas locales

`npm run check`: typecheck limpio, 317 pruebas. `tests/import-listing.test.ts` (32): normalización de emoji y dígitos de tecla, eliminación de contactos y de los restos de conectores, las cuatro operaciones, precios («30mil USD», «90.000,00 USD o 85.000,00€», «45k», dígitos emoji), falsos positivos («13 mil litros», «construido 1946», «54 escalones», «110W y 220W», «calle 27», «Agua 24/7», «3 Plantas», «Espacio para 3 cuartos»), habitaciones y baños (pegados, en letras, `3/4`, listas con comas, baños en líneas separadas que suman), superficie (decimal, «más de 100 m2», partes de la vivienda ignoradas), planta («2do nivel», «en altos», «parte de abajo»), comodidades con negaciones, 112 lugares, y cinco anuncios completos.

## Migración de superficie opcional

```
migración aplicada
{"commit":true,"before":{"users":2,"properties":2,"notifications":12,"searches":1,"objects":6},"after":{…igual…},"inventoryUnchanged":true}
suite superada sobre el esquema aplicado
{"offer_fields":true,"catalog":true,"alerts":true,"offers_without_area":0}
suite superada sobre el esquema aplicado   (optional_area, rent, operations, search_alerts)
```

## Navegador (modo demo, por los subagentes)

«Pegar anuncio»: contador y botón deshabilitado con texto corto; un anuncio en lista y un alquiler en párrafo rellenan título, tipo, zona, provincia, precio, habitaciones, baños, planta, estado, negociable y comodidades; el aviso lista lo detectado y lo que falta; ni teléfono ni correo sobreviven; «Descartar lo importado» vuelve al selector. Filtros y formulario muestran Servicios, Espacios y Equipamiento. Una venta sin superficie se publica y tarjeta y detalle omiten los m².

## Teléfono (Pixel 7 Pro, APK 0.1.9, ETECSA LTE)

Instalado por ADB encima de 0.1.8. Publicar → Cambiar → «Pegar anuncio» → texto de prueba escrito por ADB («Vendo casa en el Vedado, puerta calle… 3 cuartos, 2 banos, garaje y patio. Gas de la calle y tanque elevado. Precio 45mil usd negociable. Llamar al 55550123») → Analizar:

- Aviso: «Rellenamos desde tu texto: qué publicas, título del anuncio, tipo de vivienda, zona o barrio, provincia, precio en USD, habitaciones, baños, precio negociable, comodidades, descripción.» y «Quitamos 1 dato de contacto…».
- Paso 1: título «Vendo casa en el Vedado, puerta calle», Casa, Vedado, La Habana.
- Paso 2: precio 45000, «Habitaciones: 3», «Baños: 2», «Precio negociable: Sí, acepto negociar», «Superficie (m², opcional)» vacía, grupos Servicios / Espacios / Equipamiento con «Gas de la calle» marcada; la descripción termina en «negociable.» sin el teléfono.
- «Descartar lo importado» devolvió el selector.

## Pendiente

- Pegar desde el portapapeles un anuncio real copiado de Revolico o WhatsApp en el teléfono (la prueba usó texto escrito por ADB, sin acentos ni saltos de línea).
- Publicar con fotos un anuncio importado y aprobarlo.

## Límites conocidos

- «1er piso» se lee siempre como planta 1; «Primer y único piso» no fija planta.
- Una permuta importada necesita que se elija la diferencia de dinero a mano.
- Nombres de municipio que también son palabras o nombres propios (Mariel, Trinidad, Remedios) pueden coincidir en falso.
- Un número suelto sin «precio», moneda, «mil» ni separador de miles no se toma como precio.
- Clientes 0.1.8 o anteriores no reciben anuncios sin superficie en catálogo ni mapa, pero fallan si abren uno por enlace, alerta, favoritos, Mis anuncios o Admin.
