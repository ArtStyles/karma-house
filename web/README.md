# Fichas públicas

Proyecto Vercel con Root Directory `web`. `api/p.ts` sirve `/p/<id>` (reescrito en `vercel.json`) con la página pública de un anuncio aprobado y activo; `lib/render.ts` genera el HTML y lo prueban `tests/public-listing.test.ts` desde la raíz del repo.

Variables de entorno del proyecto: `SUPABASE_URL` y `SUPABASE_ANON_KEY` (los mismos valores públicos de `.env.local`). Sin comando de build ni dependencias.
