# Recorrido público: primera entrega de mejoras

5 de octubre de 2026. Implementación local aislada en `codex/public-journey`, basada en `734adcb`. La publicación asistida continúa en otro worktree. Esta entrega no modifica sus pantallas, datos ni pruebas del teléfono.

## Cambios

- La ficha válida y la no disponible ofrecen «Descargar KarmaHouse», con destino `https://karmahouse.vercel.app/#descargar`. El encabezado apunta a la portada oficial.
- El enlace de descarga abre otra pestaña, identifica ese comportamiento para accesibilidad y deja la ficha abierta. Se eliminó el temporizador que enviaba al visitante fuera de la ficha tras intentar abrir la app.
- La ruta `/p/<id>`, el deep link `karmahouse://property/<id>`, los metadatos, el contenido escapado y las consultas de datos se conservan.
- La URL de captación se separa de las URLs legales en `src/lib/publicSite.ts`.
- El sitio antiguo incluye descarga y un texto compatible con propietarios, gestores y agencias; elimina la promesa «sin intermediarios». Conserva sus documentos legales.

## Verificación realizada

| Comprobación | Resultado |
| --- | --- |
| Base, `npm run check` antes de editar | TypeScript y 362 pruebas pasan |
| Nuevas regresiones antes de corregir | 4 fallos esperados, 18 pruebas pasan |
| `node --experimental-strip-types --test tests/public-listing.test.ts` después | 22 pruebas pasan, 0 fallos |
| `npm run check` final | TypeScript y 365 pruebas pasan, 0 fallos |
| `git diff --check` | Sin errores de espacios |
| Ficha renderizada | 390 × 843 y 1280 × 900, botones legibles y accesibles |
| Ficha no disponible y sitio antiguo | Revisión móvil; sitio antiguo también en escritorio |
| Toque de descarga en la ficha local directa | Abre la portada oficial en otra pestaña; la URL original permanece |
| Privacidad, términos y eliminación de cuenta | Sus tres URLs actuales responden HTTP 200 |
| Revisión independiente de la primera entrega | Sin hallazgos accionables; el revisor reejecutó las 22 pruebas públicas con éxito |

El render usa un anuncio ficticio explícitamente identificado. Las vistas se alojaron en iframes con dimensiones fijas para evitar cambiar el tamaño del navegador compartido con el otro trabajo. El toque de descarga se verificó en la ficha directa, fuera del iframe.

Los registros completos están en `.superpowers/sdd/2026-10-05-design-and-conversion/`, dentro del worktree de esta entrega. Las capturas están en `C:\Users\ACER NITRO\.codex\visualizations\2026\10\05\01a10caa-337d-7232-9afd-ccbd10978a85`, con prefijo `public-journey-`.

## Límites y siguiente paso

Los cambios no están publicados. No se instaló una APK ni se probó la apertura del deep link en Android con/sin app; el otro chat está usando ese teléfono. Tampoco se implementa recuperación automática del anuncio tras instalar.

El checkout aislado contiene el paquete web estático de la base, sin script de build. No se cambió el frontend Vite que está en el checkout principal; TypeScript y la suite de la API verifican los archivos de esta entrega. La publicación posterior debe preservar esa portada actual y comprobar Vercel y GitHub Pages por separado.

Antes de continuar con filtros, errores, autenticación, Mi espacio o editor, revisar el cierre del trabajo «Plan de publicación asistida y traspaso», integrar su resultado revisado en una base compatible y ejecutar una línea base nueva. No reutilizar las 365 pruebas como validación de la combinación futura.

La continuación «Continuar mejoras de KarmaHouse» quedó activa en este chat, con revisión cada quince minutos de esa dependencia y ejecución de las tareas pendientes cuando sea viable. Necesita el equipo encendido y la app abierta, como las [tareas locales programadas](https://learn.chatgpt.com/docs/automations?surface=app). La comprobación sin cambios no debe emitir avisos repetidos.
