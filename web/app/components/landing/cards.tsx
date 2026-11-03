"use client";

import { useState, useId } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";

// La entrada de la captura la hace la animación de la sección (reveal.tsx):
// sin JS, la imagen se ve igual.
function MiniScreenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover object-top"
      sizes="(max-width: 768px) 90vw, 280px"
    />
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
export function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <article className="feature-card">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

// ─── Función (elemento de la lista editorial) ────────────────────────────────
export function FeatureItem({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <li className="feature-item">
      <h3>
        {icon}
        {title}
      </h3>
      <p>{description}</p>
    </li>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
export function StepCard({ number, src, alt, title, description }: { number: number; src: string; alt: string; title: string; description: string }) {
  return (
    <article className="step">
      <div className="step-content">
        <div className="step-head">
          <span className="step-number" aria-hidden>{number}</span>
          <h3>{title}</h3>
        </div>
        <p>{description}</p>
      </div>
      <div className="step-mini-phone">
        <MiniScreenshot src={src} alt={alt} />
      </div>
    </article>
  );
}

// ─── FAQ Item (Accordion) ───────────────────────────────────────────────────
// La altura se anima en CSS (grid-template-rows 0fr → 1fr): no hace falta medir.
export function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className={`faq-item ${open ? "faq-item--open" : ""}`}>
      <button
        type="button"
        className="faq-question"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{q}</span>
        <ChevronDown size={20} aria-hidden className={`faq-icon ${open ? "faq-icon--open" : ""}`} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className="faq-answer-wrapper"
      >
        <div className="faq-answer">
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}
