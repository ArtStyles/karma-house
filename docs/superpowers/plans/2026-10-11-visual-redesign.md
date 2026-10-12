# Rediseño visual de KarmaHouse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los bocetos revisados: ficha Fotografía protagonista, contacto contextual, navegación Clásica integrada, Favoritos Directa, Publicar Guiada y Mi espacio Lista compacta.

**Architecture:** Reutilizar los proveedores, destinos y componentes existentes. La barra inferior ocupará espacio del navegador; las pantallas tendrán espaciado final normal. La operación de entrada a Publicar se aplica a un anuncio nuevo y respeta un borrador ya recuperado.

**Tech Stack:** Expo 57.0.23, Expo Router 57.0.21, React Native 0.86.3, TypeScript, node:test, navegador local y herramientas Android disponibles.

**Spec:** `docs/visual-design-review.md` y los bocetos que referencia.

## Global Constraints

- «perfecto comienza con las implementaciones» cierra la pausa de diseño; ejecutar de forma continua dentro del alcance aprobado.
- Publicar Guiada fue elegido expresamente en la respuesta del 11 de octubre.
- Favoritos Directa y Mi espacio Lista compacta son las direcciones recomendadas aceptadas al iniciar la implementación; no se incluyen las alternativas ilustradas.
- Conservar cuatro pestañas, etiquetas, contadores y área segura; barra sólida de lado a lado y sin superponer contenido.
- Conservar Claro/Oscuro/Sistema y la franja de cuatro tarjetas de Explorar sin mapa.
- Conservar favoritos optimistas, recuperación de errores, tarjeta retirada y Deshacer.
- Conservar permisos, suspensión, autenticación, aislamiento de borradores por cuenta y autorización del contacto vigente.
- No añadir dependencias, mensajes automáticos, publicación web ni subida de APK.
- Leer la documentación exacta de Expo 57 antes de modificar código; lectura realizada al comenzar.
- Reutilizar el worktree adjunto con rama `codex/visual-redesign`, basado en `ce85678`, que incluye el dominio oficial.

## Review Focus

- Navegación y teclado: una barra oculta por teclado debe recuperar su espacio y no tapar acciones al volver.
- Invitados y cambios de cuenta: la operación elegida debe sobrevivir al acceso, sin trasladar campos privados de otro usuario.
- Borrador existente: un toque en otra operación no debe sobrescribir datos ni convertir silenciosamente un anuncio empezado.
- Contacto no disponible o cambiado: la hoja puede abrir al toque, pero no iniciar conversaciones con una autorización obsoleta.
- Fotos, retirada de favoritos y texto ampliado: conservar controles alcanzables, no mostrar un vacío mientras se carga y no desplazar el corazón bajo el dedo.

## Task 1: Barra integrada y Favoritos Directa

**Files:** Modify `src/app/(tabs)/_layout.tsx`, `src/theme.ts`, `src/screens/FavoritesScreen.tsx`.

**Interfaces:** Consume los contadores existentes de mensajes y notificaciones. Produce `layout.tabContentBottom = 24`, apropiado para contenido dentro de un navegador que reserva la barra.

- [ ] Sustituir geometría absoluta, material flotante y cápsula por barra sólida del navegador, de 64 px más área segura; conservar selección y badge.
- [ ] Sustituir únicamente el vacío confirmado de Favoritos por título, explicación e Ir a Explorar alineados a la izquierda; distinguir indisponibles y carga de cuenta.
- [ ] Ejecutar typecheck y las pruebas existentes de presentación, favoritos optimistas y corazón. Expected: sin errores ni regresiones.
- [ ] Comprobar en navegador las cuatro pestañas, vacío, retirada/Deshacer y anchuras de 320/390 px.
- [ ] Guardar el cambio en un commit de alcance explícito.

## Task 2: Mi espacio Lista compacta

**Files:** Modify `src/screens/ProfileScreen.tsx`.

**Interfaces:** Consume la separación de espacio del navegador de Task 1; conserva hooks y rutas actuales. Usa `UserAvatar` como identidad; no modifica `AccountMenu` en otros usos.

- [ ] Reducir identidad y filas, organizar Actividad/Viviendas/Cuenta, mantener Ahorro de datos antes de la actividad, quitar duplicación de Ajustes y bloque promocional.
- [ ] Conservar todas las condiciones documentadas de inmobiliaria, administración, transferencias, perfil público, invitado, demo y suspensión.
- [ ] Ejecutar typecheck y pruebas existentes de retención de perfil/acceso administrativo. Expected: pasan.
- [ ] Revisar la pantalla y el interruptor en navegador, incluyendo tema oscuro y tamaño estrecho.
- [ ] Guardar el cambio en un commit de alcance explícito.

