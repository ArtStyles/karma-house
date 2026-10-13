# Revisión visual de KarmaHouse

11 de octubre de 2026. Registro de la revisión de pantallas y sus decisiones. La pausa de código terminó con «perfecto comienza con las implementaciones». La ejecución sigue [el plan de rediseño](superpowers/plans/2026-10-11-visual-redesign.md).

## Decisiones aprobadas

| Elemento | Dirección elegida | Alcance |
| --- | --- | --- |
| Ficha de vivienda | Fotografía protagonista | Priorizar fotografía, precio, ubicación y características. Mantener la acción de contacto persistente y el corazón visible con respuesta inmediata. |
| Contacto | Hoja contextual de la propuesta Fotografía protagonista | Mostrar la vivienda y sus contactos disponibles al iniciar la acción. Mantener las comprobaciones de responsable, inmobiliaria y acceso antes de abrir una conversación. |
| Navegación inferior | Clásica integrada | Barra de lado a lado, unida al borde inferior y con superficie sólida. Cuatro destinos: Explorar, Favoritos, Publicar y Mi espacio. Iconos y etiquetas visibles; selección clara, contador y área segura. |
| Favoritos vacío | Directa | Dirección recomendada adoptada al iniciar la implementación autorizada. Explicación concreta e Ir a Explorar, sin ilustración ornamental. |
| Publicar | Guiada | Elegida expresamente: Venta, Permuta, Alquiler y Búsqueda al entrar, con Pegar anuncio y ayuda disponibles. |
| Mi espacio | Lista compacta | Dirección recomendada aceptada al comenzar: identidad breve, grupos de acciones, preferencias accesibles y un solo Ajustes. |
| Proceso de trabajo | Implementación autorizada | Completar cambios locales, comprobaciones y preparación Android. La solicitud no publica web, mensajes ni una release remota. |

La elección de la barra clásica quedó confirmada en «si la clasica, pero aun no toques codigo deja todo documentado». Después de revisar Mi espacio, el usuario pidió comenzar las implementaciones. Se adoptaron Favoritos Directa y Mi espacio Lista compacta según las recomendaciones presentadas. Publicar Guiada quedó confirmada aparte en «Guiada: elegir la operación al entrar». Las selecciones del visor por sí solas no se tratan como aprobación.

## Base existente

Las mejoras de respuesta de botones, hoja de filtros, favoritos optimistas, indicadores y fotos de la 0.1.23 ya están en la base local. Su evidencia está en [la verificación de la 0.1.23](apple-refinement-release.md). Esta entrega sustituye la barra flotante de esa base por la clásica integrada aprobada.

Se conservan la identidad azul de KarmaHouse, Claro/Oscuro/Sistema y la franja de cuatro tarjetas de Explorar sin mapa. El rediseño de las entradas no incorpora funciones comerciales nuevas.

## Criterio visual y de redacción

La interfaz debe explicar el estado y la siguiente acción con textos concretos. Los bocetos sustituyen expresiones como «Algunos lugares se quedan contigo», «Tu anuncio, a tu manera» y «Tu vivienda, su próximo capítulo» en las pantallas ahora revisadas. La fotografía se usa donde ayuda a conocer una vivienda; no hace falta una ilustración ornamental para explicar que una lista está vacía.

Los títulos, separaciones y acciones crean la jerarquía. La entrada de Publicar debe distinguir la preparación por cuenta propia de la ayuda por correo, con una acción principal clara. La navegación integrada ocupa su propio espacio, preserva el área segura y no cubre el contenido.

El feedback empieza al tocar. Un favorito puede cambiar antes de que termine la red, con recuperación ante un fallo. Abrir una conversación, guardar un anuncio o enviarlo a revisión muestran inmediatamente su estado de trabajo, pero anuncian éxito después de la confirmación correspondiente. Los cambios de tema y las preferencias de accesibilidad conservan una alternativa legible y sin desplazamientos innecesarios.

## Favoritos en revisión

La pantalla actual usa el componente general de estado vacío, un corazón destacado y una frase sentimental. La propuesta se concentra en una lista personal de viviendas, con una explicación corta y una salida directa a Explorar.

| Variante | Composición | Texto y acción |
| --- | --- | --- |
| Directa, recomendada | Cabecera de lista; explicación alineada a la izquierda y espacio tranquilo. El corazón no se convierte en una ilustración gigante. | «Todavía no tienes favoritos.» / «En Explorar, toca el corazón de una vivienda para guardarla aquí.» / «Ir a Explorar». |
| Guiada, con ejemplo | Explicación acompañada de una tarjeta pequeña identificada como Ejemplo, que muestra dónde está el corazón. | Permite probar visualmente ese corazón y salir a Explorar. El ejemplo no se presenta como una vivienda ya guardada. |

