import { randomBytes } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Cabeceras de seguridad de la API (equivalente a lo que haría helmet, sin la
 * dependencia). La API responde JSON con datos de salud: nada se incrusta en
 * otra página, nada se guarda en cachés intermedias y nada lleva Referer.
 *
 * Las páginas puente HTML de auth (verify-email / reset-password) sobrescriben
 * la CSP con `authBridgeCsp(nonce)` para poder usar su <style> y <script>.
 */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-DNS-Prefetch-Control': 'off',
  'X-Permitted-Cross-Domain-Policies': 'none',
  // Respuestas con datos personales: que ningún proxy/CDN ni el navegador las guarde.
  'Cache-Control': 'no-store',
};

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
  res.removeHeader('X-Powered-By');
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
}

export function createCspNonce() {
  return randomBytes(16).toString('base64');
}

/** CSP de las páginas puente: solo su propio <style>/<script> (por nonce). */
export function authBridgeCsp(nonce: string) {
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
