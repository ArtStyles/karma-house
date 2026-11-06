# Comisiones de inmobiliaria

Fecha: 15 de octubre de 2026.
Estado: diseño aprobado por el usuario en conversación. No autoriza migraciones de producción ni publicación de cliente; eso requiere su propia aprobación.

Revisión del 15 de octubre, aprobada por el usuario junto con la dirección de diseño «Mediopunto» (`DESIGN.md`): cálculo en centavos con redondeo fijado, total de comisión para administradores, versión y autor de la tabla visibles, qué pasa al salir del equipo y paginación numerada. Las pantallas están dibujadas en el lienzo «KarmaHouse de noche», página Inmobiliarias, fila «Comisiones».

## 1. Objetivo y decisiones confirmadas

Cada inmobiliaria fija dentro de la app cuánto cobra por venta y qué parte le toca al gestor. Cada miembro consulta esas reglas y lo que ganó en sus cierres, sin depender de acuerdos sueltos por chat.

Decisiones del usuario:

1. Por **rango de precio de venta** (USD), el administrador fija el **% de comisión** que cobra la inmobiliaria y el **% de esa comisión para el gestor**.
2. El administrador puede dar a un miembro concreto un **reparto especial**, sin fecha de fin. Sustituye el % del gestor en todos los rangos hasta que el administrador lo quite.
3. Cada miembro ve la tabla, su parte, una calculadora y sus cierres confirmados con lo que le toca y el total.
4. Los pagos al gestor no se registran en la app en v1.
5. El cálculo se **congela al confirmar el cierre**. Cambiar la tabla después no cambia lo ya ganado. Se descartó calcular siempre con la tabla actual, porque reescribe ganancias pasadas.
6. Cada rango aplica su % al **precio completo**, no por tramos. Se acepta el salto entre rangos: si un rango superior tiene menos %, vender justo por encima del límite puede dar menos comisión (50 000 USD al 5 % son 2500 USD; 50 001 USD al 4 % son 2000,04 USD). El editor lo explica con una línea fija.

## 2. Alcance

### Entra en v1

- Tabla de comisiones por inmobiliaria, de 1 a 8 rangos, editable por administradores.
- Repartos especiales por miembro.
- Instantánea de la comisión al confirmar cada cierre de venta.
- Pantalla «Comisiones» para todo miembro y pantalla «Tabla de comisiones» para administradores.

### Queda fuera de v1

Registro de pagos (pendiente/pagado), reparto de una venta entre varios gestores (captador y vendedor), reparto entre inmobiliarias colaboradoras, fecha de fin del reparto especial, comisiones de alquiler o permuta (los cierres de inmobiliaria son solo ventas), recalcular cierres antiguos, avisos push de comisión y exportación. Cada uno se diseña aparte si el uso real lo pide.

## 3. Reglas de producto

### Tabla

- Cada rango tiene `upToUsd` (límite superior inclusivo, entero de 1 a 1 000 000 000), `ratePct` (mayor que 0 y hasta 30) y `managerSharePct` (de 0 a 100). Los porcentajes admiten hasta 2 decimales.
- Los rangos van en orden estrictamente creciente de `upToUsd`. El primero empieza en 0. El último, y solo el último, tiene `upToUsd = null` y se muestra como «Más de X USD».
- Una tabla de un solo rango tiene `upToUsd = null` y vale para cualquier precio.
- Una inmobiliaria sin tabla no tiene reglas: la pantalla lo dice y no hay calculadora.
- Cada guardado reemplaza la tabla completa e incrementa `version`. El evento queda en `agency_events`, como los demás cambios administrativos. No se guarda el historial de tablas: cada instantánea ya conserva los porcentajes que usó.

### Reparto especial

- Es un único `sharePct` (0 a 100) por miembro activo. Sustituye el `managerSharePct` de cualquier rango.
- Lo pone y lo quita un administrador. No vence.
- Si el miembro sale de la inmobiliaria, su reparto especial se borra. Si vuelve a entrar, empieza sin reparto especial.

### Cálculo