La variante Directa evita añadir fotografías a una lista vacía. La variante Guiada aporta aprendizaje visual, pero ocupa más espacio y requiere una muestra explícitamente identificada; no debe consultar anuncios reales para rellenar el vacío.

### Estados que deben conservarse

| Estado | Presentación y comportamiento |
| --- | --- |
| Cero favoritos confirmados | Mostrar el vacío solo después de cargar el estado de la cuenta. |
| Con viviendas | Mantener las tarjetas, el corazón optimista y la coherencia con ficha y contador. |
| Retirada durante la visita | Conservar la tarjeta atenuada y Deshacer. No convertir ese toque inmediatamente en una pantalla vacía ni mover el control bajo el dedo. |
| Invitado | Mostrar acceso a la cuenta y preservar el regreso a Favoritos. No describirlo como una lista confirmada vacía. |
| Cargando | Mostrar un estado de carga; no adelantar el vacío. |
| Fallo | Mostrar el problema y Reintentar. Conservar los datos disponibles. |
| Anuncios guardados no disponibles | Explicar la indisponibilidad, sin afirmar que el usuario no guardó viviendas. |

## Publicar en revisión

La entrada actual repite títulos y explicaciones dentro de dos tarjetas equivalentes. Se propone reducir esos bloques y facilitar la elección de cómo preparar un anuncio.

| Variante | Entrada | Recorrido |
| --- | --- | --- |
| Directa | Por mi cuenta como opción principal, Crear anuncio y acceso a Pegar anuncio. La ayuda aparece en una sección secundaria con un enlace visible. | Conserva la elección de operación después de iniciar el anuncio. |
| Guiada, recomendada para la entrada | Presenta Venta, Permuta, Alquiler y Búsqueda como opciones de entrada. Pegar anuncio y Publicar con ayuda siguen disponibles. | Adelanta la operación al inicio y necesita confirmar este ajuste del recorrido antes de implementarlo. |

La recomendación visual para Publicar es Guiada: las opciones nombran lo que el usuario quiere hacer y reducen el texto introductorio. Esa elección requiere aprobar que la operación se adelante, manteniendo los controles de cuenta y el regreso a la intención seleccionada. Directa es la alternativa para conservar la secuencia conocida. Los tres pasos del formulario siguen siendo Vivienda, Detalles y Revisar; el formulario existente mantiene sus campos y validaciones según la operación. Se pueden combinar Favoritos Directa y Publicar Guiada; elegir una variante del boceto no obliga a usarla en ambas pantallas.

### Reglas que deben conservarse

- Publicar por cuenta propia y con ayuda siguen siendo recorridos distintos. La ayuda abre una plantilla de correo para revisar y enviar; no envía mensajes ni autoriza publicaciones por sí sola.
- Ofrecer una vivienda y publicar una búsqueda mantienen sus requisitos respectivos. Una búsqueda no adquiere por este rediseño una obligación de adjuntar fotos.
- El acceso de invitados y la suspensión de cuenta se comprueban antes de permitir publicar.
- El formulario y sus fotos se conservan al cambiar de opción. Los borradores permanecen aislados por cuenta.
- Pegar anuncio conserva la revisión de los datos importados antes de enviarlos.
- Se preserva la diferencia entre Enviar a revisión para una cuenta normal y Publicar ahora para el rol autorizado. No se cambia la moderación.
- El envío presenta progreso y errores sin afirmar una publicación exitosa de forma anticipada.

## Mi espacio en revisión

Revisados [ProfileScreen](../src/screens/ProfileScreen.tsx), [AccountMenu](../src/components/account/AccountMenu.tsx) y el acceso a [AccountSettingsScreen](../src/screens/AccountSettingsScreen.tsx). La vista de demostración existente también se observó en el navegador local. Las condiciones de cuentas conectadas se comprobaron en el código; no se inició sesión ni se modificó una cuenta para preparar estos bocetos.

La identidad actual usa una tarjeta azul, un anillo decorativo y la etiqueta «TU KARMAHOUSE». Las filas de actividad tienen al menos 79 px, un icono dentro de otro bloque y una explicación por destino. Ajustes de cuenta aparece en la cabecera, en el menú del avatar y, para una cuenta conectada, en la sección Cuenta. El bloque «Dale un lugar a tu vivienda» repite Publicar y alarga la pantalla. La propuesta reduce estos elementos para hacer más visibles los accesos de uso habitual.

