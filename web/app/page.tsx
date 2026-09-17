"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { useInView } from "./hooks/useInView";

// ─── Module data ─────────────────────────────────────────────────────────────
const MODULES = [
  { label: "Inicio",       icon: "🏠", src: "/screenshots/Inicio.jpeg",       glow: "rgba(45, 212, 191, 0.35)" },
  { label: "Citas",        icon: "📅", src: "/screenshots/citas.jpeg",        glow: "rgba(96, 165, 250, 0.35)" },
  { label: "Medicamentos", icon: "💊", src: "/screenshots/Medicamentos.jpeg", glow: "rgba(167, 139, 250, 0.35)" },
  { label: "Círculo",      icon: "👥", src: "/screenshots/circulo.jpeg",      glow: "rgba(251, 146, 60, 0.35)"  },
  { label: "Perfil",       icon: "⚙️", src: "/screenshots/perfil.jpeg",       glow: "rgba(52, 211, 153, 0.35)" },
];

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

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
            <GooglePlayBadge href="https://play.google.com/apps/internaltest/4701715038985390223" />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
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
                  necesitan una herramienta confiable, segura y siempre a la mano.
                </p>
              </div>
            </div>

            {/* ── Interactive phone showcase ──────────────────────────────── */}
            <InteractivePhoneShowcase />
          </div>
        </section>

        {/* ── FEATURES ─────────────────────────────────────────────────────── */}
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

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
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

        {/* ── APP SECTION ──────────────────────────────────────────────────── */}
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
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
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

// ─── Interactive Phone Showcase (Hero) ───────────────────────────────────────
function InteractivePhoneShowcase() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef   = useRef<HTMLDivElement>(null);

  // Which module is active
  const [activeIdx, setActiveIdx]   = useState(0);
  const [prevIdx, setPrevIdx]       = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Hover state
  const [hovered, setHovered]   = useState(false);
  const [mouseXY, setMouseXY]   = useState({ x: 0, y: 0 });

  // Scroll-driven screen dim
  const [screenBrightness, setScreenBrightness] = useState(1);

  // Auto-cycle modules every 3 s when not hovered
  useEffect(() => {
    if (hovered) return;
    const id = setInterval(() => {
      setActiveIdx(i => (i + 1) % MODULES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [hovered]);

  // Scroll dim effect
  useEffect(() => {
    const onScroll = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh   = window.innerHeight;
      // Goes dark as the phone scrolls away (bottom leaves view)
      const raw  = rect.bottom / vh;           // 1 = still fully visible, 0 = gone
      const brightness = Math.min(1, Math.max(0.08, raw * 1.1));
      setScreenBrightness(brightness);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Mouse parallax
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const x  = (e.clientX - cx) / (rect.width  / 2);   // -1 … 1
    const y  = (e.clientY - cy) / (rect.height / 2);
    setMouseXY({ x, y });
  }, []);

  const onMouseLeave = () => {
    setHovered(false);
    setMouseXY({ x: 0, y: 0 });
  };

  // 3-D transform string
  const rotateY = hovered ? mouseXY.x * 8   : -12;
  const rotateX = hovered ? -mouseXY.y * 6  : 4;
  const scale   = hovered ? 1.06 : 1;
  const transform3d = `perspective(1100px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`;

  // Glow color
  const glowColor = MODULES[activeIdx].glow;

  // Module switch with fade transition
  const switchModule = (idx: number) => {
    if (idx === activeIdx || transitioning) return;
    setPrevIdx(activeIdx);
    setTransitioning(true);
    setTimeout(() => {
      setActiveIdx(idx);
      setTransitioning(false);
      setPrevIdx(null);
    }, 280);
  };

  return (
    <div
      className="hero-visual showcase-wrapper"
      ref={wrapperRef}
      onMouseEnter={() => setHovered(true)}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      aria-label="Vista previa interactiva de MedicAI"
    >
      {/* Ambient glow — changes colour per module */}
      <div
        className="showcase-glow"
        style={{ background: `radial-gradient(ellipse at center, ${glowColor}, transparent 65%)` }}
      />

      {/* Phone frame */}
      <div
        ref={frameRef}
        className="showcase-phone"
        style={{ transform: transform3d }}
      >
        {/* Glass reflection layer */}
        <div className="showcase-glass-reflect" />

        {/* Notch */}
        <div className="phone-notch" />

        {/* Screen area with dimming overlay */}
        <div className="phone-screen showcase-screen">
          {/* Screen-off overlay */}
          <div
            className="showcase-dim"
            style={{ opacity: 1 - screenBrightness }}
          />

          {/* Slides */}
          {MODULES.map((m, i) => (
            <div
              key={m.label}
              className={`showcase-slide ${
                i === activeIdx && !transitioning
                  ? "showcase-slide--active"
                  : i === prevIdx
                  ? "showcase-slide--leaving"
                  : ""
              }`}
            >
              <Image
                src={m.src}
                alt={`Módulo ${m.label} de MedicAI`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 90vw, 320px"
                priority={i === 0}
              />
            </div>
          ))}

          {/* Screen-wake flash when brightness goes from low → high */}
          <ScreenWakeFlash brightness={screenBrightness} />
        </div>
      </div>

      {/* Module selector pills */}
      <div className={`module-selector ${hovered ? "module-selector--visible" : ""}`} role="tablist" aria-label="Módulos de la app">
        {MODULES.map((m, i) => (
          <button
            key={m.label}
            role="tab"
            aria-selected={i === activeIdx}
            aria-label={`Ver módulo ${m.label}`}
            className={`module-pill ${i === activeIdx ? "module-pill--active" : ""}`}
            style={i === activeIdx ? { boxShadow: `0 0 16px ${glowColor}` } : {}}
            onClick={() => switchModule(i)}
          >
            <span className="module-pill-icon">{m.icon}</span>
            <span className="module-pill-label">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Hint label at bottom */}
      <p className={`showcase-hint ${hovered ? "showcase-hint--visible" : ""}`}>
        Pasa el cursor o toca para explorar
      </p>
    </div>
  );
}

/** Flashes the screen white briefly when it "wakes up" (brightness crosses 0.5 going up) */
function ScreenWakeFlash({ brightness }: { brightness: number }) {
  const prev = useRef(brightness);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (prev.current < 0.5 && brightness >= 0.5) {
      setFlashing(true);
      const id = setTimeout(() => setFlashing(false), 350);
      return () => clearTimeout(id);
    }
    prev.current = brightness;
  }, [brightness]);

  return <div className={`screen-wake-flash ${flashing ? "screen-wake-flash--on" : ""}`} />;
}

// ─── Reveal wrapper ───────────────────────────────────────────────────────────
function RevealItem({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
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

// ─── PhoneScreenshot (used in split / steps) ─────────────────────────────────
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
    <div ref={ref} className={`mini-phone-inner ${inView ? "mini-phone--in-view" : ""}`}>
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

// ─── Google Play badge ────────────────────────────────────────────────────────
function GooglePlayBadge({ href, className = "" }: { href: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`play-badge ${className}`} aria-label="Disponible en Google Play">
      <Image src="/images/google-play-badge.png" alt="Disponible en Google Play" width={161} height={62} className="play-badge-img" />
    </a>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <article className="feature-card">
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function StepCard({ number, src, alt, title, description }: { number: number; src: string; alt: string; title: string; description: string }) {
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

// ─── Icons ────────────────────────────────────────────────────────────────────
function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4" /><path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" /><path d="m9 16 2 2 4-4" />
    </svg>
  );
}

function PillIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
      <path d="M8.5 8.5 16 16" />
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
