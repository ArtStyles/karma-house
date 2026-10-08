# Espacios de inmobiliarias y cartera compartida

Fecha: 7 de octubre de 2026.
Estado: implementación local autorizada mediante «comienza con el plan» el 7 de octubre de 2026; despliegue y activación pendientes.

## 1. Objetivo y decisiones confirmadas

Una vivienda debe poder comercializarse por varias inmobiliarias y varios gestores sin generar un anuncio público por cada participante. Cada inmobiliaria necesita conocer las visitas, ofertas, responsables y próximos pasos de su actividad. Una venta confirmada debe terminar los procesos pendientes vinculados a la vivienda y cerrar sus chats comerciales, conservando el historial.

El usuario ha confirmado estas reglas:

1. Una misma vivienda puede estar autorizada para varias inmobiliarias simultáneamente.
2. Las agencias comparten la identidad y disponibilidad de la vivienda; las negociaciones de cada agencia permanecen privadas.
3. Si la publicación procede de una inmobiliaria, esa inmobiliaria confirma el cierre. Una agencia colaboradora que consiga vender comunica el resultado a la agencia de origen.
4. El registro permite elegir cuenta personal o inmobiliaria. El registro de inmobiliaria exige datos adicionales.
5. Una inmobiliaria debe esperar la confirmación del propietario de KarmaHouse antes de operar.
6. El coordinador puede hacer todo lo que hace un gestor. El administrador puede hacer todo lo que hacen el gestor y el coordinador.
7. Solo las inmobiliarias verificadas por KarmaHouse pueden publicar sin aprobación individual de sus anuncios. La agencia puede solicitar la verificación; únicamente KarmaHouse la concede, y se muestra mediante un check verde.

Las secciones siguientes concretan la propuesta de producto y sus límites para revisión. No constituyen una aprobación de implementación.

## 2. Arquitectura recomendada

Separar cuatro conceptos: persona autenticada, inmobiliaria, vivienda común y autorización de comercialización. Los gestores y responsables usan cuentas propias; no comparten una contraseña empresarial.

La vivienda conserva su UUID, enlaces, favoritos y referencias históricas. Una autorización enlaza esa vivienda con una inmobiliaria y determina si su equipo puede comercializarla. La membresía enlaza una persona con una inmobiliaria y su función. Pertenecer a una agencia no concede permisos sobre viviendas sin autorización vigente.

Cada agencia dispone de un expediente comercial privado por vivienda, con interesados, conversaciones, propuestas, visitas y tareas. El expediente usa la misma identidad de vivienda que el catálogo común.

El modelo distingue la agencia de origen, la agencia que consigue la operación, el gestor que la realiza y el actor que confirma el cierre. Pueden ser distintos y deben quedar registrados sin atribuciones automáticas basadas en enlaces o en el primer contacto.

La cuenta inmobiliaria es una opción del registro y una experiencia de producto. Internamente existe una persona responsable autenticada y un espacio empresarial con miembros y permisos.

## 3. Registro y aprobación de inmobiliarias

### Datos propuestos

| Dato | Requisito | Tratamiento |
|---|---|---|
| Nombre comercial | Obligatorio | Público tras la aprobación |
| Nombre completo del responsable | Obligatorio | Privado |
| Correo de acceso | Obligatorio y confirmado | Privado |
| Contraseña | Obligatoria | Gestionada por Auth; nunca visible a la administración |
| Teléfono comercial | Obligatorio | Público, con aviso claro en el registro |
| Provincia y municipio de referencia | Obligatorios | Públicos |
| Zonas donde trabaja | Al menos una | Públicas |
| Descripción de servicios | Obligatoria | Pública |
| Logo | Opcional | Público |
| Dirección de oficina | Opcional | La agencia decide si la publica |
| Referencias o documentación de representación | Opcionales al solicitar; pueden requerirse en revisión | Privadas |

