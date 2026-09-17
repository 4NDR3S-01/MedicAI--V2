"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Home as HomeIcon, Pill, Users, CalendarCheck, User, Menu, X, ShieldCheck, Lock, ChevronDown, Mail } from "lucide-react";
import { useInView } from "./hooks/useInView";

// ─── Module data ─────────────────────────────────────────────────────────────
const MODULES = [
  { label: "Inicio",       Icon: HomeIcon,      src: "/screenshots/Inicio.jpeg",       glow: "rgba(45, 212, 191, 0.35)"  },
  { label: "Medicamentos", Icon: Pill,          src: "/screenshots/Medicamentos.jpeg", glow: "rgba(167, 139, 250, 0.35)" },
  { label: "Círculo",      Icon: Users,         src: "/screenshots/circulo.jpeg",      glow: "rgba(251, 146, 60, 0.35)"  },
  { label: "Citas",        Icon: CalendarCheck, src: "/screenshots/citas.jpeg",        glow: "rgba(96, 165, 250, 0.35)"  },
  { label: "Perfil",       Icon: User,          src: "/screenshots/perfil.jpeg",       glow: "rgba(52, 211, 153, 0.35)"  },
];

// ─── Section reveal hook ─────────────────────────────────────────────────────
function useSectionReveal() {
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
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  useSectionReveal();

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
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
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
        <section className="hero" id="inicio">
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
                  icon={<CalendarCheck size={20} />}
                  title="Citas médicas"
                  description="Agrega próximas consultas y recibe recordatorios antes de que llegue el día."
                />
              </RevealItem>
              <RevealItem delay={100}>
                <FeatureCard
                  icon={<Pill size={20} />}
                  title="Medicamentos"
                  description="Horarios, dosis y duración del tratamiento, con alertas en el momento exacto."
                />
              </RevealItem>
              <RevealItem delay={200}>
                <FeatureCard
                  icon={<Users size={20} />}
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

        {/* ── SECURITY BANNER ────────────────────────────────────────────────── */}
        <section className="security-banner" data-section-reveal>
          <div className="container">
            <RevealItem>
              <div className="security-banner-inner">
                <ShieldCheck size={32} strokeWidth={1.5} className="security-icon" />
                <div>
                  <h3>Tu salud, tus datos, tu privacidad</h3>
                  <p>Toda la información médica está encriptada y solo es visible para ti y tu círculo familiar autorizado. No compartimos tus datos con terceros.</p>
                </div>
                <Lock size={32} strokeWidth={1.5} className="security-icon security-icon--lock" />
              </div>
            </RevealItem>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────────── */}
        <section id="faq" data-section-reveal style={{ background: "var(--surface)" }}>
          <div className="container faq-container">
            <div className="section-header">
              <div className="eyebrow">Dudas comunes</div>
              <h2 className="font-display">Preguntas Frecuentes</h2>
            </div>
            <div className="faq-list">
              <FAQItem 
                q="¿Es gratuita la aplicación?" 
                a="Sí, MedicAI ofrece un plan gratuito que incluye recordatorios de medicamentos y citas para un paciente. Contamos con un plan premium para círculos familiares amplios." 
              />
              <FAQItem 
                q="¿Cómo funciona el círculo familiar?" 
                a="Puedes invitar a familiares a tu círculo. Ellos recibirán una notificación (si la configuras) en caso de que olvides marcar una pastilla como 'tomada', asegurando que alguien siempre esté pendiente." 
              />
              <FAQItem 
                q="¿Están seguros mis datos médicos?" 
                a="Totalmente. Utilizamos estándares de seguridad de nivel bancario (AES-256) para encriptar tu información médica tanto en reposo como en tránsito." 
              />
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
          <div className="footer-top">
            <div className="footer-brand">
              <a href="#" className="logo" aria-label="MedicAI inicio">
                Medic<span>AI</span>
              </a>
              <p>El organizador médico diseñado para la tranquilidad familiar.</p>
            </div>
            <div className="footer-links">
              <h4>Compañía</h4>
              <a href="#">Términos y Condiciones</a>
              <a href="#">Política de Privacidad</a>
            </div>
            <div className="footer-links">
              <h4>Soporte</h4>
              <a href="mailto:soporte@medicai.lat" className="flex items-center gap-2">
                <Mail size={16} /> soporte@medicai.lat
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} MedicAI. Todos los derechos reservados.</span>
          </div>
        </div>
      </footer>
    </>
  );
}

