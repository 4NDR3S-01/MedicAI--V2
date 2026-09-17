"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useInView } from "./hooks/useInView";

const MODULES = [
  { label: "Citas", icon: "📅", top: "-15%", left: "-20%" },
  { label: "Medicamentos", icon: "💊", top: "5%", right: "-25%" },
  { label: "Familiar", icon: "👥", bottom: "10%", left: "-18%" },
  { label: "Perfil", icon: "⚙️", bottom: "-12%", right: "-15%" },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const heroPhoneRef = useRef<HTMLDivElement>(null);
  const [heroPhoneFocused, setHeroPhoneFocused] = useState(false);

  useEffect(() => {
    const el = heroPhoneRef.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const heroHeight = window.innerHeight;
      setHeroPhoneFocused(rect.top < heroHeight * 0.8 && rect.bottom > 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header>
        <div className="container header-inner">
          <a href="#" className="logo" aria-label="MedicAI inicio">
            Medic<span>AI</span>
          </a>
          <nav className="nav-links" aria-label="Navegación principal">
            <a href="#funciones">Funciones</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#app">La app</a>
          </nav>
          <GooglePlayBadge
            href="https://play.google.com/apps/internaltest/4701715038985390223"
            className="header-play-badge"
          />
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {menuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            )}
          </button>
          <nav
            id="mobile-nav"
            className={`mobile-nav ${menuOpen ? "open" : ""}`}
            aria-label="Menú móvil"
          >
            <a href="#funciones" onClick={() => setMenuOpen(false)}>Funciones</a>
            <a href="#como-funciona" onClick={() => setMenuOpen(false)}>Cómo funciona</a>
            <a href="#app" onClick={() => setMenuOpen(false)}>La app</a>
            <GooglePlayBadge
              href="https://play.google.com/apps/internaltest/4701715038985390223"
            />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="hero" id="inicio" data-section-reveal>
          <div className="bubble" style={{ width: 120, height: 120, top: "10%", left: "5%" }} />
          <div className="bubble" style={{ width: 80, height: 80, top: "40%", right: "8%", animationDelay: "1s" }} />
          <div className="bubble" style={{ width: 180, height: 180, bottom: "5%", left: "20%", animationDelay: "2s" }} />
          <div className="bubble" style={{ width: 60, height: 60, top: "20%", right: "25%", animationDelay: "0.5s" }} />
          <div className="bubble" style={{ width: 140, height: 140, bottom: "15%", right: "35%", animationDelay: "3s" }} />
          <div className="container hero-grid">
            <div className="hero-text">
              <div className="eyebrow">App de salud familiar</div>
              <h1 className="font-display">
                Tu agenda médica, <em>siempre presente</em>
              </h1>
              <p>
                MedicAI organiza citas, medicamentos y el cuidado de quienes más
                quieres. Una sola app para que nada importante se te pase.
              </p>
              <div className="hero-actions">
                <GooglePlayBadge href="https://play.google.com/apps/internaltest/4701715038985390223" />
                <a href="#como-funciona" className="btn btn-ghost">
                  Ver cómo funciona
                </a>
              </div>
              <div className="hero-meta">
                <p>
                  Diseñada para familias y profesionales de la salud que
                  necesitan una herramienta confiable, segura y siempre a la
                  mano.
                </p>
              </div>
            </div>
            <div className={`hero-visual ${heroPhoneFocused ? "hero-visual--focused" : ""}`} ref={heroPhoneRef}>
              <PhoneScreenshot src="/screenshots/Inicio.jpeg" alt="Pantalla de inicio de MedicAI" />
              <HoverModules />
            </div>
          </div>
        </section>

        <section id="funciones" data-section-reveal>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Funciones</div>
              <h2 className="font-display">
                Todo lo que necesitas para cuidar la salud del día a día
              </h2>
              <p>
                Tres funciones conectadas que reducen la fricción entre el médico,
                la receta y la familia.
              </p>
            </div>
            <div className="feature-grid">
              <RevealItem delay={0}>
                <FeatureCard
                  icon={<CalendarIcon />}
                  title="Citas médicas"
                  description="Agrega próximas consultas y recibe recordatorios antes de que llegue el día."
                />
              </RevealItem>
              <RevealItem delay={100}>
                <FeatureCard
                  icon={<PillIcon />}
                  title="Medicamentos"
                  description="Horarios, dosis y duración del tratamiento, con alertas en el momento exacto."
                />
              </RevealItem>
              <RevealItem delay={200}>
                <FeatureCard
                  icon={<UsersIcon />}
                  title="Círculo familiar"
                  description="Coordina el cuidado entre familiares para que nadie esté solo en su tratamiento."
                />
              </RevealItem>
            </div>
          </div>
        </section>

        <section id="como-funciona" style={{ background: "var(--surface)" }} data-section-reveal>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Cómo funciona</div>
              <h2 className="font-display">Tres pasos para empezar a cuidar mejor</h2>
              <p>La app está pensada para que la configuren en minutos y la usen durante meses.</p>
            </div>
            <div className="steps">
              <RevealItem delay={0}>
                <StepCard
                  number={1}
                  src="/screenshots/registro.jpeg"
                  alt="Registro en MedicAI"
                  title="Crea tu perfil"
                  description="Regístrate y añade los datos básicos de salud en menos de dos minutos."
                />
              </RevealItem>
              <RevealItem delay={100}>
                <StepCard
                  number={2}
                  src="/screenshots/Medicamentos.jpeg"
                  alt="Recordatorios de medicamentos en MedicAI"
                  title="Agrega recordatorios"
                  description="Citas, medicamentos y frecuencias. La app se encarga del calendario."
                />
              </RevealItem>
              <RevealItem delay={200}>
                <StepCard
                  number={3}
                  src="/screenshots/perfil.jpeg"
                  alt="Perfil y círculo familiar en MedicAI"
                  title="Recibe alertas"
                  description="Notificaciones oportunas para ti y avisos automáticos a tu círculo de cuidado."
                />
              </RevealItem>
            </div>
          </div>
        </section>

        <section id="app" data-section-reveal>
          <div className="container split">
            <div className="split-text">
              <div className="eyebrow">Dentro de la app</div>
              <h2 className="font-display">Una interfaz pensada para la calma, no para la urgencia</h2>
              <p>
                Cuando la salud es el tema, el diseño debe reducir la ansiedad. MedicAI
                usa jerarquía clara, colores tranquilos y gestos simples.
              </p>
              <ul className="check-list">
                <li>Dashboard con próximas citas y medicamentos del día</li>
                <li>Acceso directo a cada miembro del círculo familiar</li>
                <li>Historial médico ordenado por fecha y tipo</li>
                <li>Modo oscuro y claro automáticos</li>
              </ul>
            </div>
            <div className="split-visual">
              <PhoneScreenshot src="/screenshots/Inicio.jpeg" alt="Dashboard de MedicAI" />
              <HoverModules />
            </div>
          </div>
        </section>

        <section className="cta-section" id="descargar" data-section-reveal>
          <div className="container">
            <RevealItem>
              <div className="cta-card">
                <h2 className="font-display">Empieza a cuidar lo importante hoy</h2>
                <p>
                  Descarga MedicAI y deja que la tecnología te ayude a nunca perder de
                  vista la salud de tu familia.
                </p>
                <GooglePlayBadge href="https://play.google.com/apps/internaltest/4701715038985390223" />
              </div>
            </RevealItem>
          </div>
        </section>
      </main>

      <footer>
        <div className="container footer-inner">
          <a href="#" className="logo" aria-label="MedicAI inicio">
            Medic<span>AI</span>
          </a>
          <span>© 2026 MedicAI. Todos los derechos reservados.</span>
        </div>
      </footer>
    </>
  );
}

function RevealItem({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
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

function HoverModules() {
  const [hovered, setHovered] = useState(false);
  return (
    <>
      <div
        className={`modules-overlay ${hovered ? "modules-overlay--visible" : ""}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {MODULES.map((m) => (
          <span
            key={m.label}
            className="module-chip"
            style={{
              ...(m.top ? { top: m.top } : {}),
              ...(m.bottom ? { bottom: m.bottom } : {}),
              ...(m.left ? { left: m.left } : {}),
              ...(m.right ? { right: m.right } : {}),
            }}
          >
            <span className="module-chip-icon">{m.icon}</span>
            <span className="module-chip-label">{m.label}</span>
          </span>
        ))}
      </div>
      <div className={`phone-hover-ring ${hovered ? "phone-hover-ring--visible" : ""}`} />
    </>
  );
}

function PhoneScreenshot({ src, alt }: { src: string; alt: string }) {
  const [ref, inView] = useInView({ threshold: 0.15 });
  const [loaded, setLoaded] = useState(false);

  return (
    <div ref={ref} className="phone-wrapper">
      <div className={`phone-frame ${inView ? "phone-frame--in-view" : ""}`}>
        {!loaded && (
          <div className="phone-shimmer">
            <div className="phone-shimmer-bar" />
          </div>
        )}
        <div className="phone-notch" />
        <div className="phone-screen">
          <Image
            src={src}
            alt={alt}
            fill
            className={`object-cover phone-img ${loaded ? "phone-img--loaded" : ""}`}
            sizes="(max-width: 768px) 90vw, 320px"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </div>
    </div>
  );
}

function MiniScreenshot({ src, alt }: { src: string; alt: string }) {
  const [ref, inView] = useInView({ threshold: 0.15 });

  return (
    <div ref={ref} className={`mini-phone ${inView ? "mini-phone--in-view" : ""}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 90vw, 280px"
      />
    </div>
  );
}

function GooglePlayBadge({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`play-badge ${className}`}
      aria-label="Disponible en Google Play"
    >
      <Image
        src="/images/google-play-badge.png"
        alt="Disponible en Google Play"
        width={161}
        height={62}
        className="play-badge-img"
      />
    </a>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <article className="feature-card">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

function StepCard({
  number,
  src,
  alt,
  title,
  description,
}: {
  number: number;
  src: string;
  alt: string;
  title: string;
  description: string;
}) {
  return (
    <article className="step">
      <span className="step-number">{number}</span>
      <div className="mini-phone">
        <MiniScreenshot src={src} alt={alt} />
      </div>
      <div className="step-content">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
}

function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}

function PillIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18.4 11.5-5.7-5.7a1.93 1.93 0 0 0-2.8 0L4 11.8V20h5.5v-6h5v6H20v-8.4Z" />
      <path d="M10 22V12h4v10" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