- La base es `amount_usd` del cierre confirmado (`kh_private.property_sale_closures`).
- El rango es el primero con `upToUsd >= amount_usd`, o el último si ninguno lo cumple.
- Todo se calcula en **centavos enteros**, para que cliente y servidor den siempre la misma cifra:
  - `amount_cents = amount_usd × 100`.
  - Los porcentajes se pasan a puntos básicos enteros: `rate_bp = ratePct × 100` y `share_bp = share × 100` (admiten 2 decimales, así que son exactos).
  - `commission_cents = redondeo(amount_cents × rate_bp / 10 000)`.
  - `manager_cents = redondeo(commission_cents × share_bp / 10 000)`.
  - `redondeo` es al entero más cercano y los empates (,5) van hacia arriba, igual que `round(numeric)` de Postgres con valores positivos. En el cliente se hace con enteros: `Math.floor((2 × n + d) / (2 × d))` para `n, d > 0`; todos los productos caben en un entero seguro de JavaScript (máximo ≈ 3 × 10¹⁴). Nunca con `toFixed` ni redondeando decimales en coma flotante.
  - `commission_usd = commission_cents / 100` y `manager_usd = manager_cents / 100`.
- `share` es el reparto especial del gestor ejecutor si existe, y si no, el `managerSharePct` del rango.
- Se calcula una sola vez, al insertarse el cierre con `executing_agency_id` no nulo. Usa la tabla de la inmobiliaria ejecutora y el reparto del gestor ejecutor (`executing_manager_id`) en ese momento.
- La instantánea guarda: precio, rango usado, `ratePct`, `share`, origen del reparto (`table` u `override`), comisión, parte del gestor y versión de la tabla.
- Si la inmobiliaria ejecutora no tenía tabla al cerrar, no hay instantánea. El cierre aparece como «Sin tabla al cerrar», con su precio y sin ganancia.
- Cambiar la tabla o los repartos no modifica instantáneas existentes. Las instantáneas no se editan ni se borran.
- Cuando la inmobiliaria de origen y la ejecutora son distintas, la tabla de la ejecutora se aplica al precio completo. Los acuerdos entre inmobiliarias quedan fuera de v1.
- La calculadora del cliente usa la misma fórmula como estimación. La cifra oficial de cada cierre es la del servidor.

### Visibilidad y permisos

- **Leer** la tabla: cualquier miembro activo (gestor, coordinador o administrador), también en modo «Consultar historial» con el módulo desactivado.
- **Repartos especiales**: cada miembro ve el suyo. Un administrador ve todos los de su inmobiliaria.
- **Cierres con comisión**: cada miembro ve los cierres en los que fue gestor ejecutor (`executing_manager_id`), aunque el caso se haya reasignado después. Un administrador ve todos los cierres en los que su inmobiliaria fue ejecutora, con el nombre del gestor.
- **Escribir** (tabla y repartos): solo administradores, con el módulo activo y la inmobiliaria aprobada (`kh_private.agency_actor(..., 'admin')`).
- Las comisiones nunca aparecen en avisos, push, perfil público, catálogo ni en otra inmobiliaria, tampoco en la de origen cuando colabora.
- **Al salir del equipo**, el miembro pierde el acceso a la pantalla y a sus cierres, y su reparto especial se borra. Sus instantáneas no se borran: el administrador las sigue viendo en «Cierres del equipo» con el nombre del gestor. Como los pagos no se registran en v1, la pantalla lo dice siempre (ver Textos) para que nadie entienda «Te toca» como una deuda que KarmaHouse controla.

### Textos

- Pantalla «Comisiones», subtítulo: «Reglas internas de {inmobiliaria}». Aviso fijo: «KarmaHouse no cobra comisión. Esta tabla es un acuerdo entre la inmobiliaria y su equipo.»
- Parte del miembro: la tabla muestra en cada rango la columna «Tu parte». Con reparto especial, esa columna muestra su % en todos los rangos y encima aparece «Tienes un reparto especial: 50 % de la comisión en cualquier rango.»
- Total de cierres: para un gestor o coordinador, «Te toca en total»; para un administrador, dos cifras: «Total para el equipo» (suma de las partes de los gestores) y «Comisión de la inmobiliaria» (suma de las comisiones). Debajo, «N cierres con comisión».
- Aviso de pagos, fijo bajo el total: «Los pagos se acuerdan dentro de la inmobiliaria. KarmaHouse no los registra.»
- Versión de la tabla, bajo la tabla y en el editor: «Versión {n} · actualizada por {nombre} el {fecha}».
- Editor, línea fija: «Cada rango aplica su porcentaje al precio completo. Los cierres ya confirmados no cambian.»
- Calculadora: «Si vendes en [precio] USD» → «Comisión de la inmobiliaria: X USD» y «Tu parte: Y USD».
- Sin tabla, gestor: «Tu inmobiliaria aún no ha definido su tabla de comisiones.» Sin tabla, administrador: botón «Definir tabla».
- Cierre sin instantánea: «Sin tabla al cerrar».
- Español de Cuba, tú, frases cortas. No usar «verificado» ni «garantizado».

