# KarmaHouse Pro

Fecha: 14 de octubre de 2026.
Estado: diseño aprobado por el usuario en conversación, parte por parte. No autoriza migraciones de producción ni publicación de cliente; eso requiere su propia aprobación.

## 1. Objetivo y decisiones confirmadas

KarmaHouse Pro es un servicio pagado para quien publica mucho: gestores, corredores independientes e inmobiliarias. KarmaHouse todavía no puede cobrar dentro de la app; el propietario de KarmaHouse acuerda el pago con cada cliente fuera de la app y después activa Pro.

Decisiones del usuario:

1. Pro se activa **por cuenta**: una cuenta personal o una inmobiliaria. No está reservado a empresas, porque gran parte del mercado lo mueven personas naturales que gestionan viviendas.
2. Lo gratuito no cambia: publicar, buscar y conversar siguen gratis, sin límites nuevos y sin comisión. Pro solo añade.
3. KarmaHouse es dueña de la plataforma y de su audiencia, no del negocio de las inmobiliarias. Las negociaciones de cada agencia siguen privadas.
4. Pro v1 incluye el sello Pro y **Subir anuncio**. El estudio de mercado empieza como **informe manual** que el propietario envía en PDF; no hay panel de mercado dentro de la app en v1.
5. Pro se activa de dos maneras: **directamente desde administración** o **por código**. Al crear un código, la cuenta o inmobiliaria destinataria es opcional: con destinatario, solo ese puede canjearlo; sin destinatario, lo canjea la primera cuenta que lo escriba.
6. El historial de precios empieza a guardarse en v1 porque el dato no se puede recuperar después.

## 2. Alcance

### Entra en v1

- Estado Pro por cuenta personal o inmobiliaria, con fecha de vencimiento.
- Sello «Pro» en tarjeta, detalle, perfil público y presentación de inmobiliaria.
- Subir anuncio: una vez cada 7 días por anuncio.
- Activación directa, revocación, códigos atados o libres, canje en la app.
- Pantalla `/pro` y administración de Pro para el propietario.
- Historial de precios y disponibilidad en servidor, invisible en la app.
- Script de informe de mercado de solo lectura.

### Queda fuera de v1

Más fotos por anuncio, revisión prioritaria, estadísticas por anuncio, vistas, demanda por zona y oportunidades dentro de la app, avisos de vencimiento de Pro, cobro dentro de la app, municipios exactos por límites geográficos. Cada uno se diseña por separado cuando el informe manual demuestre demanda.

## 3. Reglas de producto

### Estado Pro

- Una cuenta es Pro mientras `pro_until > now()`. No hay trabajo programado: el vencimiento se evalúa al consultar.
- Una inmobiliaria solo cuenta como Pro mientras su estado es `approved`. Si se suspende, su Pro deja de tener efecto; la fecha se conserva y vuelve a contar si se reactiva antes de vencer.
- Activar Pro sobre una cuenta que ya es Pro suma los días: `pro_until = greatest(now(), pro_until) + días`.
- Al vencer o revocarse, desaparecen el sello y Subir anuncio. Los anuncios, su orden ya ganado y sus datos no se tocan.

### Qué cubre cada Pro

- **Pro personal:** los anuncios cuyo `owner_id` es esa cuenta y que no tienen origen de inmobiliaria (`kh_private.agency_property_origins`).
- **Pro de inmobiliaria:** los anuncios cuyo `origin_agency_id` es esa inmobiliaria. Puede subirlos cualquier miembro activo con acceso a esa cartera (mínimo `manager`).
- Un gestor con Pro personal que trabaja en una inmobiliaria sin Pro solo sube sus anuncios personales.

### Sello