No se presume que toda inmobiliaria tenga oficina física, una forma empresarial concreta o una documentación legal específica. Una revisión de identidad y representación no acredita la titularidad legal de sus viviendas.

### Recorrido

1. Elegir Cuenta personal o Cuenta inmobiliaria en Crear cuenta.
2. La cuenta personal conserva su formulario actual. La inmobiliaria completa datos del responsable y de la agencia.
3. Confirmar el correo de acceso y enviar la solicitud completa.
4. Mostrar Pendiente de aprobación y permitir consultar o corregir la solicitud propia.
5. El propietario protegido de KarmaHouse revisa y aprueba, solicita correcciones o rechaza con un motivo visible al solicitante.
6. La aprobación habilita el espacio y convierte al responsable en administrador de esa agencia.

Antes de la aprobación no se habilitan publicaciones empresariales, invitaciones operativas, autorizaciones de cartera, visitas, ofertas ni cierres en nombre de la agencia. Las funciones personales que correspondan a la cuenta siguen sujetas a sus reglas actuales.

Estados de agencia propuestos: pendiente, necesita correcciones, aprobada, rechazada y suspendida. Editar datos o confirmar el correo no aprueba la agencia. La aprobación y suspensión pertenecen al propietario de KarmaHouse, no al administrador de la propia agencia ni, por defecto, a cualquier moderador.

La revisión registra actor, fecha y motivo. Los datos de registro enviados por el cliente no pueden conceder privilegios de plataforma. Elegir Inmobiliaria o recibir aprobación para operar no concede la verificación.

### Verificación de agencia y publicación directa

La aprobación inicial y la verificación son autorizaciones independientes:

| Situación | Puede operar | Publicación de viviendas | Check verde |
|---|---|---|---|
| Pendiente, rechazada o suspendida | No | No puede publicar | No |
| Aprobada sin verificar | Sí | Requiere aprobación individual de KarmaHouse | No |
| Aprobada con solicitud de verificación pendiente | Sí | Sigue requiriendo aprobación individual | No |
| Aprobada y verificada | Sí | Puede publicar directamente | Sí |

Desde Mi inmobiliaria, su administrador puede solicitar la verificación con explicación y referencias privadas. KarmaHouse revisa y concede, solicita correcciones o rechaza con motivo. Solo el propietario protegido de KarmaHouse puede concederla, también por asignación directa sin solicitud previa, o retirarla. Ningún miembro de la agencia puede verificarse por su cuenta. Una solicitud pendiente o rechazada no bloquea la operativa ya aprobada ni habilita publicación directa.

La concesión y retirada registran actor, fecha, motivo y versión. La verificación pertenece a la inmobiliaria, no a las cuentas personales de sus miembros; la verificación personal existente no permite publicar anuncios empresariales directamente. El sello usa el check circular verde junto al nombre de esa agencia y el texto accesible «Inmobiliaria verificada por KarmaHouse», en el espacio, en su presentación pública y al elegir una agencia para contactar. Una vivienda con varias agencias identifica por separado cuáles están verificadas; no muestra el sello como si certificara la vivienda o a todas sus agencias.

La publicación directa se valida en servidor al enviar una ficha completa y autorizada, según la verificación vigente de su agencia de origen. Un borrador sigue siendo borrador; conceder el sello no publica en masa los borradores o envíos pendientes anteriores. Se conservan las comprobaciones de material, autorización y duplicados; la agencia verificada no obtiene permisos de moderación global ni puede levantar una retirada impuesta por KarmaHouse. Si una agencia colaboradora propone cambios comunes, necesita la aprobación del responsable de origen y después se aplica la política de publicación de ese origen. La verificación de una colaboradora no permite saltar la revisión de una ficha cuyo origen no esté verificado.

Retirar la verificación elimina el sello y hace que los siguientes envíos y cambios sujetos a publicación requieran revisión individual. Las fichas ya aprobadas permanecen publicadas salvo retirada expresa; sus procesos comerciales no se cancelan por perder el sello. Suspender la agencia revoca además su verificación, cancela solicitudes pendientes y aplica los efectos operativos de suspensión. Recuperar la agencia no restituye automáticamente la verificación. Estas reglas no cambian quién confirma una venta.

