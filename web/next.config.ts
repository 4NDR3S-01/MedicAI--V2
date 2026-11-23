import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Origen del Umami propio (analítica opcional). Si no está configurado, la CSP
// no permite ningún origen externo.
function originOf(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
const umamiOrigin = originOf(process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL);
const extra = umamiOrigin ? ` ${umamiOrigin}` : "";

// Las páginas son estáticas: Next.js inyecta scripts inline (datos de RSC y el
// script de tamaño de texto del layout), así que script-src necesita
// 'unsafe-inline'. Usar nonces obligaría a renderizar cada página por petición.
// Aun así la CSP bloquea scripts de otros orígenes, <object>, <base>, envíos
// de formularios fuera del sitio y que otra web nos incruste (clickjacking).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${extra}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${extra}${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Solo para `next dev`: permite abrir el servidor de desarrollo desde un
  // teléfono de la misma red (http://192.168.x.x:3000 con `npm run dev -- -H 0.0.0.0`).
  // Sin esto, Next 16 bloquea sus recursos de desarrollo desde otro origen y la
  // página se ve pero no responde (no abre el menú, no cambian las pantallas).
  // No afecta al sitio publicado.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Los enlaces de verificación y restablecimiento llevan el token en la URL:
      // que no se filtre por Referer ni quede en cachés.
      {
        source: "/auth/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default nextConfig;
