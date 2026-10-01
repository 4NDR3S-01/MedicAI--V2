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
      return `Demasiadas solicitudes de correo. Espera ${retryAfterSeconds} segundos e inténtalo de nuevo.`;
    }
    return 'Demasiadas solicitudes de correo. Espera un momento antes de volver a intentarlo.';
  }

  if (lower.includes('too many requests') || lower.includes('throttlerexception')) {
    return 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.';
  }

  if (lower.includes('invalid login credentials')) {
    return 'Las credenciales ingresadas no son validas.';
  }

  if (lower.includes('email not confirmed')) {
    return 'Debes confirmar tu correo electrónico antes de iniciar sesión.';
  }

  if (lower.includes('user already registered')) {
    return 'Ya existe una cuenta asociada a este correo electrónico.';
  }

  if (lower.includes('password')) {
    return 'La contraseña no cumple los requisitos de seguridad.';
  }

  return message;
};
