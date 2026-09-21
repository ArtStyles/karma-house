# KarmaHouse: ubicación y mapa

El usuario aprobó ubicar la vivienda al publicar, alternar Lista/Mapa con los mismos filtros, tocar precios para abrir fichas, mostrar un mapa en la ficha y permitir ubicación exacta o aproximada. El chat se mantiene para una entrega posterior. Conservar las cuatro pestañas y la UI actual.

## Recorrido

- En Vivienda, campo Ubicación en el mapa. Abrir un selector, mover el mapa y tocar para colocar el punto. Elegir Exacta o Aproximada, previsualizar lo publicado, confirmar o cancelar. Permitir retirar el punto.
- La ubicación es opcional para conservar anuncios y clientes existentes. Sin punto, el anuncio permanece en Lista y se informa cuántos resultados carecen de ubicación en Mapa. Nunca inferir coordenadas de un texto ni inventar ubicaciones para anuncios reales.
- Explorar alterna Lista/Mapa conservando búsqueda, categoría, precio, habitaciones y orden. Solo resultados públicos activos y aprobados se marcan. Mapa inicial centrado en Cuba; marcadores con precio y tarjeta seleccionada con foto, zona y acceso a ficha. Mostrar errores de conexión y reintento.
- Ficha: mapa de la posición publicada con etiqueta Exacta/Aproximada. En aproximada dibujar un área de 800 metros, no prometer la dirección exacta.
- El permiso GPS no es necesario para colocar manualmente la vivienda. Geocodificación automática, navegación por carretera y descarga de mapas offline quedan fuera de esta entrega.

## Contrato de datos y privacidad

`src/domain/geo.ts`: `Coordinates { latitude:number; longitude:number }`, `LocationPrecision = 'exact' | 'approximate'`, `MapLocation extends Coordinates { precision:LocationPrecision }`, `isMapLocation(value:unknown): value is MapLocation`, `normalizeMapLocation(value:MapLocation): MapLocation`, `APPROXIMATE_RADIUS_METERS = 800`.

`Listing` y `ListingDraft`: `mapLocation?: MapLocation`. Campos SQL anulables `latitude`, `longitude`, `location_precision`; los tres presentes o los tres nulos. Coordenadas finitas en latitud -90..90 y longitud -180..180. Para aproximada, normalizar con `floor(value*100 + 0.5)/100` también en SQL; exacta admite seis decimales. La base pública solo conserva la posición de publicación, nunca un segundo punto exacto privado. Rechazar precisiones y pares inválidos.

RPC actual `kh_save_property`: campo adicional `mapLocation` con objeto o null. Omitido por clientes antiguos conserva la ubicación existente en ediciones; null explícito la retira. Incluir ubicación normalizada en el control de reintentos/versiones. Cambiarla devuelve el anuncio a revisión como cualquier edición. Mantener RLS y datos previos. Migración nueva aditiva, sin modificar la migración ya aplicada.

Persistencia local y borradores, mapeo remoto, payload, clonación y edición deben conservar el campo. Las copias locales públicas de aproximadas también se normalizan. El selector puede conservar la elección sin publicar hasta confirmar.

## Mapa y distribución

MapLibre React Native para Android/iOS; MapLibre GL JS para web. Proveedor inicial OpenFreeMap, mapa Positron con estilo KarmaHouse (agua azul suave, superficies neutras, selección azul). Conservar atribuciones legibles. Proveedor intercambiable desde configuración central; no mapas demo en producción. No contratar servicios ni enviar datos de anuncios al proveedor. Las solicitudes cartográficas normales dependen del área visualizada.

`src/components/maps/KarmaMap.types.ts` define `MapMarker { id:string; coordinate:Coordinates; label?:string; precision?:LocationPrecision }` y `KarmaMapProps { markers?: readonly MapMarker[]; center?:Coordinates; zoom?:number; selectedMarkerId?:string; onMarkerPress?:(id:string)=>void; onMapPress?:(coordinate:Coordinates)=>void; interactive?:boolean; style?:StyleProp<ViewStyle>; accessibilityLabel?:string }`. Exportación nombrada `KarmaMap` desde archivos base/native y `.web.tsx`; mismas props en ambos. Si el proveedor falla, informar y permitir reintentar.

Comprobar cobertura desde este equipo sin atribuirlo a una prueba de conectividad desde Cuba. APK de prueba nuevo con misma firma; iOS requiere validación física separada.

## Verificación

Pruebas de normalización y persistencia, rechazos SQL, privacidad de aproximadas, reintentos/versiones y acceso público/moderado/propietario. Migración remota con inventario previo, transacción, checksum y pruebas que revierten sus fixtures. Navegador móvil/escritorio: elegir punto, cancelar, retirar, restaurar borrador, guardar/reabrir, filtros Lista/Mapa, marcador/ficha y error. Exportaciones/TypeScript, APK y revisión de secretos. Informar por separado evidencia web, remota y física.
