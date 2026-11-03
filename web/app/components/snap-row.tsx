"use client";

import { Children, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Distancia de una tarjeta (ancho + separación) dentro de la fila. */
function cardStep(row: HTMLElement | null) {
  const first = row?.firstElementChild as HTMLElement | null;
  if (!row || !first) return 0;
  return first.getBoundingClientRect().width + parseFloat(getComputedStyle(row).columnGap || "0");
}

/**
 * Fila con scroll horizontal nativo y ajuste por tarjeta (en móvil). En
 * pantallas grandes el CSS la vuelve una cuadrícula normal (`.snap-row`).
 *
 * Debajo lleva los controles: ‹ puntos › — los botones avisan que hay más
 * contenido a los lados y mueven una tarjeta; se desactivan en los extremos.
 * La fila es enfocable y tiene nombre: con teclado se recorre con las flechas.
 */
export function SnapRow({
  as: Tag = "div",
  className = "",
  wrapClassName = "",
  label,
  children,
}: {
  as?: "div" | "ol";
  className?: string;
  wrapClassName?: string;
  label: string;
  children: React.ReactNode;
}) {
  const rowRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const count = Children.count(children);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const s = cardStep(row);
      if (!s) return;
      setActive(Math.min(count - 1, Math.max(0, Math.round(row.scrollLeft / s))));
      setAtStart(row.scrollLeft <= 4);
      setAtEnd(row.scrollLeft + row.clientWidth >= row.scrollWidth - 4);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    row.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      row.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [count]);

  const move = (dir: 1 | -1) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rowRef.current?.scrollBy({ left: dir * cardStep(rowRef.current), behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={wrapClassName}>
      <Tag
        ref={rowRef as React.Ref<never>}
        className={`snap-row ${className}`}
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </Tag>
      <div className="snap-controls">
        <button
          type="button"
          className="snap-arrow"
          onClick={() => move(-1)}
          disabled={atStart}
          aria-label="Ver anterior"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <div className="snap-dots" aria-hidden>
          {Array.from({ length: count }, (_, i) => (
            <span key={i} className={`snap-dot ${i === active ? "snap-dot--active" : ""}`} />
          ))}
        </div>
        <button
          type="button"
          className="snap-arrow"
          onClick={() => move(1)}
          disabled={atEnd}
          aria-label="Ver siguiente"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>
    </div>
  );
}