- Píldora pequeña con borde azul y texto «Pro». Texto accesible: «Cuenta Pro de KarmaHouse».
- Nunca usa «verificado», «garantizado» ni el check verde de verificación. Pro es un servicio pagado, no una revisión de identidad ni de titularidad.
- No se llama «Destacado»: ese nombre pertenece al nivel de confianza `featured`.
- La tarjeta y el detalle lo leen del propio anuncio (`is_pro`). El perfil público lo pide con una consulta aparte, `kh_pro_badge`, porque los APK actuales rechazan cualquier clave nueva en `kh_public_profile`.
- La página web pública de la inmobiliaria no muestra el sello en v1: es otra aplicación (`PUBLIC_PAGES_URL`) y queda para después. Sus anuncios sí lo muestran en la app.

### Subir anuncio

- Requisitos: anuncio `approved` y `active`, no suspendido, cubierto por un Pro vigente, y `coalesce(bumped_at, created_at) <= now() - interval '7 days'`.
- Efecto: `bumped_at = now()`. El anuncio aparece arriba en «Más recientes» para todos los clientes, incluidos los APK antiguos, porque el orden se resuelve en servidor.
- La etiqueta «Nueva» sigue calculándose con `created_at`: un anuncio subido no finge ser nuevo.
- Subir no dispara alertas de búsqueda, avisos de publicación ni cambios de versión.

### Códigos

- Formato visible `KH-XXXX-XXXX-XXXX`: 12 caracteres del alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sin 0, O, 1 ni I), unos 60 bits de azar generados en servidor.
- Al canjear se normaliza: mayúsculas, sin espacios ni guiones, sin el prefijo `KH`.
- Se guarda solo el SHA-256 del código normalizado. El texto se muestra al propietario **una vez**, al crearlo.
- Un solo uso. Sin canjear, caduca a los 30 días de su creación.
- Días por código: el propietario elige 30, 90 o 365; el servidor acepta de 1 a 365.
- Nota privada obligatoria (de 3 a 500 caracteres), por ejemplo cliente, zona y forma de pago. Solo la ve el propietario.
- Destinatario opcional: una cuenta personal o una inmobiliaria, nunca ambas.
- Canje para inmobiliaria: solo su administrador (`admin`) y solo si la inmobiliaria está `approved`.
- Un código anulado no se puede canjear. Solo se anulan códigos sin usar.

## 4. Datos

Todo nuevo vive en `kh_private`, sin acceso directo desde `anon` ni `authenticated`, como el módulo de inmobiliarias.

| Tabla | Contenido |
|---|---|
| `kh_private.pro_status` | `user_id` o `agency_id` (exactamente uno, cada uno único), `pro_until`, `updated_at`. |
| `kh_private.pro_codes` | `id`, `code_hash` único, `days`, `note`, `bound_user_id`, `bound_agency_id` (como mucho uno), `created_by`, `created_at`, `expires_at`, `cancelled_at`, `redeemed_by`, `redeemed_user_id` o `redeemed_agency_id`, `redeemed_at`. |
| `kh_private.pro_code_attempts` | `user_id`, `attempted_at` de cada canje fallido. |
| `kh_private.property_price_history` | `property_id` (cascade al borrar), `price`, `operation`, `rent_period`, `availability`, `recorded_at`. |

Cambios en tablas existentes:

- `public.properties.bumped_at timestamptz`, nula hasta la primera subida. «Más recientes» ordena por `coalesce(bumped_at, created_at)` con un índice de expresión. Así no hace falta rellenar filas ni añadir disparadores, y las altas que fijan `created_at` (pruebas, traspasos) conservan su orden.
- `kh_private.admin_audit` registra crear, anular y canjear código, dar Pro y quitar Pro, con `target_id` igual al código, la cuenta o la inmobiliaria, **sin nota** (`reason` nula): el Historial lo lee cualquier administrador, y las notas solo las ve el propietario. Las notas viven en `pro_codes.note` (al crear), `pro_codes.cancel_note` (al anular) y `pro_status.note` (última activación o retirada directa), que solo leen las funciones de propietario.

El historial de precios se llena con un disparador `after insert or update of price, operation, rent_period, availability` que solo inserta si algún valor cambió. Al migrar se copia el estado actual de cada anuncio como primer punto.

## 5. Funciones de servidor