| Variante | Composición | Ventaja y coste |
| --- | --- | --- |
| Lista compacta, recomendada | Identidad breve sin anillo; Ahorro de datos accesible; grupos Actividad, Viviendas y Cuenta con filas compactas y contadores secundarios. | Jerarquía uniforme y menos elementos. Mensajes y Mis anuncios siguen siendo filas de lista. |
| Accesos rápidos | Misma identidad y preferencias; dos accesos pequeños a Mensajes y Mis anuncios antes de las listas restantes. | Da más presencia a esas dos acciones. Ocupa algo más de altura y su prioridad deberá validarse con el uso real. |

En ambas propuestas, Ahorro de datos permanece antes de la actividad y está disponible para invitados. Se acorta la explicación a «Fotos al tocar; mapa al pedirlo». Es una preferencia del dispositivo y no se convierte en una función restringida a cuentas. Ajustes mantiene una sola entrada en la cabecera; esta decisión propone retirar su fila duplicada y mostrar el avatar como identidad en esta pantalla. El menú de cuenta de otras pantallas conserva su función. El avatar actual abre un menú de cuenta: no es un selector de inmobiliaria ni de rol.

Se propone retirar el bloque promocional de Publicar de la raíz de Mi espacio. Publicar continúa en la barra integrada, y Mis anuncios puede ofrecer su acción de creación cuando corresponda a su propio estado vacío. El rediseño de ese destino aún no está incluido en esta elección.

### Accesos y condiciones que deben conservarse

| Acceso o estado | Regla |
| --- | --- |
| Mensajes y Notificaciones | Contadores independientes de elementos sin leer, ocultos en cero y limitados visualmente a 99+. No usar el número de conversaciones como número de mensajes sin leer. |
| Indicador de Mi espacio | Mantener la regla existente para actividad sin leer. Los anuncios y favoritos no se suman como novedades. |
| Visitas y ofertas | Mantener el destino sin inventar un contador que la pantalla actual no obtiene. |
| Mis anuncios y Favoritos | Mantener sus datos y destinos actuales; los números de los bocetos son ejemplos, no consultas a la cuenta real. |
| Mis alertas | Disponible en modo conectado. Conservar el refresco al regresar a la pantalla. |
| Ver mi perfil público | Solo en modo conectado, con usuario y al menos un anuncio activo aprobado. No crear una opción universal por motivos visuales. |
| Inmobiliaria principal | Mantener nombre, destino con agencyId y distinciones de verificación/principal cuando realmente existan. El boceto usa una inmobiliaria de ejemplo sin afirmar verificación. |
| Mi inmobiliaria e invitaciones | Si no existe inmobiliaria principal y la función está habilitada o hay inmobiliarias, conservar esta entrada. No sustituirla por una cuenta profesional ficticia. |
| Administración | Mantener la condición isAdmin y el acceso directo. isAdmin e isOwner son permisos distintos; el ejemplo «Administrador propietario» representa una combinación, no cambia las reglas de otros administradores. |
| Anuncios por aceptar | Mantener la condición de usuario que no es propietario del sistema. Si el contador de transferencias es desconocido, no mostrar un cero confirmado. |
| Invitado | Acceso a la cuenta con regreso a Mi espacio; Ajustes y Ahorro de datos disponibles. No mostrar actividad privada como si estuviera cargada y vacía. |
| Demo local | Identificar datos del dispositivo; conservar acceso a actividad de prueba y la indicación de que mensajes y publicaciones públicas requieren cuenta. No presentarla como invitado de una cuenta conectada. |
| Cuenta suspendida | Aviso concreto de las restricciones de publicar y enviar mensajes. Conservar consulta y acceso a preferencias según las reglas actuales. |
| Actualización parcial o fallida | Conservar la identidad y los datos ya disponibles, el refresco coordinado y la posibilidad de reintentar. No borrar contadores ni cerrar la sesión por un fallo de actualización. |
| Ajustes y sesión | Claro/Oscuro/Sistema, perfil, preferencias de notificaciones y salida de la cuenta siguen disponibles. El boceto no ejecuta autenticación ni cierre de sesión reales. |
| Identidad y enlaces legales | No trasladar el correo privado al perfil público. Privacidad y Términos mantienen destinos y superficies táctiles suficientes. |

### Sensación e interacción propuestas

El énfasis está en tipografía, agrupación, contraste y respuesta inmediata al pulsar. Las filas no necesitan rebotes ni gestos nuevos. La navegación a un destino debe poder comenzar sin esperar a cargar sus datos; ese destino presenta su estado de carga y conserva la vuelta a Mi espacio. El interruptor de ahorro responde al toque, de acuerdo con su persistencia local actual. Se mantiene la reducción de movimiento y no se introduce una animación que bloquee nuevas entradas.

