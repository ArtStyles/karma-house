# Franja deslizante de Explorar

Diseño «Franja deslizante» aprobado el 7 de octubre de 2026. La cabecera de
Explorar reemplaza «Encuentra tu casa en Cuba» por cuatro opciones:

- Un hogar para ti · Comprar.
- Vive a tu manera · Alquilar.
- Cambia de hogar · Permutar.
- Tu vivienda, aquí · Publicar anuncio.

Deslizar cambia únicamente la tarjeta visible y su indicador. Tocar las tres
primeras selecciona la operación conservando zona, texto y demás filtros.
Publicar abre el flujo existente. Sin conexión, las acciones que cambian filtros
quedan deshabilitadas; Publicar sigue disponible.

Se conserva parte de la siguiente tarjeta, con cuatro indicadores y la señal
«Desliza». El carrusel ajusta el ancho a su contenedor; el texto puede crecer
sin una altura fija. Usa las paletas Claro/Oscuro existentes y los iconos de la app.
Android usa `snapToInterval`; web usa `pagingEnabled` para activar CSS scroll snap.

Se retiraron el botón Mapa de los resultados y su acceso flotante en Explorar.
El código de mapas permanece para las otras pantallas. Este cambio no implementa
una suscripción Pro ni modifica los mapas de ubicación de anuncios.

## Verificación

- Referencia exacta de Expo SDK 57 consultada antes de modificar código.
- TypeScript y 433 pruebas existentes correctas.
- Exportación web correcta; revisión a 320, 390 y 1280 píxeles, sin desbordamiento
  de la página. Franja revisada en claro y oscuro, sin errores de consola.
- Desplazamiento web conserva filtros; selección de Compra/Alquiler/Permuta
  comprobada. Permuta conserva «Cojímar» en el buscador y Publicar abre `/publish`.
- Revisión independiente: corregido el ajuste de tarjetas en React Native Web.
- APK y AAB 0.1.19 (versionCode 20) firmados y compilados correctamente.
- Verificador Android correcto: paquete, versión, certificado esperado,
  arquitecturas, configuración pública y búsqueda de credenciales privadas.
- SHA-256 APK: `4a5e1f80c31c48376f4a6bea87046468b0dd62aab5256e9cf4fff62b3d333071`.
- Pixel 7 Pro actualizado con `adb install -r`, resultado Success. Verificada
  0.1.19 (20), conservando `firstInstallTime=2026-09-24 11:30:59`.
- Capturas del APK instalado confirman la cabecera nueva, ambas viviendas reales
  y ausencia del botón de mapa en Claro y Oscuro.
- En el Pixel se comprobó desplazamiento hacia ambos lados, las cuatro posiciones,
  conservación de la operación al deslizar, selección de Alquiler y Permuta al
  tocar, y apertura del flujo Publicar. Una pausa al cambiar el usuario de app
  evitó enviar entrada fuera de KarmaHouse; se continuó al confirmar disponibilidad.
- Preferencia original Claro restaurada y comprobada en Ajustes. Se dejó Explorar
  en la primera tarjeta, con Venta y permuta/Toda Cuba, sin filtros de prueba.

Evidencia en `artifacts/discovery/`; APK y AAB en `artifacts/releases/`.
Estos archivos no se han publicado como descarga pública.
