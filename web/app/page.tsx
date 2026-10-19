"use client";

import { useState, useRef, useEffect, useCallback, useId } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Home as HomeIcon, Pill, Users, CalendarCheck, User, Menu, X, ShieldCheck, Lock, ChevronDown, Mail,
  Sparkles, Mic, Camera, WifiOff, PackageOpen, Baby, BadgeCheck, CalendarClock, Check,
} from "lucide-react";
import { useInView } from "./hooks/useInView";

// Enlace de la prueba interna de Google Play; cámbialo al de la ficha pública
// cuando la app salga a producción.
const PLAY_URL = "https://play.google.com/apps/internaltest/4701715038985390223";

const NAV_LINKS = [
  { href: "#funciones", label: "Funciones" },
  { href: "#asistente", label: "Asistente" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#faq", label: "Preguntas" },
];

// ─── Module data ─────────────────────────────────────────────────────────────
const MODULES = [
  { label: "Inicio",       Icon: HomeIcon,      src: "/screenshots/Inicio.jpeg",       glow: "rgba(45, 212, 191, 0.35)"  },
  { label: "Medicamentos", Icon: Pill,          src: "/screenshots/Medicamentos.jpeg", glow: "rgba(167, 139, 250, 0.35)" },
  { label: "Círculo",      Icon: Users,         src: "/screenshots/circulo.jpeg",      glow: "rgba(251, 146, 60, 0.35)"  },
  { label: "Citas",        Icon: CalendarCheck, src: "/screenshots/citas.jpeg",        glow: "rgba(96, 165, 250, 0.35)"  },
  { label: "Perfil",       Icon: User,          src: "/screenshots/perfil.jpeg",       glow: "rgba(52, 211, 153, 0.35)"  },
];

const FEATURES = [
  {
    Icon: Pill,
    title: "Medicamentos a tu medida",
    description: "Todos los días, ciertos días de la semana, cada N días o solo cuando lo necesites. Incluso dosis que cambian con el tiempo.",
  },
  {
    Icon: CalendarClock,
    title: "Citas que no se olvidan",
    description: "Agenda consultas, controles que se repiten cada mes y recibe el recordatorio antes de que llegue el día.",
  },
  {
    Icon: Users,
    title: "Círculo de cuidado",
    description: "Comparte con tu familia solo lo que tú elijas y recibe un aviso si alguien que cuidas no marcó su dosis.",
  },
  {
    Icon: Baby,
    title: "Perfiles para quien no usa la app",
    description: "Lleva los medicamentos de tu hijo o de un adulto mayor desde tu teléfono, y entrégale la cuenta cuando esté listo.",
  },
  {
    Icon: PackageOpen,
    title: "Inventario de pastillas",
    description: "MedicAI descuenta cada toma y te avisa cuando quedan pocas, antes de que se acaben.",
  },
  {
    Icon: WifiOff,
    title: "Funciona sin conexión",
    description: "Las alarmas suenan sin internet y las tomas que marques se sincronizan solas cuando vuelvas a tener señal.",
  },
];

const FAQS = [
  {
    q: "¿Es gratuita la aplicación?",
    a: "Sí. MedicAI es gratuita, sin anuncios, e incluye todas sus funciones: recordatorios, citas, Círculo de cuidado y asistente.",
  },
  {
    q: "¿Cómo funciona el Círculo de cuidado?",
    a: "Invitas a un familiar con un enlace y cada uno decide qué comparte con el otro: ver medicamentos, registrar tomas, gestionar citas. Si lo activas, recibes un aviso cuando alguien que cuidas no marca una dosis a tiempo. Puedes cambiar o retirar los permisos cuando quieras.",
  },
  {
    q: "¿Puedo llevar los medicamentos de mi hijo o de mis papás?",
    a: "Sí. Puedes crear un perfil para alguien que no usa la app (por ejemplo, un niño o un adulto mayor) y gestionarlo desde tu teléfono. Cuando esa persona quiera su propia cuenta, se la entregas con un enlace.",
  },
  {
    q: "¿Las alarmas funcionan sin internet?",
    a: "Sí. Las alarmas viven en tu teléfono y suenan aunque no tengas conexión. Las tomas que registres sin señal se guardan y se sincronizan solas al reconectar.",
  },
  {
    q: "¿El asistente reemplaza a mi médico?",
    a: "No. El asistente te ayuda a organizarte y responde dudas generales, pero puede equivocarse y no diagnostica. Antes de cambiar un tratamiento, consulta con tu médico. Ante una emergencia, llama a los servicios de emergencia.",
  },
  {
    q: "¿Están seguros mis datos médicos?",
    a: "Tu información viaja cifrada (HTTPS), las contraseñas se guardan con hash y solo tú y las personas que autorices pueden ver tus datos. Tus datos de salud son opcionales, nunca se venden y puedes descargarlos o pedir que los eliminemos cuando quieras.",
  },
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
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </nav>
          <GooglePlayBadge href={PLAY_URL} className="header-play-badge" />
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
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>{l.label}</a>
            ))}
            <GooglePlayBadge href={PLAY_URL} />
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section className="hero" id="inicio">
          <div className="container hero-grid">
            <div className="hero-text">
              <div className="eyebrow">App de salud familiar</div>
              <h1 className="font-display">
                Tu agenda médica, <span className="gradient-text">siempre presente</span>
              </h1>
              <p>
                MedicAI organiza medicamentos, citas y el cuidado de quienes más
                quieres, con un asistente al que le puedes hablar. Una sola app para
                que nada importante se te pase.
              </p>
              <div className="hero-actions">
                <GooglePlayBadge href={PLAY_URL} />
                <a href="#como-funciona" className="btn btn-ghost">
                  Ver cómo funciona
                </a>
              </div>
              <ul className="hero-trust" aria-label="Lo esencial">
                <li><BadgeCheck size={16} aria-hidden /> Gratis y sin anuncios</li>
                <li><WifiOff size={16} aria-hidden /> Funciona sin conexión</li>
                <li><ShieldCheck size={16} aria-hidden /> Tus datos cifrados</li>
              </ul>
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
                Desde la pastilla de las 8:00 hasta el control del próximo mes,
                para ti y para las personas que cuidas.
              </p>
            </div>
            <div className="feature-grid">
              {FEATURES.map((f, i) => (
                <RevealItem key={f.title} delay={(i % 3) * 100}>
                  <FeatureCard icon={<f.Icon size={20} />} title={f.title} description={f.description} />
                </RevealItem>
              ))}
            </div>
          </div>
        </section>

        {/* ── ASSISTANT ────────────────────────────────────────────────────── */}
        <section id="asistente" className="assistant-section" data-section-reveal>
          <div className="container split reverse">
            <div className="split-text">
              <div className="eyebrow">Asistente con IA</div>
              <h2 className="font-display">Pregúntale como le preguntarías a alguien de confianza</h2>
              <p>
                Escríbele o háblale. El asistente resuelve dudas generales sobre tus
                medicamentos, prepara recordatorios por ti y registra tus tomas, y
                siempre te pide confirmar antes de guardar algo.
              </p>
              <ul className="check-list">
                <li><span><strong>Por voz, manos libres:</strong> &ldquo;Ya me tomé la losartán&rdquo; y queda registrado.</span></li>
                <li><span><strong>Con una foto</strong> de la caja o la receta para cargar el medicamento sin escribir.</span></li>
                <li><span><strong>Conoce tu contexto</strong> (alergias, tratamientos, próximas citas) solo si lo autorizas.</span></li>
                <li><span><strong>Detecta urgencias</strong> y te recuerda llamar a emergencias.</span></li>
              </ul>
              <p className="split-note">
                Es una ayuda para organizarte: no diagnostica ni reemplaza a tu médico.
              </p>
            </div>
            <div className="split-visual">
              <RevealItem>
                <ChatMock />
              </RevealItem>
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
        <section id="como-funciona" data-section-reveal>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Cómo funciona</div>
              <h2 className="font-display">Tres pasos para empezar a cuidar mejor</h2>
              <p>Se configura en minutos y te acompaña durante todo el tratamiento.</p>
            </div>
            <div className="steps">
              <RevealItem delay={0}>
                <StepCard
                  number={1}
                  src="/screenshots/registro.jpeg"
                  alt="Registro en MedicAI"
                  title="Crea tu perfil"
                  description="Regístrate con tu correo y, si quieres, añade alergias y condiciones de salud."
                />
              </RevealItem>
              <RevealItem delay={100}>
                <StepCard
                  number={2}
                  src="/screenshots/citas.jpeg"
                  alt="Citas médicas en MedicAI"
                  title="Agrega medicamentos y citas"
                  description="Tú, o el asistente por ti. La app arma el calendario de tomas y recordatorios."
                />
              </RevealItem>
              <RevealItem delay={200}>
                <StepCard
                  number={3}
                  src="/screenshots/perfil.jpeg"
                  alt="Perfil y notificaciones en MedicAI"
                  title="Invita a tu círculo"
                  description="Recibe tus alarmas y, si lo eliges, que tu familia se entere cuando una dosis se pasa."
                />
              </RevealItem>
            </div>
          </div>
        </section>

        {/* ── APP SECTION ──────────────────────────────────────────────────── */}
        <section id="app" style={{ background: "var(--surface)" }} data-section-reveal>
          <div className="container split">
            <div className="split-text">
              <div className="eyebrow">Dentro de la app</div>
              <h2 className="font-display">Una interfaz pensada para la calma, no para la urgencia</h2>
              <p>
                Cuando la salud es el tema, el diseño debe reducir la ansiedad. MedicAI
                usa jerarquía clara, colores tranquilos y gestos simples.
              </p>
              <ul className="check-list">
                <li>Inicio con los medicamentos y las citas de hoy</li>
                <li>&ldquo;Seguimiento de hoy&rdquo; de cada persona que cuidas</li>
                <li>Alarmas con el nombre y la dosis, aun con el teléfono bloqueado</li>
                <li>Modo claro, oscuro o el de tu teléfono</li>
              </ul>
            </div>
            <div className="split-visual">
              <PhoneScreenshot src="/screenshots/Inicio.jpeg" alt="Pantalla de inicio de MedicAI" />
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
                  <p>Tu información viaja cifrada y solo la ven tú y quienes autorices. Nunca vendemos tus datos ni los usamos para publicidad, y tu perfil de salud solo se comparte con el asistente de IA si lo autorizas. <Link href="/privacidad" className="text-link">Lee nuestra política de privacidad</Link>.</p>
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
              <h2 className="font-display">Preguntas frecuentes</h2>
            </div>
            <div className="faq-list">
              {FAQS.map((f) => (
                <FAQItem key={f.q} q={f.q} a={f.a} />
              ))}
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
                <div className="cta-actions">
                  <GooglePlayBadge href={PLAY_URL} />
                </div>
                <p className="cta-note">Gratis para Android.</p>
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
              <h4>Legal</h4>
              <Link href="/terminos">Términos y condiciones</Link>
              <Link href="/privacidad">Política de privacidad</Link>
            </div>
            <div className="footer-links">
              <h4>Soporte</h4>
              <a href="mailto:soporte@medicai.lat" className="flex items-center gap-2">
                <Mail size={16} /> soporte@medicai.lat
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} MedicAI. MedicAI no reemplaza la atención de un profesional de la salud.</span>
          </div>
        </div>
      </footer>
    </>
  );
}

