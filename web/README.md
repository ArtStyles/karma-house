# Fichas públicas

Proyecto Vercel con Root Directory `web`. `api/p.ts` sirve `/p/<id>` (reescrito en `vercel.json`) con la página pública de un anuncio aprobado y activo; el HTML se genera en el mismo archivo, sin imports, para que Vercel no tenga que resolver extensiones `.ts`; lo prueban `tests/public-listing.test.ts` desde la raíz del repo.

Variables de entorno del proyecto: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (los mismos valores públicos de `.env.local`). Sin comando de build ni dependencias. `public/` contiene la página oficial (`index.html`, `style.css`, imágenes) y se sirve tal cual. La portada no consulta el catálogo ni muestra anuncios o cifras de actividad inventadas. Las fotografías y la conversación de ejemplo están identificadas como ilustrativas.

La publicación del APK está pausada: la portada muestra el estado «Próxima versión en preparación» y enlaza a la lista pública de versiones, sin ofrecer una descarga inexistente. Al publicar una entrega, actualizar conjuntamente el bloque Android y la respuesta «¿Ya puedo descargar la app?» con la disponibilidad real y el enlace al APK firmado. La página no incorpora aún el observatorio inmobiliario propuesto.

El rediseño de octubre de 2026 toma como referencias la organización por intención de Idealista, Rightmove y Zillow, manteniendo una portada de presentación porque el catálogo se usa en la app. Conserva las rutas `/p/<id>` y los enlaces legales. El contenido, la navegación móvil y las preguntas funcionan con HTML nativo; `site.js` solo cierra el menú al elegir una sección o pulsar Escape. El CSS contempla tema oscuro, foco visible y movimiento reducido.
