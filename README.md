# KarmaHouse

Primera entrega navegable de una aplicación de compraventa de viviendas en Cuba, desarrollada con **React Native y Expo** para Android e iPhone. La vista web sirve para revisar el mismo código desde el navegador.

La interfaz se ha actualizado con tipografía del sistema, superficies agrupadas y navegación flotante. [Referencias profesionales y verificación del rediseño](docs/apple-ui.md).

## Qué puedes probar

- Explorar cuatro viviendas ficticias, buscar sin distinguir tildes y combinar filtros por tipo, precio y habitaciones.
- Abrir una ficha, revisar sus características y guardar favoritos.
- Crear un anuncio local mediante tres pasos, con foto opcional de la galería.
- Editar, pausar, reactivar y marcar como vendido desde Mi espacio → Mis anuncios.
- Recargar la app y conservar favoritos y anuncios en el mismo dispositivo.

**Es una demo local.** No hay usuarios remotos, vendedores reales, mensajes enviados ni anuncios publicados en internet. Cada instalación tiene sus propios datos. Las cuentas, sincronización, mapa, chat y moderación forman parte de la siguiente etapa.

## Arranque

Requiere Node.js 22.13 o superior (LTS recomendado).

```sh
npm ci
npm start
```

El terminal mostrará el QR de Expo. Para probar en un teléfono, usa una versión de Expo Go compatible con SDK 57 y conecta el teléfono a la misma red del equipo. Si se usan módulos fuera de Expo Go o para pruebas de distribución, se necesitará una development build.

```sh
npm run web -- --port 8083
npm run android
```

`npm run android` necesita un dispositivo o emulador Android configurado. `npm run ios` abre un simulador local y requiere macOS/Xcode. Desde Windows puede prepararse una compilación iOS en EAS, con la cuenta y credenciales correspondientes; esta entrega no envía nada a EAS ni a las tiendas.

## Verificación

```sh
npm run check
npx expo install --check
npm run export
```

`npm run check` ejecuta TypeScript y pruebas de búsqueda, validación, codec, hidratación, fallos de escritura y concurrencia. `npm run export` genera los bundles de Android, iOS y web en `dist/`. **Exportar los bundles no genera un APK/IPA ni demuestra ejecución en teléfonos.** Resultados y límites: [docs/verification.md](docs/verification.md).

## Organización

| Carpeta | Responsabilidad |
| --- | --- |
| `src/app` | Navegación de Expo Router |
| `src/screens` | Pantallas del recorrido |
| `src/components` | Tarjetas, formulario y controles compartidos |
| `src/domain` | Reglas puras y catálogo de demostración |
| `src/state` | Persistencia versionada y contexto de React |
| `assets/images` | Fotografías sintéticas y procedencia |
| `tests` | Pruebas de comportamiento independientes de la UI |

Se utiliza Expo SDK 57, React Native 0.86 y React 19.2. El SDK admite Android 7+ e iOS 16.4+, según la [documentación versionada](https://docs.expo.dev/versions/v57.0.0/). Los identificadores `com.karmahouse.app` son la configuración inicial del proyecto y deberán confirmarse antes de registrar la app en tiendas.

## Persistencia e imágenes

AsyncStorage conserva la instantánea `@karma-house/marketplace-v1`. Las escrituras se completan antes de confirmar los cambios y se ejecutan en serie. Si una lectura falla, se reintenta antes de escribir. El codec descarta registros corruptos e identificadores repetidos mostrando un aviso.

Las fotos elegidas se guardan como data URI en web y se copian a Documents en Android/iOS. El límite inicial es 4 MB por foto; la cuota total del navegador puede agotarse y se muestra el error sin confirmar un guardado fallido. No es almacenamiento de producción ni una copia de seguridad. Borrar los datos de la app o desinstalarla puede eliminar estos ejemplos.

Las dos fotografías de demostración se generaron con `image_gen` integrado. Prompts y procedencia: [assets/images/PROVENANCE.md](assets/images/PROVENANCE.md). No representan inmuebles en venta. El icono es un dibujo vectorial original en `assets/karmahouse-icon.svg`; `scripts/render-icon.cjs` rasteriza ese SVG con Sharp y no altera las fotografías.

## Próxima entrega

Autenticación, base de datos y almacenamiento remoto, reglas de acceso por propietario y publicación moderada. La estructura actual permite sustituir el almacenamiento local manteniendo las pantallas y las reglas del catálogo.