## 4. Equipo y permisos acumulados

| Acción | Gestor | Coordinador | Administrador |
|---|---|---|---|
| Consultar cartera autorizada de su agencia | Sí | Sí | Sí |
| Atender interesados asignados y compartir fichas | Sí | Sí | Sí |
| Proponer visitas y ofertas en sus expedientes | Sí | Sí | Sí |
| Registrar seguimiento y comunicar un posible cierre | Sí | Sí | Sí |
| Coordinar agenda y asignar seguimientos de la agencia | No | Sí | Sí |
| Supervisar el expediente comercial de la agencia | Solo los casos asignados | Sí | Sí |
| Invitar, retirar miembros y cambiar funciones | No | No | Sí |
| Administrar perfil y autorizaciones empresariales | No | No | Sí |
| Aprobar cambios comunes cuando la agencia sea responsable | No | No | Sí |
| Confirmar venta de una vivienda cuyo origen sea su agencia | No | No | Sí |
| Solicitar verificación de su inmobiliaria | No | No | Sí |
| Aprobar su agencia en KarmaHouse | No | No | No |
| Conceder o retirar la verificación de una agencia | No | No | No |

El administrador y el coordinador también pueden recibir interesados y trabajar como gestores. Sus permisos de coordinación no los obligan a usar una identidad diferente para atender un caso.

Las invitaciones requieren aceptación de la cuenta destinataria. Las funciones pertenecen a una membresía, no globalmente a la persona. Una persona puede tener membresías en varias agencias; el espacio activo determina en nombre de cuál actúa.

Retirar a un miembro revoca inmediatamente su acceso empresarial, conserva la autoría de sus eventos y lleva sus tareas activas a la cola de reasignación de la agencia. No traslada ni expone sus chats personales.

## 5. Vivienda común, origen y prevención de duplicados

El catálogo muestra una vivienda una sola vez. La ficha puede indicar las agencias aprobadas y autorizadas para atenderla. Un enlace compartido por un gestor mantiene ese mismo UUID y dirige el contacto a su agencia y a ese gestor si ambos siguen autorizados.

El origen no se deduce del usuario que tenga permiso de edición en ese momento. Se registra expresamente la agencia que aportó la publicación y el actor que la cargó. Si KarmaHouse publica por encargo de una agencia, la agencia consta como origen y la cuenta oficial como actor de publicación.

Si la publicación procede de una cuenta personal, se conserva su responsabilidad de cierre según el flujo personal; una inmobiliaria colaboradora comunica el resultado. Cambiar esta autoridad exige un traspaso explícito y registrado, fuera de la primera entrega empresarial. Un gestor que abandona una agencia no se lleva su cartera ni su autoridad de cierre.

La agencia de origen administra las autorizaciones de colaboración y puede confirmar los cambios comunes. Incorporarse a una ficha o publicar una copia no concede esa autoridad. Si hay versiones duplicadas con procedencias contradictorias, se requiere revisión de KarmaHouse y evidencia de origen; la fecha de carga no decide por sí sola.

Prevención propuesta:

- Referencia interna única por agencia para identificar viviendas de su cartera.
- Buscar coincidencias antes de crear una ficha usando referencias, características y ubicación; los datos privados de dirección o propietario no se muestran a agencias sin permiso.
- Mostrar avisos de posible duplicado y permitir solicitar autorización sobre una ficha existente.
- No unir automáticamente por similitud de texto, fotos, teléfono o dirección.
- Consolidar duplicados existentes mediante revisión, preservando referencias de origen, conversaciones y enlaces anteriores. Una unión no mezcla expedientes privados.