## Task 3: Publicar Guiada y conservación del contexto

**Files:** Modify `src/screens/PublishScreen.tsx`, `src/components/ListingForm.tsx`, `src/auth/callback.ts`; Create `src/domain/publicationEntry.ts`, `tests/publication-entry.test.ts`.

**Interfaces:** `readPublicationEntry({ operation?: unknown, import?: unknown }): { operation?: ListingOperation; import: boolean }`; `publicationReturnTo(entry): string`; `restorePublicationDraft(raw: string | null, fallback: ListingDraft, operation?: ListingOperation): ListingDraft`. ListingForm recibe `initialOperation?`, `importRequest?`, `active?` y `onOperationChange?`, sin usar initialDraft para simular una edición. active impide abrir la importación desde el formulario oculto.

- [ ] Escribir y ejecutar pruebas de entrada para las cuatro operaciones, rechazo de parámetros inválidos, retorno seguro de autenticación, conservación de operación/datos de un borrador existente y valores iniciales para búsqueda/alquiler. Expected: fallan por la función o comportamiento todavía ausente.
- [ ] Implementar las funciones y ampliar únicamente los retornos `/publish` con parámetros estrictamente enumerados.
- [ ] Crear la lista de operaciones; Pegar anuncio y ayuda son acciones secundarias. Un formulario empezado ofrece Continuar anuncio al volver a opciones.
- [ ] Aplicar initialOperation a un anuncio sin operación después de recuperar el borrador; abrir importación mediante una solicitud local después de hidratar. Mantener formulario montado al cambiar de opción y por cuenta al cambiar de identidad.
- [ ] Ejecutar pruebas nuevas, persistencia/importación/autenticación y typecheck. Expected: pasan.
- [ ] Revisar cuatro entradas, borrador al volver, Pegar anuncio y ayuda en navegador sin enviar correo ni publicar datos reales.
- [ ] Guardar el cambio en un commit de alcance explícito.

## Task 4: Ficha y hoja de contacto contextual

**Files:** Modify `src/screens/DetailScreen.tsx`.

**Interfaces:** Reutiliza `contactSeller(choice?, personal?)` y sus comprobaciones actuales; la acción inicial abre la hoja contextual. No cambia repositorios, permisos ni destinatarios.

- [ ] Priorizar foto, precio, ubicación y características; colocar contactos comerciales después del resumen. Reducir contenedores y texto ornamental sin retirar datos del anuncio.
- [ ] Incorporar el contexto de la vivienda en las hojas demo y real, con cierre accesible y área segura. Abrir antes de esperas de red y mostrar carga/disponibilidad reales dentro de la hoja.
- [ ] Preservar comprobaciones de gestor/inmobiliaria, intentos idempotentes, errores y retorno de acceso; respetar reducción de movimiento.
- [ ] Ejecutar typecheck y pruebas existentes de contacto/autorización, alias de favoritos y fotografía. Expected: pasan.
- [ ] Revisar ficha, contacto demo, regreso y corazón en navegador.
- [ ] Guardar el cambio en un commit de alcance explícito.

## Task 5: Verificación y entrega

**Files:** Modify `docs/visual-design-review.md`, `package.json`, `package-lock.json`, `app.json`; Create `docs/visual-redesign-verification.md`.

**Interfaces:** Consume todos los cambios anteriores; no publica ni modifica servicios externos.

- [ ] Ejecutar `npm run check` completo y exportaciones web/Android. Expected: exit 0; registrar recuentos reales.
- [ ] Preparar la APK local 0.1.24 / Android 25 con la configuración pública y el certificado existentes; verificar antes de entregar. No publicar la release.
- [ ] Revisar la app exportada, tamaños estrechos, apariencia y recorridos sin datos reales de cuenta. Guardar capturas de las pantallas implementadas.
- [ ] Pedir una revisión independiente de toda la rama con contexto limpio; resolver hallazgos relevantes con pruebas de reproducción cuando modifiquen comportamiento.
- [ ] Si hay dispositivo disponible, comprobar la instalación y los recorridos locales; distinguir esta evidencia de permisos y conversaciones reales no probados.
- [ ] Actualizar decisiones, límites y comandos en documentación; entregar cambios locales verificables sin publicación remota.

## Criterio de pruebas

Los ajustes reversibles de disposición y textos se verifican con typecheck, pruebas existentes y observación del producto. No se agregan pruebas que comparen estilos o repliquen su implementación. El cambio funcional de entrada a Publicar sí se desarrolla con pruebas que fallan antes de modificar producción y pasan después.
