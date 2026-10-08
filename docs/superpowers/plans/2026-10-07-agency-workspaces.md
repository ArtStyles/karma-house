# Espacios de inmobiliarias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar inmobiliarias aprobadas por el propietario de KarmaHouse, verificación separada con check verde y publicación directa, equipos con permisos acumulados y comercialización compartida de viviendas con negociaciones privadas y cierre global.

**Architecture:** Mantener un UUID de vivienda y separar agencia, membresía, origen, autorización y expediente. Las personas conservan su identidad de Auth; el servidor valida cada acción en contexto empresarial. El cierre y la terminación de procesos son transaccionales; la entrega de avisos ocurre después.

**Tech Stack:** Expo `~57.0.23`, React `19.2.3`, React Native `0.86.3`, TypeScript `~6.0.3`, Supabase Auth/Postgres/Storage, `node:test`, `pg` y Expo Router existentes. Consultar la [documentación exacta de SDK 57](https://docs.expo.dev/versions/v57.0.0/) antes de escribir código.

**Spec:** [Diseño aprobado para planificación](../specs/2026-10-07-agency-workspaces-design.md).

## Global Constraints

- Una misma vivienda puede estar autorizada para varias inmobiliarias simultáneamente.
- Las agencias comparten la identidad y disponibilidad de la vivienda; las negociaciones de cada agencia permanecen privadas.
- Si la publicación procede de una inmobiliaria, esa inmobiliaria confirma el cierre.
- Una inmobiliaria debe esperar la confirmación del propietario de KarmaHouse antes de operar.
- La aprobación para operar no concede verificación. Solo el propietario protegido de KarmaHouse concede o retira el sello, por solicitud de la agencia o asignación directa.
- Solo una agencia aprobada y verificada puede publicar directamente fichas de su origen; las demás requieren revisión individual. La verificación personal o de una colaboradora no transfiere ese privilegio.
- El coordinador puede hacer todo lo que hace un gestor. El administrador puede hacer todo lo que hacen el gestor y el coordinador.
- Administrar una inmobiliaria no concede permisos de administración global de KarmaHouse.
- Conservar UUID, enlaces, fotos, favoritos, participantes históricos y recorridos personales. Los chats personales no se convierten en chats de equipo.
- No calcular ni pagar comisiones, integrar WhatsApp, transferir autoridad de origen o reabrir ventas en esta entrega.
- El cierre empresarial de esta entrega corresponde a viviendas en venta (`operation='sale'`). Alquiler, permuta y Busco personales conservan sus recorridos; no se les aplica un cierre empresarial de venta.
- Este plan autoriza preparación documental. La implementación, despliegue y activación no se ejecutan al escribirlo.

## Review Focus

1. Cambiar cuenta o agencia con una respuesta pendiente: descartar respuestas y borradores del contexto anterior; prueba en fase 1, tarea 4.
2. Eliminar la cuenta que cargó fotografías: conservar cartera y archivos de viviendas empresariales; prueba en fase 2, tarea 7.
3. Contactar mediante enlace de gestor retirado: mostrar las agencias vigentes sin asignar al antiguo gestor; prueba en fase 3, tarea 8.
4. Publicar una copia para adquirir autoridad de cierre: rechazar atribución y conservar procedencia; prueba en fase 2, tarea 6.
5. Cierre concurrente con cita, mensaje o cancelación: un resultado coherente y ningún bloqueo mutuo; prueba en fase 4, tarea 13.
6. Solicitud de verificación, metadatos o cuenta personal verificada intentan eludir revisión: denegar; tareas 1–3 y 5. Concesión/retirada simultánea a un envío: resolver por bloqueo; tarea 13.

## Entregas y dependencias

| Orden | Plan ejecutable | Entregable comprobable |
|---|---|---|
| 1 | [Registro, aprobación, verificación y equipo](2026-10-07-agency-foundation.md) | Solicitud desde el registro, aprobación y verificación independientes, check verde, funciones acumuladas y aislamiento de contexto |
| 2 | [Cartera, origen y autorizaciones](2026-10-07-agency-shared-properties.md) | Una ficha pública por vivienda, publicación según verificación, agencias autorizadas y conservación de cartera al retirar cuentas |
| 3 | [Expedientes, chats y agenda](2026-10-07-agency-commercial-flows.md) | Interesados privados, asignación, visitas, ofertas, reserva y seguimiento |
| 4 | [Cierre y activación](2026-10-07-agency-closure-release.md) | Venta única, terminación global, avisos y validación integral |

Las tareas se numeran de 1 a 16. Las fases se prueban individualmente en un entorno desechable y se integran en ese orden. El registro público y las operaciones empresariales permanecen desactivados hasta validar la entrega completa.

## Decisiones técnicas comunes

**Estado y nombres:** `AgencyState = 'pending' | 'needs_changes' | 'approved' | 'rejected' | 'suspended'`; `AgencyRole = 'manager' | 'coordinator' | 'admin'`; `MandateState = 'active' | 'withdrawn'`; `DealStage = 'inquiry' | 'visit_proposed' | 'visit_confirmed' | 'visited' | 'offer' | 'won' | 'lost'`. Un estado de seguimiento no cambia disponibilidad de vivienda.

**Verificación de agencia:** independiente de `AgencyState`. `AgencySummary` incorpora `verified:boolean` efectivo, calculado por servidor como agencia aprobada con concesión vigente, y `verificationVersion:number`. `AgencyVerificationRequestState = 'pending'|'needs_changes'|'approved'|'rejected'|'cancelled'`. `AgencyVerificationRequestInput { message:string; evidenceReferences:string[] }`: explicación de 20–1000 caracteres y hasta cinco referencias privadas de hasta 500 caracteres. Una solicitud abierta por agencia; solo administrador activo la envía o corrige. Solo el propietario protegido concede, solicita correcciones, rechaza o revoca, también con concesión directa sin solicitud. La aprobación inicial deja `verified=false`; ni metadatos, logo, membresía ni `verified_users` personal pueden asignarlo. Auditar cada transición y conservar versiones y motivos; no copiar evidencias o revisores al perfil público.

**Política de publicación:** el servidor calcula `requires_review` o `direct` con la agencia de origen bloqueada y sus permisos vigentes. Enviar una ficha válida no verificada produce moderación `pending`; enviar una verificada produce `approved` sin invocar una revisión como si la agencia fuera moderador. Borradores permanecen sin publicar; el cliente no decide moderación. Los cambios comunes necesitan autorización del origen y siguen su política, incluso si los propone una colaboradora verificada. Una retirada expresa de KarmaHouse exige revisión para rehabilitar la ficha, aunque su agencia esté verificada. Revocar verificación no retira automáticamente fichas aprobadas ni termina negociaciones; siguientes envíos requieren revisión. Suspender revoca el sello y cancela solicitudes abiertas, sin restaurarlo al recuperar la agencia. Revalidar verificación en cada escritura: una caché o petición reintentada no habilita publicaciones nuevas después de la revocación.

Definir `AgencyPublicationPolicy = 'requires_review'|'direct'`. Conceder verificación no publica automáticamente el backlog: cada borrador o envío pendiente necesita un envío explícito nuevo o revisión individual. Un reintento idempotente devuelve el resultado anterior con su estado vigente, sin ejecutar de nuevo la transición de publicación. Las retiradas explícitas se conservan en `kh_private.agency_property_moderation_holds` hasta revisión de KarmaHouse; corregir o reenviar una ficha no borra ese bloqueo.

**Sello público:** `AgencyVerifiedBadge` muestra check circular verde y etiqueta accesible «Inmobiliaria verificada por KarmaHouse» únicamente cuando el servidor informa `verified=true` para esa agencia. Reutilizar `Icon` y `colors.green`; no crear una imagen. Mostrarlo junto al nombre en el espacio y presentaciones públicas de agencias, ficha de vivienda y selección de contacto. Mantener aparte la verificación personal existente. Reconsultar al recuperar foco y tras decisiones; invalidar cachés públicas afectadas al cambiar estado o verificación.

**Contexto:** crear `AgencyRequestContext extends MessagingRequestContext { agencyId: string; generation: number }`. Toda petición empresarial transporta `p_actor_id`, `p_agency_id` y un UUID `clientRequestId` cuando escribe. El servidor contrasta actor con `auth.uid()` y no confía en funciones declaradas por el cliente. Respuestas paginadas: `{ items: T[]; hasMore: boolean }`, tamaño 30, límite de servidor 50.

**Tipos de frontera:** definir en tarea 1 `Page<T> { items:T[]; hasMore:boolean }` y `AgencyRequestContext`. En los contratos abreviados, todos los IDs, referencias y fechas ISO son `string`; `version` y `seq` son enteros positivos; `amountUsd` es `number` con la nulabilidad indicada. Las respuestas decodifican tipos y comprueban agencia/actor; los payloads desconocidos no se aceptan por cast. `AgencyApplicationInput` contiene exactamente `tradeName`, `responsibleFullName`, `businessPhone`, `province`, `municipality`, `serviceAreas:string[]`, `description`, `officeAddress:string|null`, `publishOfficeAddress:boolean` y `evidenceReferences:string[]`. Logo y credenciales se gestionan fuera de ese payload.

**Concurrencia:** ordenar bloqueos de cuenta existentes, agencias por UUID, viviendas por UUID, conversaciones, propuestas y destinatarios de avisos. Definir helpers comunes en la fase 1 y ampliar en las siguientes. Toda ruta antigua que alcance datos empresariales usa estos helpers o rechaza la acción. Los recibos identifican actor, agencia, operación y petición; el mismo UUID con contenido distinto produce conflicto. Repetir una operación confirmada recupera el recibo, sin repetir efectos, y exige permiso actual para acceder al resultado.

**Datos públicos y privados:** los datos empresariales se guardan en tablas de `kh_private` con RPC que devuelven campos permitidos. No agregar registros privados al selector público `PROPERTY_COLUMNS`. Logo: JPEG hasta 1 MiB en bucket privado `agency-assets`, ruta `<agencyId>/logos/<assetId>.jpg`; solo el logo aprobado y referenciado se firma para lectura pública. Evidencia: hasta cinco referencias privadas de hasta 500 caracteres; no se descargan ni interpretan automáticamente.

**Validación de registro:** nombre comercial 2–120 caracteres; nombre completo privado 2–160; teléfono comercial normalizado `+` y 8–15 dígitos; provincia de la lista existente; municipio 2–80; entre 1 y 20 zonas distintas de 2–80 caracteres; descripción 20–1000; dirección opcional hasta 200, pública solo con `publishOfficeAddress=true`. Mantener nombre público, correo y contraseña del formulario personal como identidad de acceso; el nombre completo privado no se copia al perfil público.

**Registro sin sesión confirmada:** al registrarse con intención empresarial, Auth recibe `registration_intent='agency'` y un bloque `agency_application` validado. Un trigger de alta copia solo los campos permitidos a una solicitud privada `pending`, nunca funciones o estado recibido. El correo debe estar confirmado para enviarla a revisión y para aprobarla. Actualizar metadatos de una cuenta personal existente no crea una agencia ni una membresía. La solicitud sobrevive al enlace de confirmación en otro dispositivo.

**Custodia de cartera:** para una nueva vivienda empresarial, `properties.owner_id` referencia la cuenta protegida existente de `kh_private.platform_owner`; es custodia técnica, no contacto comercial ni origen. La agencia de origen y el actor publicador se registran aparte. Fotos cargadas por miembros se vinculan a esa ficha mediante `property_media_assets` y permisos estrechos. Eliminar al publicador no elimina la casa o sus fotos. Las fichas personales conservan su tratamiento actual; una publicación asistida solo obtiene origen empresarial mediante vínculo comprobado y auditado con su colaborador, sin reconstruirlo desde nombres.

**Compatibilidad:** las RPC antiguas de edición, estado, transferencia y contacto no operan viviendas empresariales basándose solo en `owner_id`. Para el contacto empresarial requieren actualizar cliente; los recorridos personales conservan su comportamiento. Los nuevos endpoints empresariales tienen decodificadores propios y no amplían silenciosamente el acceso de repositorios personales.

**Estados históricos:** mantener los valores existentes de negociación. Guardar resultado comercial y motivo de terminación en relaciones empresariales; los clientes personales anteriores no reciben nuevos estados que no puedan interpretar. Un duplicado consolidado queda pausado y protegido contra reactivación; sus chats conservan el UUID histórico y sus permisos. El cierre resuelve todo el grupo de alias.

**Interesados fuera de la app:** permitir expediente privado con contacto externo y visitas/ofertas registradas por el equipo, sin fabricar una cuenta o un chat de comprador. Una aceptación externa identifica quién la registró y su canal/referencia; no se presenta como aceptación digital del comprador. Al cancelar una cita por venta, crear una tarea para que el gestor comunique el cambio por su canal habitual, porque el módulo no envía mensajes de WhatsApp. Las tareas de comunicación de cancelación se distinguen de los seguimientos comerciales que el cierre termina.

## Mapa de archivos y contratos entre fases

| Unidad | Archivos | Responsabilidad |
|---|---|---|
| Agencia y equipo | `src/agencies/{types,domain,repository,controller}.ts`, `AgencyProvider.tsx`, `useAgencyWorkspace.ts` | Tipos, validación, transporte, aislamiento y selección de agencia |
| Registro y revisión | `src/components/agencies/{AgencyRegistrationFields,AgencyVerifiedBadge}.tsx`, `src/screens/{AgencyApplication,AgencyReviews,AgencyVerification,AgencyWorkspace,AgencyTeam}Screen.tsx` | Formularios, aprobación, solicitudes de verificación, sello, espacio y miembros |
| Cartera | `src/agencies/properties/{types,repository,domain}.ts`, `src/screens/Agency{Portfolio,Property,DuplicateReview}Screen.tsx` | Procedencia, permisos sobre ficha común, correcciones y duplicados |
| Expediente | `src/agencies/deals/{types,repository,domain}.ts`, `src/screens/Agency{Deals,Deal}Screen.tsx` | Interesados, asignación, tareas e historial empresarial |
| Conversaciones | `src/agencies/messaging/{types,repository}.ts`, `src/screens/AgencyConversationScreen.tsx` | Chats explícitamente empresariales y participantes efectivos |
| Agenda | `src/agencies/scheduling/{types,repository,domain}.ts`, `src/screens/AgencyAgendaScreen.tsx` | Horarios, resultados, coordinación y reservas |
| Cierre | `src/agencies/closures/{types,repository,domain}.ts`, `src/screens/AgencyClosuresScreen.tsx` | Solicitudes, confirmación y recibo de cierre |
| Servidor | Migraciones `20261007000100` a `20261007001000`; SQL tests `agency_*.sql` | Autoridad, aislamiento, historia, integridad y compatibilidad |
| Validación técnica | `scripts/local-sql/{run-agency-suites,verify-agency-upgrade,verify-agency-concurrency}.mjs` | Base local desechable, regresión histórica y carreras reales |

Los nombres entre llaves enumeran archivos concretos. Cada plan de fase indica dónde se crean y qué firmas producen. `AgencySummary`, `AgencyMembership`, `AgencyProperty`, `AgencyDeal`, `AgencyConversation`, `AgencyVisit` y `SaleClosure` se definen en la tarea que los produce y se consumen sin variantes en fases posteriores.

## Cobertura del diseño

| Requisito | Tareas responsables |
|---|---|
| Registro diferenciado, privacidad de datos y aprobación por el propietario | 1–3 |
| Solicitud y asignación de verificación, check verde y revisión de anuncios según origen | 1–6, 8, 12–15 |
| Funciones acumuladas y membresías en varias agencias | 1, 2, 4, 8, 10 |
| Una ficha por vivienda, origen estable y agencias autorizadas | 5, 6 |
| Fotos, favoritos, enlaces y eliminación de cuentas | 5–7 |
| Expedientes privados y chats empresariales sin acceso a chats personales | 4, 8 |
| Agenda común, propuestas, visita realizada y reserva explícita | 9 |
| Seguimientos, interesados externos y reasignación | 8–10 |
| Confirmación por origen y cierre de procesos de todas las agencias | 11 |
| Avisos privados, recordatorios, clientes anteriores y fallo de push | 12 |
| Concurrencia, reintentos e inventarios históricos | 13 |
| Render móvil/escritorio, persistencia y límites de prueba física | 14, 16 |
| Operación, revisión final, desactivación y salida controlada | 15, 16 |

La tarea 13 debe comprobar también retiradas/suspensiones concurrentes y concesión/revocación de verificación durante un envío. Los guards de tareas 7–12 se revisan sobre la definición SQL más reciente de cada RPC; no basta con proteger una versión antigua que otra migración reemplace.

## Entorno, integración y salida

- [ ] Al comenzar la ejecución, usar `superpowers:using-git-worktrees`, consultar adjuntos y reutilizar un worktree adecuado o crear uno desde el HEAD inspeccionado. Rama por defecto `codex/agency-workspaces`; preservar cambios ajenos. Copiar los documentos de diseño y plan, que todavía son archivos locales, al checkout de ejecución antes de empezar.
- [ ] Registrar resultados iniciales de `npm run check`, sin confundir fallos previos con regresiones de esta entrega.
- [ ] Crear el runner local de la tarea 1. Exigir `KH_LOCAL_DATABASE_URL`, host `localhost`, `127.0.0.1` o `[::1]`, y base cuyo nombre empiece por `kh_agency_test`. Rechazar otras conexiones y no leer `.env` como alternativa. Ampliar `scripts/local-sql/setup.mjs` con ese prefijo y `--through <timestamp>` conservando el rechazo de bases existentes; reutilizar `bootstrap.sql`, que simula únicamente Auth/Storage y transportes externos, y ejecuta SQL de negocio real. Crear una base diferente por grupo de pruebas; no usar la base de desarrollo del usuario.
- [ ] Inicializar la base de suites con `node scripts/local-sql/setup.mjs --through 20261005000300`. El runner aplica las nuevas migraciones necesarias dentro de la transacción de cada suite y las revierte con sus fixtures. Inicializar por separado la base de concurrencia con `node scripts/local-sql/setup.mjs --through 20261007001000` y la de upgrade con el baseline histórico anterior. La simulación SQL no acredita entrega de correo, Storage real o push físico.
- [ ] Completar y revisar las cuatro fases antes de cambiar `kh_private.agency_settings.enabled`, cuyo valor inicial es `false`.
- [ ] Integrar únicamente archivos de esta función, con commits por tarea. Preparar documentación de operación y activación y evidencias locales.
- [ ] El despliegue remoto, publicación del APK y activación de la función quedan como pasos finales separados de la implementación local. Habilitar el módulo, aprobar una agencia y verificarla son acciones diferentes; ninguna concede las otras automáticamente.

Este documento es el índice del plan completo. Los cuatro planes enlazados contienen los pasos ejecutables; no comenzar una fase sin leer su predecesora y el diseño.