Se propone mantener un precio público autorizado común, coherente con el catálogo actual. Las ofertas, límites de negociación, condiciones y comisiones de cada agencia permanecen privados. Una agencia colaboradora propone cambios comunes; no sobrescribe unilateralmente el precio o las características.

## 6. Expediente, agenda y ofertas

Desde Mi espacio se accede a Mi inmobiliaria. Si la persona pertenece a varias, elige el espacio activo. Secciones propuestas: Cartera, Agenda, Seguimientos, Equipo y Cierres. Una ficha de cartera abre el expediente privado de esa agencia.

Cada interesado tiene un seguimiento separado: consulta, visita propuesta, visita confirmada, visita realizada, oferta y resultado. El estado de un interesado no sustituye a la disponibilidad global de la casa. Varias visitas y negociaciones pueden coexistir mientras la vivienda esté disponible.

El expediente permite interesados con cuenta y contactos externos registrados por el equipo. Un contacto externo no recibe una cuenta ficticia ni un chat dentro de KarmaHouse. Sus aceptaciones se registran como confirmaciones manuales con actor y referencia. Si se cancela su cita por venta, se crea una tarea de comunicación para el gestor; no se afirma que un aviso dentro de la app le haya llegado por WhatsApp.

Las consultas recibidas desde un enlace van al gestor indicado cuando siga autorizado. Las consultas generales a una agencia entran en su cola de asignación; los coordinadores y administradores pueden atenderlas o asignarlas. La asignación conserva un responsable visible y un historial de cambios.

La agenda completa de una agencia muestra vivienda, interesado autorizado, responsable, horario y estado. Las agencias colaboradoras solo acceden a la ocupación horaria necesaria para coordinar el acceso, sin nombres de compradores, chats, importes ni notas ajenas. La reserva de un horario se valida sobre la vivienda común para detectar conflictos entre agencias. Las visitas conjuntas requieren una elección explícita.

Cada visita puede registrar resultado: realizada, interesado ausente, cancelada o reprogramada. Una hora pasada no acredita que se realizó la visita. Los acuerdos históricos sin resultado registrado no se convierten automáticamente en visitas realizadas.

El importe publicado, la propuesta del comprador y el acuerdo de negociación se distinguen. Aceptar una oferta no registra una venta ni crea una reserva global. La reserva es una acción explícita del administrador de la agencia de origen, con fecha de vencimiento y bloqueo de nuevas citas mientras dure. Su vencimiento libera disponibilidad, sin revivir propuestas que ya terminaron.

No se incorporan cobros, contratos ni garantías legales de reserva en esta entrega.

## 7. Cierre global y conservación del historial

### Solicitud y confirmación

Un gestor, coordinador o administrador puede comunicar un resultado de venta en el expediente de su agencia. Cuando esa agencia no es la de origen, solicita confirmación a la agencia de origen. El envío comparte únicamente los datos necesarios para acreditar y registrar el cierre; no concede acceso a todo el expediente de la agencia ejecutora.

Solo un administrador activo de la agencia de origen, con agencia aprobada y autoridad vigente sobre la ficha, confirma la venta. El cierre identifica vivienda, agencia ejecutora, gestor ejecutor, precio final, fecha, petición y actor confirmante. La agencia confirmante valida esos datos; no se deducen de un chat ni de un enlace promocional.

### Efectos de la confirmación

El servidor ejecuta conjuntamente estas acciones:

1. Registrar un único cierre confirmado para el ciclo comercial de la vivienda.
2. Cambiar disponibilidad a vendida y retirar la vivienda de la oferta disponible.
3. Cancelar las citas futuras y las propuestas de visita todavía vigentes.
4. Terminar las negociaciones competidoras abiertas con motivo Vivienda vendida. Conservar la propuesta asociada al cierre y su resultado histórico.
5. Resolver las tareas de seguimiento comercial pendientes de todas las agencias.
6. Cerrar los chats comerciales vinculados a la vivienda, conservando la lectura según sus permisos originales.
7. Invalidar recordatorios pendientes y registrar los avisos que corresponde entregar.

