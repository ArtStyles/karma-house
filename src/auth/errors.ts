/** Never show raw upstream messages: callback failures can contain URLs or credential details. */
export function authErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  switch (code) {
    case 'invalid_credentials': return 'El correo o la contraseña no son correctos.';
    case 'email_not_confirmed': return 'Confirma tu correo antes de entrar. Revisa también la carpeta de spam.';
    case 'user_already_exists': case 'email_exists': return 'Ya existe una cuenta con ese correo. Prueba a iniciar sesión.';
    case 'weak_password': return 'Elige una contraseña más segura, de al menos 8 caracteres.';
    case 'same_password': return 'Elige una contraseña distinta de la anterior.';
    case 'otp_expired': case 'flow_state_expired': case 'flow_state_not_found': case 'bad_code_verifier': return 'El enlace ha caducado o pertenece a otro dispositivo. Solicita uno nuevo y ábrelo aquí.';
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return 'Se han realizado demasiados intentos. Espera unos minutos antes de volver a probar.';
    case 'email_address_invalid': case 'validation_failed': return 'Revisa el correo y los datos que has introducido.';
    case 'signup_disabled': return 'El registro no está disponible en este momento. Inténtalo más tarde.';
    case 'email_address_not_authorized': return 'El servicio de correo todavía no permite completar este envío. Inténtalo más tarde.';
    case 'session_not_found': case 'refresh_token_not_found': case 'refresh_token_already_used': return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
  }
  if (status === 429) return 'Espera unos minutos antes de volver a intentarlo.';
  return 'No se pudo completar la operación. Comprueba tu conexión e inténtalo de nuevo.';
}

export function validateEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Escribe un correo electrónico válido.');
  return email;
}

export function validateNewPassword(password: string): void {
  if (password.length < 8 || password.length > 128) throw new Error('La contraseña debe tener entre 8 y 128 caracteres.');
}
