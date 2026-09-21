# Android preview build plan

**Goal:** Entregar un APK de KarmaHouse instalable en el teléfono Android del usuario, con JavaScript incluido y conexión real a Supabase.

**Scope:** Compilación local para pruebas. Conservar el trabajo actual, generar Android con Expo SDK 57 y usar la firma de pruebas del proyecto. No publicar en tiendas ni servicios externos.

- [x] Generar el proyecto Android desde la configuración Expo y comprobar SDK/JDK/dependencias.
- [x] Compilar un APK release con JavaScript y recursos incorporados, sin depender de Metro.
- [x] Verificar firma, manifiesto, contenido, ausencia de los valores privados configurados, tamaño y SHA-256.
- [x] Entregar APK y pasos breves de instalación. Separar comprobaciones del archivo de prueba en teléfono físico.

Resultado: [evidencia de compilación, archivo y límites de verificación](../../android-preview-verification.md). APK copiado a Descargas con SHA-256 comprobado; prueba física pendiente.