Las visitas realizadas, propuestas rechazadas, canceladas o caducadas y acuerdos históricos mantienen sus hechos y fechas. Los resultados de terminación por venta se añaden de forma explícita; no se reescribe toda negociación pasada como cancelada.

Las otras agencias ven que la vivienda se vendió y que sus procesos terminaron. No reciben automáticamente comprador, precio final, comisión o mensajes de la agencia ejecutora.

El estado, el registro de cierre, la terminación de procesos y los avisos por entregar se confirman en una transacción de servidor. La entrega de push se procesa después con reintentos: un fallo de entrega no deshace la venta. El sistema comprueba disponibilidad al enviar recordatorios para evitar avisos obsoletos.

Dos cierres simultáneos no pueden producir dos ventas. Las nuevas visitas, mensajes y ofertas comparten la validación de disponibilidad y el orden de bloqueo necesario para que una operación concurrente no se acepte después del cierre. Los reintentos de una misma confirmación devuelven su resultado previo sin duplicar eventos.

El cierre cubre conversaciones de KarmaHouse. Los chats externos de WhatsApp no se cierran mediante este módulo.

Una corrección de venta debe quedar auditada. Reabrir la comercialización requiere un nuevo ciclo explícito, sin reactivar chats, visitas ni ofertas del ciclo cerrado. Ese recorrido de reapertura se deja fuera de la primera entrega.

## 8. Privacidad y compatibilidad con la aplicación actual

Contratos observados en la exploración:

- `src/screens/AuthScreen.tsx` y `src/auth/AuthProvider.tsx`: registro personal con nombre público, correo y contraseña.
- `supabase/migrations/20260917000100_cloud_marketplace.sql`: autoridad técnica actual en `properties.owner_id`; no representa por sí sola titularidad inmobiliaria.
- `src/negotiations/types.ts` y `20260920000300_negotiations.sql`: visitas y ofertas estructuradas, con actor, versión e idempotencia.
- `src/messaging/types.ts` y `20261005000300_transfer_chat_context.sql`: participantes históricos del chat y permisos dependientes de un responsable actual.
- `20261005000100_assisted_listing_records.sql`: procedencia de publicaciones asistidas y referencias a colaboradores de tipo inmobiliaria.
- `20261005000300_transfer_chat_context.sql`: cambiar disponibilidad no incorpora todavía el cierre coordinado empresarial.

La propuesta requiere ampliar estos contratos; añadir una etiqueta Inmobiliaria al perfil no basta. No se ejecuta una migración ni se afirma activación del backend durante esta revisión.

Los chats personales existentes siguen siendo privados entre sus participantes. Los nuevos chats comerciales se crean con contexto explícito de agencia y muestran al comprador qué inmobiliaria lo atiende. Los permisos empresariales aplican a ese contexto desde su creación; no convierten retroactivamente chats personales en información de equipo.

El administrador y coordinador ven actividad comercial de su agencia según el contexto empresarial; los gestores acceden a los casos asignados. Ser administrador de una agencia no concede privilegios de moderación global, acceso a expedientes de otras agencias ni propiedad de KarmaHouse.

Los clientes anteriores conservan sus recorridos personales. No pueden conceder membresías, crear agencias aprobadas, asignar verificación ni cambiar una ficha empresarial mediante sus antiguas rutas de edición o de estado. Las autorizaciones se validan en servidor, incluyendo aprobación de agencia, membresía, permiso sobre vivienda, contexto de conversación, disponibilidad y verificación vigente cuando se publique directamente. Una interfaz oculta no constituye control de permisos.

Los datos en caché o sin conexión no autorizan una visita, oferta, cambio de cartera o cierre. El servidor confirma las escrituras y el cliente vuelve a consultar el estado vigente al reconectar.

## 9. Alcance propuesto y orden de entrega