Todas son `security definer` con `search_path=''`, como las existentes. Ninguna confía en datos de Pro enviados por el cliente.

| Función | Quién | Resultado |
|---|---|---|
| `kh_pro_status()` | Cuenta autenticada | Su `pro_until` personal y, con su función, el de cada inmobiliaria aprobada donde es miembro activo (un gestor también sube anuncios de la agencia). |
| `kh_redeem_pro_code(p_code, p_agency_id default null)` | Cuenta autenticada | Estado Pro resultante del destinatario. |
| `kh_bump_property(p_property_id)` | Dueño o miembro con acceso | Nuevo `bumped_at` y la fecha de la próxima subida posible. |
| `kh_admin_create_pro_code(p_days, p_note, p_user_id, p_agency_id)` | Propietario | Código en texto, una vez, más su `id` y `expires_at`. |
| `kh_admin_list_pro_codes(p_offset)` | Propietario | Página de los 30 códigos más recientes, cada uno con su estado: sin usar, canjeado, caducado o anulado. |
| `kh_admin_cancel_pro_code(p_code_id, p_note)` | Propietario | Código anulado. |
| `kh_admin_grant_pro(p_days, p_note, p_user_id, p_agency_id)` | Propietario | Nuevo `pro_until`. |
| `kh_admin_revoke_pro(p_note, p_user_id, p_agency_id)` | Propietario | `pro_until = now()`. |
| `kh_admin_list_pro_accounts(p_offset)` | Propietario | Página de 30 cuentas Pro, ordenadas por `pro_until` ascendente, con su última nota. |

Como el resto de RPC del proyecto, todas reciben `p_actor_id` como primer parámetro y fallan con `KH_ACCOUNT_CHANGED` si no coincide con la sesión. Hay dos funciones públicas más, sin sesión: `kh_pro_badge(p_user_id)` para el perfil y el campo calculado `kh_is_pro(public.properties)`.

La autoridad de propietario usa `kh_private.admin_actor(p_actor_id, true)`, la misma que gestiona cuentas.

### Reglas de canje

0. Los fallos de canje **devuelven** `{ "ok": false, "error": "<código>" }` en lugar de lanzar una excepción: una excepción desharía también el registro del intento fallido y el límite no contaría nunca.
1. Si el usuario acumula 5 canjes fallidos en la última hora, falla con `KH_PRO_CODE_RATE` sin consultar el código.
2. El código se bloquea con `for update` para que dos canjes simultáneos no lo usen dos veces.
3. Si el mismo usuario ya canjeó ese código para el mismo destinatario, devuelve éxito con el estado actual. Esto cubre reintentos tras un corte de red.
4. Código inexistente, caducado, anulado, ya usado por otro, o atado a otro destinatario: falla con `KH_PRO_CODE_INVALID` y registra un intento fallido. El mensaje es el mismo en todos los casos para no revelar qué códigos existen.
5. Código atado a una inmobiliaria: el destinatario es esa inmobiliaria aunque `p_agency_id` sea nulo, y quien canjea debe ser su administrador.

### Errores visibles

| Código | Mensaje en la app |
|---|---|
| `KH_PRO_CODE_INVALID` | «Código no válido o ya usado. Revisa que esté bien escrito o escríbenos.» |
| `KH_PRO_CODE_RATE` | «Demasiados intentos. Vuelve a probar dentro de una hora.» |
| `KH_PRO_REQUIRED` | «Subir anuncio es parte de KarmaHouse Pro.» |
| `KH_BUMP_TOO_SOON` | «Podrás subir este anuncio el <fecha>.» |
| `KH_BUMP_NOT_ELIGIBLE` | «Solo se pueden subir anuncios publicados y activos.» |
| `KH_PRO_INVALID` | Solo administración: días fuera de 1-365, nota fuera de 3-500 o destinatario inválido. |
| `KH_PRO_CODE_STATE` | Solo administración: el código ya se usó o ya estaba anulado. |
| `KH_PRO_NOT_ACTIVE` | Solo administración: esa cuenta no tiene Pro activo que quitar. |

