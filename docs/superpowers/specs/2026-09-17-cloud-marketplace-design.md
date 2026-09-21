# KarmaHouse: cuentas y catálogo compartido

Alcance autorizado: conectar el proyecto Supabase indicado por el usuario para la primera entrega con cuentas, anuncios compartidos, fotografías, favoritos y revisión administrativa. Se conserva la UI actual. Chat, mapas y publicación en tiendas quedan para entregas posteriores.

## Recorridos

- Explorar sin cuenta; registro con nombre público, correo y contraseña, inicio/cierre de sesión y recuperación de contraseña.
- Una cuenta puede comprar y vender. Publicar/favoritos requieren sesión. Al cerrar sesión desaparecen los datos privados de pantalla.
- Crear y editar vivienda con hasta seis fotos comprimidas. Conservar borrador local por cuenta y solicitud estable para evitar duplicar un anuncio al reintentar.
- Los anuncios nuevos o modificados se envían a revisión. Disponibilidad (active/paused/sold) y moderación (draft/pending/approved/rejected) son independientes.
- Solo approved + active son públicos. Propietarios ven los suyos, incluidos pendientes/rechazados. Administradores aprueban o rechazan con motivo y control de versión.
- Ningún ejemplo local se importa automáticamente. Fallos remotos se muestran y no se reemplazan por una falsa confirmación local.

## Contratos

Supabase público: `profiles`, `properties`, `favorites`, `kh_admins`. Storage privado: `property-photos`. Identidad administrativa solo se asigna fuera del cliente y a la cuenta indicada por el usuario.

`properties`: id uuid, owner_id uuid, client_request_id text, title/location/province/type/description text, price/area numeric, bedrooms/bathrooms integer, amenities text[], photo_paths text[], availability text, moderation text, review_note text, created_at/updated_at timestamptz, version integer. Unique(owner_id,client_request_id).

Mutaciones de anuncios mediante RPC: `kh_save_property(p_payload jsonb)` retorna propiedad (payload camelCase igual ListingDraft más id opcional, expectedVersion, photoPaths y moderation draft/pending); `kh_set_property_status(p_id uuid,p_status text)` retorna void; `kh_submit_property(p_id uuid)` retorna void; `kh_review_property(p_id uuid,p_decision text,p_note text,p_expected_version integer)` retorna void. `kh_is_admin()` bool. Favoritos por insert/delete con RLS. Paths foto: userId/clientRequestId/random.jpg; servidor valida propiedad de todas las referencias. Ediciones vuelven a pendiente. Solo propietario modifica su anuncio; solo administrador revisa.

Extender Listing conservando compatibilidad demo: owner remote adicional, ownerId?, moderationStatus?, reviewNote?, version?, clientRequestId?, photos?: {uri:string,storagePath?:string}[]. ListingDraft añade photos? y clientRequestId?. photoUri mantiene compatibilidad de una foto local. Catálogo excluye moderación distinta de approved cuando se define.

Auth: `src/lib/supabase.ts` exporta `supabase` nullable y `isSupabaseConfigured`; `AuthProvider/useAuth` expone ready,user,session,displayName,isAdmin,error,signIn,signUp,signOut,requestPasswordReset,updatePassword,refreshProfile. `signUp(name,email,password)` retorna {needsConfirmation:boolean}. `user` es User de Supabase. Proveedor envuelve MarketplaceProvider. Sin configuración se mantiene demo explícita.

Marketplace conserva API actual y añade mode demo/cloud, ownListings, refresh(), isOwnListing(listing), submitForReview(id), moderationQueue, loadModerationQueue(), reviewListing(id,decision,note,version). `saveListing(draft,id?,moderation='pending')` retorna id. Datos privados se limpian al cambiar sesión; resultados tardíos no se pueden mezclar entre cuentas. `ListingDraft.clientRequestId` estable durante reintentos.

## Seguridad y comprobaciones

Solo URL y publishable key bajo EXPO_PUBLIC. Secret/database password en infra/.env.local ignorado por Git, exclusivamente para herramientas locales. No registrar secretos. Inspeccionar esquema antes de aplicar migración aditiva. Políticas de tablas y fotos probadas desde cuentas independientes y peticiones directas. Crear usuarios sintéticos de prueba sin enviar correo a personas.

Criterio: vendedor guarda anuncio/fotos, comprador no ve pendiente, administrador aprueba, comprador ve anuncio y fotos; no puede editarlo ni sus fotos; edición vuelve a revisión; favoritos sobreviven otra sesión y cerrar sesión limpia datos privados. Verificar errores/reintentos, tests, bundles tres plataformas y navegador. Pruebas físicas y correo entregado se informan separadamente.