## 4. Arquitectura

### Datos

Migración `supabase/migrations/20261015000400_agency_commissions.sql`:

- `kh_private.agency_commission_tables(agency_id pk → agencies, tiers jsonb, version integer, updated_by uuid, updated_at timestamptz)`, con `check (kh_private.commission_tiers_valid(tiers))`.
- `kh_private.agency_commission_overrides(agency_id, user_id, share_pct numeric, set_by uuid, set_at timestamptz, primary key(agency_id, user_id))`.
- `kh_private.sale_closure_commissions(closure_id pk → property_sale_closures, agency_id, manager_id, amount_usd, tier_index, rate_pct, share_pct, share_source, commission_usd, manager_usd, table_version, created_at)`. Un trigger rechaza `update` y `delete`.
- `kh_private.commission_tiers_valid(jsonb)`: aplica las reglas de la tabla de §3. Es la única validación; el RPC de guardado la reutiliza.
- Trigger `after insert on kh_private.property_sale_closures`: si `executing_agency_id` no es nulo y esa inmobiliaria tiene tabla, inserta la instantánea. Así no se redefinen `decide_sale` ni `close_commercial_cycle`.
- Trigger `after update of state on kh_private.agency_memberships`: cuando pasa a `removed`, borra el reparto especial de esa persona en esa inmobiliaria.

### RPC

Siguen el patrón de `kh_update_agency_profile`: `p_actor_id` comprobado contra `auth.uid()`, lista blanca de claves del payload, `expectedVersion`, recibo idempotente con `clientRequestId`, evento en `agency_events`, `revoke all … from public, anon, authenticated` y `grant execute … to authenticated`.

- `public.kh_agency_commissions(p_actor_id, p_agency_id, p_offset, p_limit)`: lector con cualquier rol (`agency_reader`). Devuelve `{agencyId, table: {tiers, version, updatedAt, updatedByName} | null, myShare: {pct} | null (solo el reparto especial propio; sin él, la parte sale de cada rango), overrides: [{userId, displayName, sharePct}] (solo administradores; vacío para el resto), closures: {items, total}, totals: {count, managerUsd, commissionUsd}}`. Cada item lleva `closureId`, `propertyTitle`, `confirmedAt`, `amountUsd`, `managerId`, `managerName` y `commission` (la instantánea o `null`). Límite máximo de 50 por página. `closures.total` cuenta todos los cierres visibles (con y sin instantánea) para numerar las páginas. `totals` suma todas las instantáneas visibles, no solo la página: `count` es el número de cierres con comisión, `managerUsd` la suma de las partes y `commissionUsd` la suma de las comisiones. `updatedByName` es el nombre visible del administrador que guardó la tabla, o `null` si su cuenta ya no existe.
- `public.kh_save_agency_commission_table(p_actor_id, p_agency_id, p_payload {tiers, expectedVersion, clientRequestId})`: solo administradores. `expectedVersion = 0` crea la tabla.
- `public.kh_set_agency_commission_override(p_actor_id, p_agency_id, p_payload {userId, sharePct | null, clientRequestId})`: solo administradores. `null` quita el reparto. El destinatario debe ser miembro activo.
- Errores nuevos: `KH_AGENCY_COMMISSION_INVALID` (tabla o porcentaje inválido). Se reutilizan `KH_AGENCY_VERSION_CONFLICT`, `KH_AGENCY_ROLE_REQUIRED`, `KH_AGENCY_MEMBERSHIP_REQUIRED` y `KH_AGENCY_REQUEST_CONFLICT`.

### Cliente