1. Registro diferenciado, aprobación inicial, solicitud y concesión de verificación por el propietario de KarmaHouse, espacio empresarial y membresías con permisos acumulados.
2. Vivienda común, publicación según verificación de origen, autorizaciones entre agencias e incorporación de gestores sin duplicar anuncios.
3. Expedientes y conversaciones empresariales, agenda compartida con privacidad, propuestas y coordinación.
4. Solicitud de venta, confirmación por la agencia de origen, terminación global de procesos y avisos.

Las fases dependen unas de otras. No habilitar agencias en producción antes de completar permisos y validación de su flujo. Cada fase necesita su plan y comprobaciones antes de activarse.

Quedan fuera de la primera entrega: cálculo o pago automático de comisiones, contratos y cobros, integración de WhatsApp, uniones automáticas por reconocimiento de imágenes, CRM externo, análisis avanzado de rendimiento, traspaso de autoridad de origen y reapertura de ventas. El cierre registra ejecutores para permitir acordar comisiones después, sin inventar porcentajes o reglas entre agencias.

## 10. Criterios de aceptación

- Una agencia pendiente, rechazada o suspendida no puede operar empresarialmente por interfaz ni llamando directamente al servidor.
- Solo el propietario protegido de KarmaHouse puede aprobarla; un solicitante no puede aprobarse cambiando metadatos.
- Aprobar una agencia no la verifica. Una solicitud de verificación pendiente o rechazada conserva la obligación de moderación individual.
- Solo el propietario protegido puede conceder o retirar la verificación, a petición de la agencia o por asignación directa, con registro de actor, fecha y motivo.
- Una agencia activa verificada publica directamente una ficha válida de su origen; una aprobada sin verificar queda pendiente de revisión. Un borrador no se publica automáticamente.
- El check verde identifica únicamente a la agencia verificada; los miembros, las agencias colaboradoras y la vivienda no heredan ese sello ni el privilegio.
- La retirada de verificación cambia los siguientes envíos, elimina el sello y conserva publicaciones anteriores aprobadas salvo retirada expresa; la suspensión no permite restaurar el sello automáticamente.
- Un envío concurrente con una concesión o retirada de verificación respeta el estado del servidor bajo bloqueo; repetir la petición no crea otro anuncio ni otra alerta.
- El administrador puede hacer todas las acciones del coordinador y del gestor; el coordinador puede hacer todas las del gestor. Estos permisos respetan siempre los límites de su agencia.
- Una persona con membresías en varias agencias actúa bajo un contexto explícito sin mezclar interesados o conversaciones.
- Una vivienda autorizada a dos agencias aparece una sola vez en el catálogo y puede gestionarse por varios miembros autorizados.
- La agencia de origen conserva la autoridad de cierre cuando cambia el gestor técnico o la ficha fue cargada por KarmaHouse por encargo suyo.
- Una agencia colaboradora puede solicitar cierre, pero no confirmar una venta global ni leer el expediente privado de la agencia de origen.
- La agenda evita conflictos de acceso entre agencias sin revelar datos de compradores.
- Una oferta aceptada no cambia automáticamente disponibilidad a vendida ni crea una reserva global.
- La venta confirmada cancela citas futuras, termina procesos competidores, detiene recordatorios y cierra chats relacionados conservando historia y permisos.
- Dos cierres simultáneos producen un único cierre; una respuesta perdida puede recuperarse sin repetir efectos.
- Crear una cita o enviar un mensaje concurrentemente con un cierre no permite continuar la operación tras la venta.
- Un fallo de push conserva el cierre y deja pendiente únicamente la entrega del aviso.
- Retirar un miembro revoca sus accesos, conserva autoría y permite reasignar sus pendientes.
- Conversaciones personales anteriores, favoritos, fotografías, enlaces y referencias de viviendas existentes mantienen su identidad y tratamiento autorizado.
- Se valida el flujo de registro, aprobación, equipo, colaboración entre agencias y cierre en interfaces móvil y escritorio. La recepción real de push en Android requiere evidencia física separada.