La referencia Apple orienta esta claridad y respuesta, pero la barra sigue siendo sólida e integrada porque el usuario eligió explícitamente esa dirección. La apariencia no implica copiar todos los materiales translúcidos sugeridos por el skill. Cambiar la distribución es factible con los componentes y destinos actuales; el comportamiento nativo final todavía requiere implementación y comprobación en dispositivo.

## Bocetos de la revisión

Directorio local de los bocetos interactivos:

`C:/Users/ACER NITRO/.codex/visualizations/2026/10/09/01a12151-1c93-7c90-b510-32b9dbce5948/`

| Archivo | Estado de diseño |
| --- | --- |
| `karmahouse-botones-filtros.html` | Antecedente de la primera fase, ya implementada. |
| `karmahouse-ficha-contacto-publicar.html` | Fotografía protagonista aprobada para ficha/contacto. La entrada de Publicar de este boceto queda superada por la revisión actual. |
| `karmahouse-navegacion-integrada.html` | Clásica integrada aprobada. El indicador superior queda como alternativa no elegida. |
| `karmahouse-publicar-favoritos.html` | Referencia: Favoritos Directa y Publicar Guiada adoptados para implementación. |
| `karmahouse-mi-espacio.html` | Lista compacta adoptada. Accesos rápidos queda como alternativa. Cuenta y contadores de ejemplo. |

Los bocetos usan datos e interacciones de muestra. Su revisión en navegador no sustituye la implementación Expo, una prueba de Supabase ni una comprobación Android. Las direcciones nuevas deben distinguirse de la 0.1.23 instalada.

La revisión local de estos bocetos cubrió 390 y 320 px, las dos composiciones iniciales, la presentación de las cuatro operaciones y la selección de Venta, la conservación de datos de muestra al volver a opciones y la retirada/Deshacer de un favorito de muestra. En ese recorrido el corazón mantuvo las mismas coordenadas al retirar la tarjeta. No se observó desbordamiento horizontal ni superposición de la barra en la comprobación estrecha; el log capturado no mostró errores ni avisos. Se observaron las apariencias clara y oscura. Las capturas `artifacts/apple-refinement/boceto-favoritos-directa.png` y `boceto-publicar-directa.png` corresponden al boceto, no a una aplicación actualizada.

La revisión de Mi espacio comparó ambas composiciones y usó tamaños de navegador de 320 y 390 px. El marco de vista previa deja un ancho interior menor; se comprobaron las medidas del contenido, no solo la apariencia de la captura. En las comprobaciones no hubo desbordamiento horizontal ni solapamiento de la barra y la lista. Se probó el interruptor local, el acceso a Ajustes, la elección Oscuro/Sistema y el regreso a Mi espacio; también el acceso rápido a Mensajes y su vuelta. Todos los botones de la composición Accesos rápidos medida tenían al menos 44 px de altura. El log capturado no mostró errores ni avisos. Se verificó la sintaxis del script del boceto. Las capturas completas `artifacts/apple-refinement/boceto-mi-espacio-lista.png` y `boceto-mi-espacio-accesos.png` guardan las dos propuestas.

El boceto ofrece estados de muestra mediante los controles de diseño del visor: particular, inmobiliaria, administrador propietario, invitado, suspensión, demo, actualización y error. Estos controles dependen del visor; la comprobación local descrita arriba no prueba todos los roles, permisos o condiciones reales. El tamaño de texto ampliado del boceto tampoco sustituye una prueba de accesibilidad del sistema. No se modificó el código de la aplicación ni se realizó una nueva compilación o prueba Android en esta revisión.

## Continuación

La implementación local está terminada en `codex/visual-redesign`: 0.1.24 / Android 25, APK firmada y actualizada en el Pixel 7 Pro. El [registro de verificación](visual-redesign-verification.md) distingue pruebas, navegador, APK y teléfono, con sus límites. Se conservan los bocetos como referencia. Las pantallas futuras se revisarán por separado.

Se implementaron [FavoritesScreen](../src/screens/FavoritesScreen.tsx), [PublishScreen](../src/screens/PublishScreen.tsx), [ProfileScreen](../src/screens/ProfileScreen.tsx), el formulario, las hojas de contacto y la distribución de espacio del navegador. El avatar se ajustó únicamente en Mi espacio y se preserva [AccountMenu](../src/components/account/AccountMenu.tsx) en sus otros usos. Se leyó la [documentación exacta de Expo 57](https://docs.expo.dev/versions/v57.0.0/) según AGENTS.md antes de modificar código. La referencia de sensaciones e interacción continúa siendo [Apple Design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md).

Durante la prueba final se incorporó la petición de un divisor muy fino entre publicaciones de Explorar. La línea usa el color de borde del tema, se coloca entre tarjetas o filas y mantiene el espaciado existente. Se observó en la exportación web y en el Pixel.
