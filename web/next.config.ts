import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Solo para `next dev`: permite abrir el servidor de desarrollo desde un
  // teléfono de la misma red (http://192.168.x.x:3000 con `npm run dev -- -H 0.0.0.0`).
  // Sin esto, Next 16 bloquea sus recursos de desarrollo desde otro origen y la
  // página se ve pero no responde (no abre el menú, no cambian las pantallas).
  // No afecta al sitio publicado.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
};

export default nextConfig;
