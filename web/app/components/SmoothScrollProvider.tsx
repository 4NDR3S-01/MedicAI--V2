"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

// El scroll suave es un efecto de la landing. En páginas de documento (p. ej.
// /privacidad) rompe los enlaces a secciones (#ancla) y la cabecera fija, así
// que ahí se usa el scroll nativo del navegador.
const SMOOTH_SCROLL_PATHS = new Set(["/"]);

export default function SmoothScrollProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!SMOOTH_SCROLL_PATHS.has(pathname)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.08, // Adjusts the smoothness (lower = smoother/slower)
      wheelMultiplier: 1, // Scroll speed
      smoothWheel: true, // Enables smooth scrolling for mouse wheels
      anchors: true, // Los enlaces #ancla también se desplazan con Lenis
    });

    let frame = 0;
    function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }

    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [pathname]);

  return <>{children}</>;
}
