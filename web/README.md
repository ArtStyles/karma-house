# Fichas públicas

Proyecto Vercel con Root Directory `web`. `api/p.ts` sirve `/p/<id>` (reescrito en `vercel.json`) con la página pública de un anuncio aprobado y activo; el HTML se genera en el mismo archivo, sin imports, para que Vercel no tenga que resolver extensiones `.ts`; lo prueban `tests/public-listing.test.ts` desde la raíz del repo.

Variables de entorno del proyecto: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (los mismos valores públicos de `.env.local`). Sin comando de build ni dependencias. `public/` contiene la página oficial (`index.html`, `style.css`, imágenes) y se sirve tal cual; su script lee el catálogo público con la clave `anon` (la misma que lleva el APK) para mostrar las últimas viviendas y el recuento.