## 6. Catálogo y disparadores existentes

- `kh_search_properties` ordena `recent` por `(coalesce(bumped_at, created_at) desc, id desc)` y construye el cursor con ese mismo valor. El cliente trata el cursor como texto opaco del servidor (`next_cursor`), así que los APK actuales siguen paginando.
- Las filas de `kh_search_properties` llevan `is_pro`. El detalle y Mis anuncios leen `properties` por PostgREST con el campo calculado `is_pro:kh_is_pro` (función `public.kh_is_pro(public.properties)`). Los APK actuales no piden ese campo y no notan el cambio; `mapRemoteListing` ignora claves que no conoce.
- **Orden de despliegue:** primero la migración, después el cliente. Un cliente nuevo que pida `kh_is_pro` contra un servidor sin la migración no podría leer ningún anuncio.
- **Disparadores.** Ocho disparadores de `public.properties` se ejecutan al actualizar. Revisados uno por uno:

| Disparador | Con una subida | Cambio |
|---|---|---|
| `kh_account_property_write` | Exige cuenta activa | Ninguno: es lo deseado |
| `kh_admin_property_audit` | Solo actúa si cambian moderación o disponibilidad | Ninguno |
| `kh_owner_publication_alerts` | Volvería a alertar si la cuenta oficial sube un anuncio suyo | Sale antes si solo cambió `bumped_at` |
| `kh_bind_property_media` | Revalida fotos; con permiso de inmobiliaria podría rechazar fotos antiguas | Sale antes si solo cambió `bumped_at` |
| `kh_assisted_consent_write` | Rechaza si el consentimiento asistido se retiró | Ninguno: no se sube un anuncio sin consentimiento |
| `kh_guard_listing_manager` | Solo actúa si cambia `owner_id` | Ninguno |
| `kh_agency_property_guard` | Exige un permiso de escritura en anuncios de inmobiliaria | `kh_bump_property` crea el permiso `bump` y lo borra después |
| `kh_property_alias_guard` | Rechaza alias fusionados | `kh_bump_property` rechaza los alias antes de escribir |

`kh_properties_normalize_map` solo reacciona a columnas de ubicación y el nuevo disparador de historial solo a precio, operación, periodo y disponibilidad.

## 7. Pantallas

La app de Expo y la versión de navegador comparten estas pantallas.

### `/pro`

- Enlazada desde Perfil y desde Ajustes de cuenta.
- Estado: «Pro activo hasta el 14 de noviembre de 2026» o «No tienes Pro». Si administra inmobiliarias, muestra también el estado de cada una.
- Qué incluye: sello Pro y Subir anuncio. El informe de mercado no se promete en la app.
- Campo «Canjear código». Si la cuenta administra alguna inmobiliaria aprobada, elige «Mi cuenta» o la inmobiliaria; si el código está atado, el servidor decide.
- «¿Quieres Pro? Escríbenos» abre un correo a `ASSISTED_PUBLICATION_EMAIL` con asunto «Quiero KarmaHouse Pro».
- Sin precio y sin pago en la app.

### Mis anuncios y cartera de inmobiliaria

- Anuncio cubierto por Pro: botón «Subir anuncio», o el texto «Podrás subirlo el <fecha>».
- Sin Pro: no se muestra nada ni se ofrece Pro desde la lista.

### Sello

Tarjeta (`PropertyCard`), detalle junto al título y perfil público. Pill completa, según BRAND.md, distinta del `AgencyVerifiedBadge`.

### Administración del propietario

Nueva entrada «KarmaHouse Pro» en el grupo «Cuenta oficial» de `AdministrationScreen`, visible solo con `auth.isOwner`.

