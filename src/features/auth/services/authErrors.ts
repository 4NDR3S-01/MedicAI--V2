export const mapAuthError = (message: string) => {
  const lower = message.toLowerCase();
  const retryAfterMatch = /after\s+(\d+)\s+seconds?/.exec(lower);
  const retryAfterSeconds = retryAfterMatch ? Number(retryAfterMatch[1]) : null;

  if (
    lower.includes('email rate limit exceeded')
    || lower.includes('over_email_send_rate_limit')
    || lower.includes('for security purposes, you can only request this after')
  ) {
    if (retryAfterSeconds && Number.isFinite(retryAfterSeconds)) {
      return `Demasiadas solicitudes de correo. Espera ${retryAfterSeconds} segundos e intentalo de nuevo.`;
    }
    return 'Demasiadas solicitudes de correo. Espera un momento antes de volver a intentarlo.';
  }

  if (lower.includes('invalid login credentials')) {
    return 'Las credenciales ingresadas no son validas.';
  }

  if (lower.includes('email not confirmed')) {
    return 'Debes confirmar tu correo electronico antes de iniciar sesion.';
  }

  if (lower.includes('user already registered')) {
    return 'Ya existe una cuenta asociada a este correo electronico.';
  }

  if (lower.includes('password')) {
    return 'La contrasena no cumple los requisitos de seguridad.';
  }

  return message;
};