- `src/agencies/commissions/types.ts`, `domain.ts` y `repository.ts`.
  - `domain.ts` contiene funciones puras: `tierFor`, `effectiveShare`, `computeCommission` y `validateTiers` (las mismas reglas que el servidor, para avisar antes de guardar).
  - `repository.ts` usa `createScopedRpc` y decodifica de forma estricta: rechaza un `agencyId` ajeno o campos mal formados.
- `agencyError` traduce `KH_AGENCY_COMMISSION_INVALID` a «Revisa la tabla: los rangos deben ir de menor a mayor y los porcentajes estar dentro de los límites.»
- Pantallas:
  - `src/screens/AgencyCommissionsScreen.tsx` (ruta `/agency-commissions`): tu parte, la tabla con su versión, la calculadora y los cierres con el total y el aviso de pagos. Paginación numerada de 10 cierres por página (flechas y números, como Mis anuncios y Cartera en `DESIGN.md`), calculada con `closures.total`.
  - `src/screens/AgencyCommissionTableScreen.tsx` (ruta `/agency-commission-table`, solo administradores): editor de rangos y lista de miembros activos con su reparto especial («Poner» / «Quitar»). Los miembros salen de la consulta de equipo que ya existe.
- Rutas: un archivo de una línea por pantalla en `src/app/`, como las demás.
- `AgencyWorkspaceScreen`: enlace «Comisiones» («Reglas y lo que ganas por venta») en Actividad comercial, y «Tabla de comisiones» en Administración.
- Importes con `formatUsd` (`src/negotiations/presentation.ts`).

## 5. Errores y concurrencia

- Conflicto de versión al guardar: se muestra el mensaje existente «Los datos cambiaron…» y se recarga la tabla.
- Reintentos con el mismo `clientRequestId` devuelven el mismo resultado. Si el payload cambia con el mismo id, salta `KH_AGENCY_REQUEST_CONFLICT`.
- Con el módulo desactivado, la lectura sigue disponible y las escrituras se bloquean con el aviso actual.
- Un miembro retirado no tiene acceso ni conserva su reparto especial.

## 6. Pruebas

- `tests/agency-commissions.test.ts` (`node:test`):
  - `tierFor` en el límite exacto y por encima del último rango.
  - Redondeo de `computeCommission` en centavos: empates exactos (,5 de centavo) hacia arriba, porcentajes con 2 decimales, precio máximo (1 000 000 000 USD al 30 %) sin pérdida de precisión, y la misma cifra que `round(numeric)` en los casos de la suite SQL.
  - Prioridad del reparto especial.
  - `validateTiers` rechaza: sin orden, límites repetidos, `null` que no está al final, porcentajes fuera de rango, más de 8 rangos y tabla vacía.
  - El repositorio rechaza un `agencyId` ajeno y payloads mal formados.
- `supabase/tests/agency_commissions.sql`:
  - El administrador guarda y un gestor no puede. Conflicto de versión. Tabla inválida.
  - Reparto especial: poner, quitar, solo a miembros activos y borrado al salir.
  - Confirmar una venta crea la instantánea con el rango y el reparto correctos. Cambiar la tabla después no la altera. Sin tabla no hay instantánea.
  - Un gestor ve solo sus cierres, también tras reasignar el caso. El administrador los ve todos. Otra inmobiliaria y quien no es miembro reciben error.
  - `closures.total`, `totals.commissionUsd` y `table.updatedByName` devuelven lo esperado. Tras salir del equipo, el antiguo gestor recibe error y el administrador sigue viendo sus cierres.
  - Avisos y push no contienen datos de comisión.
- `scripts/apply-reviewed-migration.mjs` recibe un prefijo nuevo de ids sintéticos para la suite.
- Prueba manual en la app web: el administrador define la tabla y un reparto especial, y un gestor ve la calculadora y sus cierres.

## 7. Entrega

- La migración se aplica en producción solo con aprobación explícita del usuario, mediante `scripts/apply-reviewed-migration.mjs`.
- Cliente: app web (app.karmahouse.site) y APK de Android 0.1.30.
- La landing y los hechos de `BRAND.md` no cambian. Las comisiones son internas de cada inmobiliaria; KarmaHouse sigue sin cobrar comisión.
