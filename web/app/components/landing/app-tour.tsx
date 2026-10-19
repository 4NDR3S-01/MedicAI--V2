"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

// Recorrido «Dentro de la app»: en escritorio el teléfono queda fijo (sticky)
// y su pantalla cambia según el capítulo que estás leyendo; en móvil cada
// capítulo muestra su propia captura.
const CHAPTERS = [
  {
    src: "/screenshots/inicio.jpg",
    alt: "Pantalla de inicio de MedicAI",
    eyebrow: "Inicio",
    title: "Tu día de un vistazo",
    text: "Las tomas de hoy, tu próxima cita, el seguimiento de las personas que cuidas y el asistente, todo en la primera pantalla.",
  },
  {
    src: "/screenshots/medicamentos.jpg",
    alt: "Lista de medicamentos en MedicAI",
    eyebrow: "Medicamentos",
    title: "Tu botiquín, ordenado",
    text: "Cada medicamento con su dosis y su horario. Toca una hora para registrar la toma, y pausa los que ya no tomas sin perder su historial.",
  },
  {
    src: "/screenshots/circulo.jpg",
    alt: "Círculo de cuidado en MedicAI",
    eyebrow: "Círculo",
    title: "Las personas que cuidas, juntas",
    text: "Quién te acompaña, a quién acompañas y qué comparte cada uno. Únete con un código y organiza a tu familia en grupos.",
  },
  {
    src: "/screenshots/citas.jpg",
    alt: "Agenda de citas en MedicAI",
    eyebrow: "Citas",
    title: "Tus citas, con todo el detalle",
    text: "Profesional, hora y lugar con «Cómo llegar». Tus próximas citas y el historial, cada uno en su pestaña.",
  },
  {
    // Copia con el correo y el teléfono difuminados (el sitio es público).
    src: "/screenshots/perfil-web.jpg",
    alt: "Perfil en MedicAI",
    eyebrow: "Perfil",
    title: "Tu información, bajo tu control",
    text: "Alergias y condiciones solo si quieres registrarlas, el aviso previo de tus medicamentos y una revisión de que tus alarmas están listas.",
  },
];

export function AppTour() {
  const [active, setActive] = useState(0);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    // Activo = el capítulo que cruza la franja central de la pantalla.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.index));
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    chapterRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="tour">
      <div className="tour-chapters">
        {CHAPTERS.map((c, i) => (
          <article
            key={c.src}
            ref={(el) => { chapterRefs.current[i] = el; }}
            data-index={i}
            className={`tour-chapter ${i === active ? "tour-chapter--active" : ""}`}
          >
            <span className="tour-chapter-num">{String(i + 1).padStart(2, "0")}</span>
            <div className="eyebrow">{c.eyebrow}</div>
            <h3 className="font-display">{c.title}</h3>
            <p>{c.text}</p>
            <div className="tour-inline-phone">
              <div className="phone-frame">
                <div className="phone-notch" />
                <div className="phone-screen">
                  <Image src={c.src} alt={c.alt} fill className="object-cover" sizes="260px" />
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="tour-sticky" aria-hidden>
        <div className="tour-sticky-inner">
          <div className="phone-frame tour-phone">
            <div className="phone-notch" />
            <div className="phone-screen">
              {CHAPTERS.map((c, i) => (
                <div key={c.src} className={`tour-slide ${i === active ? "tour-slide--active" : ""}`}>
                  <Image src={c.src} alt="" fill className="object-cover" sizes="300px" />
                </div>
              ))}
            </div>
          </div>
          <div className="tour-dots">
            {CHAPTERS.map((c, i) => (
              <span key={c.src} className={`tour-dot ${i === active ? "tour-dot--active" : ""}`} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
