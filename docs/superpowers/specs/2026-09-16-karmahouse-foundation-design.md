# KarmaHouse: primera entrega navegable

Fecha: 16 de septiembre de 2026. Alcance aprobado en conversación: compraventa de viviendas en Cuba; Android e iPhone; React Native y Expo; primero un recorrido navegable con ejemplos.

## Entrega

Aplicación local de demostración, sin cuentas remotas ni publicación pública. Debe permitir explorar y filtrar viviendas ficticias, abrir detalles, guardar favoritos y crear, editar, pausar y marcar como vendidos anuncios locales. Los datos locales sobreviven al reinicio y se identifican como demostración. Una publicación local nueva aparece en Explorar cuando está activa.

## Diseño

Identidad KarmaHouse: azul marino, azul vivo, blanco cálido, tipografía legible y fotografías grandes. Exploración con encabezado editorial, ubicación, búsqueda y chips; tarjetas con precio, ubicación y medidas. Navegación inferior: Explorar, Favoritos, Publicar y Mi espacio. Mi espacio contiene Mis anuncios. Detalle usa galería, características y descripción. Contactar explica que el anuncio es ficticio y no envía mensajes.

Formularios con etiquetas visibles, errores junto al campo, teclado adecuado, controles de al menos 44 puntos y protección frente a dobles envíos. La interfaz debe funcionar en 390 px y escritorio para revisión web, conservando componentes React Native. El contenido admite escalado de texto y respeta áreas seguras.

## Arquitectura

Expo SDK 57, React Native 0.86, TypeScript y Expo Router. Rutas delgadas en src/app, pantallas y componentes en src/components y src/screens, reglas puras en src/domain y persistencia en src/state. AsyncStorage guarda una instantánea versionada; la hidratación termina antes de aceptar cambios. Errores de almacenamiento se muestran y no simulan persistencia correcta. Las escrituras se serializan para evitar pérdida de cambios.

Un solo backend futuro podrá servir Android/iOS. Esta entrega no configura servicios remotos. Fotos de referencia sintéticas se empaquetan; las fotos elegidas por el usuario se guardan localmente cuando la plataforma lo permita. No se solicitan datos de identidad.

## Límites

Mensajería real, mapa interactivo, cuentas, moderación, verificación documental y publicación en tiendas pertenecen a fases posteriores. No deben mostrarse insignias de vendedor verificado, cifras de compatibilidad o disponibilidad de funciones inexistentes. No se hacen afirmaciones de validación física con pruebas web o exportaciones JavaScript.

## Criterios de aceptación

- Búsqueda sin distinción de tildes y filtros por tipo, precio máximo y habitaciones, con estado vacío y limpieza.
- Favoritos persisten tras recargar.
- Publicar valida título, zona, precio positivo y finito, medidas y descripción; los anuncios son explícitamente locales.
- Editar conserva id; pausar oculta del catálogo; vendido aparece en Mis anuncios.
- Esquema persistido se valida antes de usarlo; una instantánea inválida no rompe la app.
- Typecheck, pruebas de dominio, revisión visual móvil/escritorio y exportación Android/iOS/web.
- README documenta comandos, alcance, versiones mínimas y límites de validación.
