# Registro Android en Firebase — 2026-09-20

El usuario eligió `com.karmahouse.karmahouse` y aportó el archivo `google-services (2).json`. Se verificó la existencia de exactamente un cliente con ese paquete en el proyecto Firebase `fitai-b9e85`. `google-services.json` conserva los valores originales de ese cliente y los metadatos de proyecto; se excluyeron las otras dos aplicaciones del archivo recibido. El original de Descargas no se modificó.

## Configuración y evidencia

- `app.json`: `android.package=com.karmahouse.karmahouse` y `android.googleServicesFile=./google-services.json`. iOS continúa con `com.karmahouse.app`.
- Expo57 consultado antes del cambio. `expo prebuild --platform android --no-install` finalizó correctamente; regeneró Android. La configuración nativa previa se respaldó en `artifacts/firebase-android-prebuild-backup`.
- Verificados `applicationId`, `namespace`, declaración de paquete y ubicación de MainActivity/MainApplication, copia idéntica del JSON nativo y plugin Google Services 4.4.4 en Gradle.
- `expo config --type public --json` resolvió el paquete y la ruta esperados. La vinculación con Expo se añadió después con los datos reales de la captura aportada por el usuario (ver abajo).
- El script de compilación comprueba la concordancia entre paquete Expo y Android generado. El verificador de APK toma paquete/versión de `app.json` y admite `-ExpectedPackage`/`-ExpectedVersion` explícitos para artefactos anteriores. Ambos scripts pasaron el análisis sintáctico PowerShell.
- No se compiló ni distribuyó un APK nuevo, no se modificó Supabase, no se instalaron módulos push ni se enviaron notificaciones.

El cambio de identificador supone una aplicación Android distinta de los APK anteriores `com.karmahouse.app`. La próxima entrega debe usar versión/nombre nuevos para conservar el artefacto 0.1.3 y comprobar los enlaces `karmahouse://` si ambas instalaciones conviven. No se transfieren automáticamente sesión o borradores locales entre paquetes.

## Vinculación del proyecto Expo

El usuario creó el proyecto y aportó una captura de Project details. Dos lecturas independientes confirmaron estos valores, ya incorporados a `app.json`:

- `owner`: `artstyless-team`.
- `slug`: `karma-house`.
- `extra.eas.projectId`: `e054aea9-38b4-4211-826b-521b3cc0be9f`.
- Proyecto: `https://expo.dev/accounts/artstyless-team/projects/karma-house`.

La resolución local de Expo confirmó exactamente esos valores y el paquete Android existente. Evidencia local: `artifacts/expo-project-link.json`. No se creó otro proyecto ni se ejecutó una compilación. Tras el acceso del usuario, el navegador lateral mostró el proyecto real y su panel Project details confirmó owner, slug y UUID. EAS CLI 24.7.0 quedó autenticado como `artstyles` mediante el flujo oficial `login --browser`, usando la sesión del usuario. Se añadió `eas.json` con perfil `preview`, distribución interna y APK; no se inició ninguna build.

### Comprobación remota de credenciales

- Inicialmente Credentials estaba vacío. El asistente web exigía keystore; se completó el registro Android mediante la ruta oficial EAS CLI → Google Service Account → FCM V1, sin generar firma de distribución ni modificar las credenciales de otras apps.
- Tras el acceso del usuario se seleccionó la cuenta Google con permiso sobre `fitai-b9e85`. La pantalla MFA pertenecía a la otra cuenta del navegador. El agente no cambió contraseñas ni configuración 2SV.
- Cuenta de servicio creada: `karmahouse-expo-push@fitai-b9e85.iam.gserviceaccount.com`, ID `100481563606271783402`. Rol asignado: `roles/firebasecloudmessaging.admin`. Este rol pertenece al proyecto Firebase compartido, no se restringe al paquete Android. No se concedió Owner, Editor, acceso a Auth/Storage ni permisos de suplantación a terceros.
- La primera clave generada por Google no llegó al disco; el usuario confirmó que no apareció descarga. Esa clave inutilizable (`1b4f1c0a52cd5cbc0bfd3823cf8a2d5972861c80`) fue retirada tras validar el reemplazo. La lista remota final contiene solo la clave válida de esta cuenta.
- Se utilizó la alternativa oficial de Google: generar RSA2048 localmente, subir únicamente el certificado público X.509v3 PEM con sujeto genérico y conservar la privada local. Google asignó el ID `9d8cae1bac54daf3d5b20a5257fc62456d0c72c3`. La credencial completa se cargó mediante EAS CLI y quedó asignada **solo a FCM V1** de `com.karmahouse.karmahouse`; el panel Expo confirmó proyecto, cuenta e ID. No se asignó a EAS Submit.
- Archivos privados fuera del repositorio, en `%USERPROFILE%/.karmahouse/credentials/fcm-20260920/`, con acceso de filesystem limitado al usuario actual y SYSTEM. `.gitignore` excluye también rutas y nombres comunes de credenciales privadas. Ningún secreto fue impreso ni incorporado a la app.
- **Rotar antes del 20 de septiembre de 2027 a las 17:42:02 UTC**, fecha de vencimiento del certificado. La rotación debe actualizar la asociación FCM V1 de Expo y repetir la validación antes de retirar la clave anterior. No se creó un recordatorio automático.

### Validación de la credencial

- Correspondencia entre certificado, PEM privado y JSON; firma/verificación local RSA2048 correcta y certificado vigente.
- Autenticación real Google OAuth: HTTP 200 con alcance `firebase.messaging`.
- FCM V1 `projects/fitai-b9e85/messages:send`: HTTP 200 usando **`validate_only: true`**, sin tokens de dispositivo y **sin enviar ninguna notificación**.
- Evidencia sanitizada: `artifacts/fcm-credential-verification-20260920.json`. JWT y token OAuth permanecieron solo en memoria. Esta comprobación acredita clave y permiso, no recepción desde Expo en un teléfono.
- Expo config volvió a resolver owner/UUID/paquete correctos; JSON EAS válido, exclusiones Git comprobadas. EAS CLI instalado en caché de npm; `package.json` y `package-lock.json` no cambiaron durante esta configuración.

## Continuación: cliente y entrega Android 0.1.4

Tras esta configuración de credenciales se implementaron registro/revocación por sesión, permisos explícitos, apertura autorizada, cola de servidor y reintentos/recibos. Se instaló `expo-notifications ~57.0.20` y se generó y verificó el APK 0.1.4. Estos resultados corresponden al bloque posterior, no a la validación inicial de la credencial: [cliente/APK](android-push-verification.md), [servidor y activación](android-push-data-verification.md).

## Pendiente en dispositivo y otras plataformas

1. Instalar el APK 0.1.4 y verificar recepción con la app cerrada, apertura del chat correcto y cambio de cuenta en Android real. La compilación y los recibos del servidor no sustituyen esa prueba.
2. iOS necesita su configuración APNs separada. La firma de distribución Android y EAS Submit siguen sin configurar.

Fuentes: [Expo SDK57](https://docs.expo.dev/versions/v57.0.0/), [Firebase/FCM V1 con Expo](https://docs.expo.dev/push-notifications/fcm-credentials/), [subir claves públicas de cuentas de servicio](https://docs.cloud.google.com/iam/docs/keys-upload), [FCM validate_only](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send), [cuenta y configuración de EAS](https://docs.expo.dev/build/setup/). La configuración verificada no acredita entrega push.