- **Crear código:** días (30, 90 o 365), nota obligatoria, destinatario opcional. El destinatario se elige desde las pantallas que ya existen: el botón «KarmaHouse Pro» de cada cuenta en Cuentas y de cada inmobiliaria aprobada en Inmobiliarias abre esta pantalla con ese destinatario. El resultado muestra el código seleccionable, un botón «Compartir» (hoja nativa de compartir, que incluye copiar y WhatsApp, sin dependencias nuevas) y el aviso «No se podrá volver a ver».
- **Códigos:** los 30 más recientes con su estado; canjeado muestra para quién y cuándo; anular un código sin usar pide nota.
- **Cuentas Pro:** ordenadas por vencimiento; dar Pro directo y quitar Pro, siempre con nota.
- Cada acción aparece en Historial, que ya lee `admin_audit`.

## 8. Informe de mercado manual

`scripts/market-report.mjs`, ejecutado por el propietario:

- Conecta con `createDatabaseClient()` de `scripts/cloud-db.mjs` y trabaja dentro de una transacción `read only`.
- Escribe un HTML con la marca de KarmaHouse en `artifacts/market-reports/AAAA-MM/<provincia>.html` (la carpeta `artifacts/` ya está fuera de Git). El propietario lo guarda como PDF desde el navegador.
- Fuente: solo anuncios `approved`, sin anuncios de demostración ni suspendidos.
- Zona: provincia y `location` normalizada (minúsculas, sin acentos, espacios simplificados). No se afirma que sea un municipio.
- Precios: mediana y rango del precio pedido por operación y tipo; USD/m² solo con superficie informada. Venta y alquiler van separados; el alquiler se separa además por `rent_period`. Las permutas cuentan como volumen, no como precio.
- Movimiento: anuncios nuevos del mes, anuncios que pasaron a vendido y días hasta la venta, calculados con `property_price_history`.
- Demanda: anuncios «busco» y búsquedas guardadas activas, contadas por personas distintas, por provincia y operación.
- Umbrales: un grupo de precios aparece solo con 10 anuncios comparables o más, y uno de demanda solo con 5 personas o más. Por debajo, «Aún hay pocos datos».
- Textos fijos: «Precio pedido, no precio de venta», fecha del corte y número de anuncios que sostiene cada cifra. Nunca «valor de mercado» ni «tasación».

## 9. Privacidad y marca

- Ninguna estadística usa mensajes, ofertas, visitas ni negociaciones.
- Antes del primer informe que use búsquedas guardadas, la política de privacidad publicada debe explicar que se usan sumadas y sin identificar a nadie.
- La landing y BRAND.md no mencionan Pro hasta que esté funcionando en producción. Entonces se añade a BRAND.md como dato confirmado, sin precios inventados ni promesas de resultados.
- Se mantiene en todos los textos: «Publicar, buscar y conversar es gratis».

## 10. Pruebas y evidencia

- `supabase/tests/pro.sql`: código libre y atado (cuenta e inmobiliaria), caducado, anulado, usado por otro, reintento del mismo usuario, carrera entre dos canjes, límite de 5 fallos por hora, suma de días, revocación, inmobiliaria suspendida, permisos de propietario y de no propietario, ausencia de acceso directo a las tablas.
- Subir anuncio: sin Pro, antes de 7 días, anuncio pausado o pendiente, miembro de otra inmobiliaria, orden de `recent` y cursor, «Nueva» sin cambios, ninguna alerta nueva, `version` y `updated_at` intactos, cada disparador de `properties` probado.
- Historial: alta, cambio de precio, cambio sin precio distinto (no inserta), paso a vendido.
- `tests/`: normalización del código, mensajes de error y cálculo de la fecha de la próxima subida.
- Informe: ejecución con datos sintéticos que cubra los umbrales, sin escrituras en la base.

## 11. Despliegue

1. Migración y pruebas SQL locales.
2. Aplicar en producción con un script `scripts/apply-pro.mjs`, siguiendo el patrón de las demás migraciones, solo con aprobación expresa del usuario. El servidor es compatible con los APK actuales.
3. Publicar el cliente con `/pro`, el sello y Subir anuncio en el siguiente APK y en app.karmahouse.site.
4. Primer código real de prueba creado, canjeado y revocado por el propietario; evidencia en `docs/karmahouse-pro-verification.md`.
