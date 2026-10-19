import Link from "next/link";
import { ArrowRight, BadgeCheck, Lock, ShieldCheck, WifiOff } from "lucide-react";
import { SiteFooter, SiteHeader, GooglePlayBadge } from "./components/site-chrome";
import { RevealItem, SectionReveal } from "./components/reveal";
import { InteractivePhoneShowcase } from "./components/landing/hero-showcase";
import { ChatDemo } from "./components/landing/chat-demo";
import { CircleDemo } from "./components/landing/circle-demo";
import { AppTour } from "./components/landing/app-tour";
import { FAQItem, FeatureCard, StepCard } from "./components/landing/cards";
import { FAQS, FEATURES } from "./content/landing";
import { AUDIENCES } from "./content/audiences";
import { JsonLd } from "./components/json-ld";
import { PLAY_URL, SITE_URL } from "./content/site";

const STRUCTURED_DATA = [
  {
    "@context": "https://schema.org",
    "@type": "MobileApplication",
    name: "MedicAI",
    operatingSystem: "Android",
    applicationCategory: "HealthApplication",
    inLanguage: "es",
    url: SITE_URL,
    downloadUrl: PLAY_URL,
    description:
      "Recordatorios de medicamentos y citas médicas, Círculo de cuidado familiar y asistente de IA por voz.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  },
];

export default function Home() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <SectionReveal />
      <SiteHeader />

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
                <GooglePlayBadge />
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

            {/* ── Interactive phone showcase (con demo de alarma) ─────────── */}
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
        <section id="asistente" className="section-alt" data-section-reveal>
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
              <ChatDemo />
            </div>
          </div>
        </section>

        {/* ── CIRCLE ───────────────────────────────────────────────────────── */}
        <section id="circulo" data-section-reveal>
          <div className="container split">
            <div className="split-text">
              <div className="eyebrow">Círculo de cuidado</div>
              <h2 className="font-display">Cuidar sin estar encima</h2>
              <p>
                No hace falta llamar cada mañana para preguntar si ya se tomó la
                pastilla. Si una dosis se pasa, MedicAI te avisa; si todo va bien, no
                te molesta.
              </p>
              <ul className="check-list">
                <li><span><strong>Cada persona decide</strong> qué comparte y con quién, y puede retirarlo cuando quiera.</span></li>
                <li><span><strong>Aviso de dosis olvidada</strong> cuando una toma lleva una hora sin marcarse.</span></li>
                <li><span><strong>Seguimiento de hoy</strong> de todas las personas que cuidas en una sola pantalla.</span></li>
                <li><span><strong>Perfiles sin cuenta</strong> para hijos o adultos mayores que no usan la app.</span></li>
              </ul>
            </div>
            <div className="split-visual">
              <CircleDemo />
            </div>
          </div>
        </section>

        {/* ── AUDIENCES ────────────────────────────────────────────────────── */}
        <section id="para-ti" className="section-alt" data-section-reveal>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Para ti</div>
              <h2 className="font-display">Pensada para cada forma de cuidar</h2>
            </div>
            <div className="audience-grid">
              {AUDIENCES.map((a, i) => (
                <RevealItem key={a.slug} delay={i * 100}>
                  <Link href={`/para/${a.slug}`} className="audience-card">
                    <span className="audience-card-eyebrow">{a.eyebrow}</span>
                    <strong className="font-display">{a.title} {a.highlight}</strong>
                    <span className="audience-card-link">
                      Ver cómo te ayuda <ArrowRight size={16} aria-hidden />
                    </span>
                  </Link>
                </RevealItem>
              ))}
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
                  src="/screenshots/citas.jpg"
                  alt="Citas médicas en MedicAI"
                  title="Agrega medicamentos y citas"
                  description="Tú, o el asistente por ti. La app arma el calendario de tomas y recordatorios."
                />
              </RevealItem>
              <RevealItem delay={200}>
                <StepCard
                  number={3}
                  src="/screenshots/circulo.jpg"
                  alt="Círculo de cuidado en MedicAI"
                  title="Invita a tu círculo"
                  description="Recibe tus alarmas y, si lo eliges, que tu familia se entere cuando una dosis se pasa."
                />
              </RevealItem>
            </div>
          </div>
        </section>

        {/* ── APP TOUR ─────────────────────────────────────────────────────── */}
        <section id="app" className="section-alt" data-section-reveal>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Dentro de la app</div>
              <h2 className="font-display">Una interfaz pensada para la calma, no para la urgencia</h2>
              <p>
                Cuando la salud es el tema, el diseño debe reducir la ansiedad. MedicAI
                usa jerarquía clara, colores tranquilos y gestos simples.
              </p>
            </div>
            <AppTour />
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
        <section id="faq" className="section-alt" data-section-reveal>
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
                  <GooglePlayBadge />
                </div>
                <p className="cta-note">
                  Gratis para Android. ¿Usas iPhone?{" "}
                  <a
                    href="mailto:soporte@medicai.lat?subject=Av%C3%ADsame%20cuando%20MedicAI%20llegue%20a%20iPhone"
                    className="text-link"
                  >
                    Escríbenos y te avisamos
                  </a>
                  .
                </p>
              </div>
            </RevealItem>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
