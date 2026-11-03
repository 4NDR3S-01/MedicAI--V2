"use client";

import { useEffect } from "react";

// Partes de una sección que entran por separado, en orden de lectura:
// título → texto → visual → elementos de una lista.
const PARTS = [
  "[data-reveal-part]",
  ".section-header > *",
  ".split-text > *",
  ".split-visual",
  ".feature-item",
  ".audience-grid > *",
  ".steps-wrap",
  ".faq-item",
  ".cta-card > *",
  ".security-banner-inner",
].join(",");

// Escalonado corto y con tope: la última parte nunca espera más de ~0,6 s.
const STAGGER_MS = 70;
const MAX_STEPS = 8;
// Duración de la entrada en CSS (--dur-enter) con margen.
const REVEAL_MS = 900;

/**
 * Entrada animada de las secciones con `data-section-reveal`. Se monta una vez
 * por página (las páginas son componentes de servidor).
 *
 * Solo esconde algo después de que este script corre (marca cada parte con
 * `data-reveal`), y el CSS lo hace solo con `prefers-reduced-motion:
 * no-preference`: sin JS o con movimiento reducido, la página se ve completa.
 */
export function SectionReveal() {
  useEffect(() => {
    const parts: HTMLElement[] = [];
    const timers: number[] = [];
    document.querySelectorAll<HTMLElement>("[data-section-reveal]").forEach((section) => {
      section.querySelectorAll<HTMLElement>(PARTS).forEach((el) => {
        // Una parte dentro de otra parte ya entra con su contenedor.
        if (el.parentElement?.closest(PARTS)) return;
        el.dataset.reveal = "";
        parts.push(el);
      });
    });

    // Cada parte se observa sola (una sección muy alta, como el recorrido de la
    // app en móvil, nunca llega a verse «entera»). Las que entran a la vez se
    // escalonan entre sí en orden de lectura.
    const io = new IntersectionObserver(
      (entries) => {
        const entering = entries.filter((e) => e.isIntersecting).map((e) => e.target as HTMLElement);
        entering.forEach((el, i) => {
          const delay = Math.min(i, MAX_STEPS) * STAGGER_MS;
          el.style.setProperty("--reveal-delay", `${delay}ms`);
          el.classList.add("is-revealed");
          io.unobserve(el);
          // Terminada la entrada, el elemento vuelve a sus transiciones propias
          // (hover, abrir/cerrar) sin el retraso del escalonado.
          timers.push(
            window.setTimeout(() => {
              delete el.dataset.reveal;
              el.classList.remove("is-revealed");
              el.style.removeProperty("--reveal-delay");
            }, delay + REVEAL_MS)
          );
        });
      },
      { threshold: 0, rootMargin: "0px 0px -10% 0px" }
    );
    parts.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return null;
}

/** Marca un bloque como parte de la entrada de su sección. */
export function RevealItem({ children }: { children: React.ReactNode; delay?: number }) {
  return <div data-reveal-part>{children}</div>;
}
