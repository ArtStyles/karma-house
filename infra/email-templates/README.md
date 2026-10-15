# Correos de autenticación de KarmaHouse

Plantillas de confirmación de cuenta y recuperación de contraseña para Supabase Auth. Brevo realiza el envío por SMTP; el contenido se configura en Supabase.

| Plantilla en Supabase | Archivo | Asunto |
| --- | --- | --- |
| Confirm sign up | `confirm-sign-up.html` | Confirma tu correo · KarmaHouse |
| Reset password | `reset-password.html` | Restablece tu contraseña · KarmaHouse |

En el proyecto `iuhvlpucclqbytuqflci`, abre **Authentication → Emails → Templates**, elige la plantilla y copia su HTML completo en **Source**, junto con el asunto de `subjects.json`. Revisa **Preview**, guarda y vuelve a cargar para comprobar que se conserva.

Los botones y enlaces alternativos utilizan `{{ .ConfirmationURL }}`. Conserva esa variable: Supabase genera el enlace de un solo uso y mantiene la dirección de retorno que solicita la app. Las plantillas no construyen enlaces de autenticación propios ni contienen credenciales SMTP.

El diseño utiliza tablas de presentación, estilos en línea, un preencabezado, tipografías de sistema y ajustes para pantallas pequeñas. El logo existente se carga por HTTPS desde `https://www.karmahouse.site/karmahouse-logo.png`; el texto y los botones siguen disponibles si el destinatario bloquea imágenes. La dirección de soporte coincide con la publicada en la web.

Las copias originales y las capturas de revisión se guardan en `artifacts/mail-setup/`. Una vista previa en el navegador comprueba el diseño; la prueba real de recuperación comprueba el envío. No sustituye una revisión en todos los clientes de correo ni la prueba del cambio de contraseña en un dispositivo.

## Verificación del 13 de octubre de 2026

- Confirmación y recuperación guardadas en Supabase; HTML y asuntos comprobados después de recargar.
- Diseño revisado a 360 y 640 píxeles, sin desbordamiento horizontal. Logo servido por el dominio oficial.
- Prueba real de recuperación aceptada por Supabase y registrada como **Entregado** en Brevo con el asunto en español. La vista del mensaje enviado carga el logo y el cuerpo nuevo.
- Brevo reescribe los enlaces mediante su dominio de seguimiento. El panel de esta cuenta solo ofrece seguimiento anónimo, que conserva el seguimiento de clics. Falta obtener de Brevo la desactivación completa; [Supabase recomienda evitar la reescritura de enlaces de autenticación](https://supabase.com/docs/guides/auth/auth-email-templates#email-tracking). Solicitud enviada con autorización del propietario: [ticket 5613764](https://help.brevo.com/hc/es/requests/5613764), estado **Abierto**, pendiente de respuesta y aplicación por Brevo.
- La comprobación de entrega no confirma todavía cómo lo muestra el Gmail del destinatario ni el cambio de contraseña en Android.

Referencias: [plantillas de Supabase](https://supabase.com/docs/guides/auth/auth-email-templates), [CSS admitido en Gmail](https://developers.google.com/workspace/gmail/design/css).
