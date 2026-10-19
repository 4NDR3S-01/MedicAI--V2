"use client";

import { useEffect } from "react";
import { useInView } from "../hooks/useInView";

/**
 * Activa la animación de entrada de todas las secciones con `data-section-reveal`.
 * Se monta una vez por página (las páginas son componentes de servidor).
 */
export function SectionReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-section-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("section-reveal--visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}

export function RevealItem({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [ref, inView] = useInView({ threshold: 0.12 });
  return (
    <div
      ref={ref}
      className={`reveal-item ${inView ? "reveal-item--visible" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