// ─── Assistant chat mock ─────────────────────────────────────────────────────
// Recreación en HTML de una conversación típica (no hay captura del asistente).
function ChatMock() {
  return (
    <div className="chat-mock" role="img" aria-label="Ejemplo de conversación con el asistente de MedicAI">
      <div className="chat-mock-header">
        <span className="chat-mock-avatar"><Sparkles size={16} /></span>
        <div>
          <strong>Asistente MedicAI</strong>
          <span>En línea</span>
        </div>
      </div>
      <div className="chat-mock-body">
        <div className="chat-bubble chat-bubble--user">
          <Mic size={14} aria-hidden /> Ya me tomé la losartán
        </div>
        <div className="chat-bubble chat-bubble--bot">
          ¡Bien hecho! ¿Registro la toma de las 8:00?
          <div className="chat-proposal">
            <div className="chat-proposal-title">
              <Pill size={16} aria-hidden />
              <div>
                <strong>Losartán 50 mg</strong>
                <span>Hoy · 8:00 · 1 tableta</span>
              </div>
            </div>
            <div className="chat-proposal-actions">
              <span className="chat-btn chat-btn--primary"><Check size={14} aria-hidden /> Registrar</span>
              <span className="chat-btn">Ahora no</span>
            </div>
          </div>
        </div>
        <div className="chat-bubble chat-bubble--user">
          <Camera size={14} aria-hidden /> ¿Y esta receta nueva?
        </div>
        <div className="chat-bubble chat-bubble--bot chat-bubble--typing" aria-hidden>
          <span /><span /><span />
        </div>
      </div>
      <div className="chat-mock-input">
        <span>Escribe o habla…</span>
        <span className="chat-mock-mic"><Mic size={16} /></span>
      </div>
    </div>
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

  const onMouseEnter = () => {
    setHovered(true);
    if (frameRef.current) {
      // Smoothly face front (and settle the scale) before the mouse-parallax
      // takes over on the next mousemove.
      frameRef.current.style.transform =
        "perspective(1100px) rotateY(0deg) rotateX(0deg) scale(1.06)";
    }
  };
  
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
        className={`showcase-phone ${hovered ? "showcase-phone--hovered" : ""}`}
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
      <div className={`module-selector ${hovered ? "module-selector--visible" : ""}`} aria-label="Módulos de la app">
        {MODULES.map((m, i) => (
          <button
            key={m.label}
            aria-pressed={i === activeIdx}
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

      {/* Hint label at bottom — crossfades text depending on interaction */}
      <p className="showcase-hint">
        <span className={`showcase-hint-line ${hovered ? "" : "showcase-hint-line--active"}`}>
          Toca o pasa el cursor sobre el teléfono para explorar
        </span>
        <span className={`showcase-hint-line ${hovered ? "showcase-hint-line--active" : ""}`}>
          Navega entre pantallas
        </span>
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
        className="object-cover object-top"
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