// ─── Interactive Phone Showcase (Hero) ───────────────────────────────────────
function InteractivePhoneShowcase() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const frameRef   = useRef<HTMLDivElement>(null);
  const dimRef     = useRef<HTMLDivElement>(null);
  const flashRef   = useRef<HTMLDivElement>(null);

  // Which module is active
  const [activeIdx, setActiveIdx]   = useState(0);
  const [prevIdx, setPrevIdx]       = useState<number | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  // Hover state
  const [hovered, setHovered]   = useState(false);

  // Auto-cycle modules every 3 s when not hovered
  useEffect(() => {
    if (hovered) return;
    const id = setInterval(() => {
      setActiveIdx(i => (i + 1) % MODULES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [hovered]);

  // Scroll dim effect (optimized with rAF)
  useEffect(() => {
    let ticking = false;
    let prevBrightness = 1;
    let flashTimeout: NodeJS.Timeout;

    const updateScroll = () => {
      const el = wrapperRef.current;
      const dimEl = dimRef.current;
      const flashEl = flashRef.current;
      
      if (!el || !dimEl) {
        ticking = false;
        return;
      }
      
      const rect = el.getBoundingClientRect();
      const vh   = window.innerHeight;
      // Goes dark as the phone scrolls away (bottom leaves view)
      const raw  = rect.bottom / vh;           // 1 = still fully visible, 0 = gone
      const brightness = Math.min(1, Math.max(0.08, raw * 1.1));
      
      // Update DOM directly to avoid re-renders
      dimEl.style.opacity = (1 - brightness).toString();

      // Screen wake flash logic
      if (prevBrightness < 0.5 && brightness >= 0.5 && flashEl) {
        flashEl.classList.add("screen-wake-flash--on");
        clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => {
          if (flashEl) flashEl.classList.remove("screen-wake-flash--on");
        }, 350);
      }
      prevBrightness = brightness;
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updateScroll);
        ticking = true;
      }
    };
    
    window.addEventListener("scroll", onScroll, { passive: true });
    updateScroll();
    
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(flashTimeout);
    };
  }, []);

  // Mouse parallax (optimized by directly updating transform)
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!frameRef.current || !wrapperRef.current) return;
    
    const rect = wrapperRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const x  = (e.clientX - cx) / (rect.width  / 2);   // -1 … 1
    const y  = (e.clientY - cy) / (rect.height / 2);
    
    const rotateY = x * 8;
    const rotateX = -y * 6;
    const scale   = 1.06;
    
    frameRef.current.style.transform = `perspective(1100px) rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(${scale})`;
  }, []);

  const onMouseEnter = () => setHovered(true);
  
  const onMouseLeave = () => {
    setHovered(false);
    if (frameRef.current) {
      // Revert to CSS default animation transform
      frameRef.current.style.transform = '';
    }
  };
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
      onMouseEnter={onMouseEnter}
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
            ref={dimRef}
            style={{ opacity: 0 }}
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

          {/* Screen-wake flash */}
          <div ref={flashRef} className="screen-wake-flash" />
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
            <span className="module-pill-icon"><m.Icon /></span>
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
    <div ref={ref} className={`phone-wrapper ${inView ? "phone-wrapper--in-view" : ""}`}>
      <div className="phone-frame">
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

// ─── FAQ Item (Accordion) ───────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  
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
      >
        <span>{q}</span>
        <ChevronDown size={20} className={`faq-icon ${open ? "faq-icon--open" : ""}`} />
      </button>
      <div 
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


