"use client";

import { useState, useRef, useEffect, useId } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import { useInView } from "../../hooks/useInView";

function MiniScreenshot({ src, alt }: { src: string; alt: string }) {
  const [ref, inView] = useInView({ threshold: 0.15 });
  return (
    <div ref={ref} className={`mini-phone-inner ${inView ? "mini-phone--in-view" : ""}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover object-top"
        sizes="(max-width: 768px) 90vw, 280px"
      />
    </div>
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

// ─── Step card ────────────────────────────────────────────────────────────────
export function StepCard({ number, src, alt, title, description }: { number: number; src: string; alt: string; title: string; description: string }) {
  return (
    <article className="step">
      <span className="step-number">{number}</span>
      <div className="step-mini-phone">
        <MiniScreenshot src={src} alt={alt} />
      </div>
      <div className="step-content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
}

// ─── FAQ Item (Accordion) ───────────────────────────────────────────────────
export function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (open && contentRef.current) {
      setHeight(contentRef.current.scrollHeight);
    } else {
      setHeight(0);
    }
  }, [open]);

  return (
    <div className={`faq-item ${open ? "faq-item--open" : ""}`}>
      <button
        className="faq-question"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span>{q}</span>
        <ChevronDown size={20} className={`faq-icon ${open ? "faq-icon--open" : ""}`} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className="faq-answer-wrapper"
        style={{
          maxHeight: `${height}px`,
          opacity: open ? 1 : 0
        }}
      >
        <div className="faq-answer" ref={contentRef}>
          <p>{a}</p>
        </div>
      </div>
    </div>
  );
}
