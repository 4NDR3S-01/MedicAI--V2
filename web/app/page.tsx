import Image from "next/image";

export default function Home() {
  return (
    <>
      <header>
        <div className="container header-inner">
          <a href="#" className="logo">
            Medic<span>AI</span>
          </a>
          <nav className="nav-links">
            <a href="#funciones">Funciones</a>
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#app">La app</a>
          </nav>
          <a
            href="https://play.google.com/apps/internaltest/4701715038985390223"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            Descargar
          </a>
        </div>
      </header>

      <main className="flex-1">
        <section className="hero">
          <div className="bubble" style={{ width: 120, height: 120, top: '10%', left: '5%' }} />
          <div className="bubble" style={{ width: 80, height: 80, top: '40%', right: '8%', animationDelay: '1s' }} />
          <div className="bubble" style={{ width: 180, height: 180, bottom: '5%', left: '20%', animationDelay: '2s' }} />
          <div className="bubble" style={{ width: 60, height: 60, top: '20%', right: '25%', animationDelay: '0.5s' }} />
          <div className="bubble" style={{ width: 140, height: 140, bottom: '15%', right: '35%', animationDelay: '3s' }} />
          <div className="container hero-grid">
            <div className="hero-text">
              <div className="eyebrow">App de salud familiar</div>
              <h1 className="font-display">
                Tu agenda médica, <em>siempre presente</em>
              </h1>
              <p>
                MedicAI organiza citas, medicamentos y el cuidado de quienes más quieres. Una sola
                app para que nada importante se te pase.
              </p>
              <div className="hero-actions">
                <GooglePlayBadge href="https://play.google.com/apps/internaltest/4701715038985390223" />
                <a href="#como-funciona" className="btn btn-ghost">
                  Ver cómo funciona
                </a>
              </div>
              <div className="hero-meta">
                <p>
                  Diseñada para familias y profesionales de la salud que necesitan una herramienta
                  confiable, segura y siempre a la mano.
                </p>
              </div>
            </div>
            <div className="hero-visual">
              <PhoneScreenshot src="/screenshots/Inicio.jpeg" alt="Pantalla de inicio de MedicAI" />
            </div>
          </div>
        </section>

        <section id="funciones">
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Funciones</div>
              <h2 className="font-display">
                Todo lo que necesitas para cuidar la salud del día a día
              </h2>
              <p>
                Tres funciones conectadas que reducen la fricción entre el médico, la receta y la
                familia.
              </p>
            </div>
            <div className="feature-grid">
              <article className="feature-card">
                <div className="icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8 2v4" />
                    <path d="M16 2v4" />
                    <rect width="18" height="18" x="3" y="4" rx="2" />
                    <path d="M3 10h18" />
                    <path d="m9 16 2 2 4-4" />
                  </svg>
                </div>
                <h3>Citas médicas</h3>
                <p>Agrega próximas consultas y recibe recordatorios antes de que llegue el día.</p>
              </article>
              <article className="feature-card">
                <div className="icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m18.4 11.5-5.7-5.7a1.93 1.93 0 0 0-2.8 0L4 11.8V20h5.5v-6h5v6H20v-8.4Z" />
                    <path d="M10 22V12h4v10" />
                  </svg>
                </div>
                <h3>Medicamentos</h3>
                <p>
                  Horarios, dosis y duración del tratamiento, con alertas en el momento exacto.
                </p>
              </article>
              <article className="feature-card">
                <div className="icon">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3>Círculo familiar</h3>
                <p>Coordina el cuidado entre familiares para que nadie esté solo en su tratamiento.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="como-funciona" style={{ background: "var(--surface)" }}>
          <div className="container">
            <div className="section-header">
              <div className="eyebrow">Cómo funciona</div>
              <h2 className="font-display">Tres pasos para empezar a cuidar mejor</h2>
              <p>La app está pensada para que la configuren en minutos y la usen durante meses.</p>
            </div>
            <div className="steps">
              <article className="step">
                <span className="step-number">1</span>
                <div className="mini-phone">
                  <MiniScreenshot src="/screenshots/registro.jpeg" alt="Registro en MedicAI" />
                </div>
                <div className="step-content">
                  <h3>Crea tu perfil</h3>
                  <p>Regístrate y añade los datos básicos de salud en menos de dos minutos.</p>
                </div>
              </article>
              <article className="step">
                <span className="step-number">2</span>
                <div className="mini-phone">
                  <MiniScreenshot src="/screenshots/Medicamentos.jpeg" alt="Recordatorios de medicamentos en MedicAI" />
                </div>
                <div className="step-content">
                  <h3>Agrega recordatorios</h3>
                  <p>Citas, medicamentos y frecuencias. La app se encarga del calendario.</p>
                </div>
              </article>
              <article className="step">
                <span className="step-number">3</span>
                <div className="mini-phone">
                  <MiniScreenshot src="/screenshots/perfil.jpeg" alt="Perfil y círculo familiar en MedicAI" />
                </div>
                <div className="step-content">
                  <h3>Recibe alertas</h3>
                  <p>
                    Notificaciones oportunas para ti y avisos automáticos a tu círculo de cuidado.
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="app">
          <div className="container split">
            <div className="split-text">
              <div className="eyebrow">Dentro de la app</div>
              <h2 className="font-display">Una interfaz pensada para la calma, no para la urgencia</h2>
              <p>
                Cuando la salud es el tema, el diseño debe reducir la ansiedad. MedicAI usa
                jerarquía clara, colores tranquilos y gestos simples.
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

        <section className="cta-section" id="descargar">
          <div className="container">
            <div className="cta-card">
              <h2 className="font-display">Empieza a cuidar lo importante hoy</h2>
              <p>
                Descarga MedicAI y deja que la tecnología te ayude a nunca perder de vista la salud
                de tu familia.
              </p>
              <GooglePlayBadge href="https://play.google.com/apps/internaltest/4701715038985390223" />
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="container footer-inner">
          <span className="logo">
            Medic<span>AI</span>
          </span>
          <span>© 2026 MedicAI. Todos los derechos reservados.</span>
        </div>
      </footer>
    </>
  );
}

function PhoneScreenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="phone-frame">
      <div className="phone-notch" />
      <div className="phone-screen">
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 90vw, 320px"
          priority
        />
      </div>
    </div>
  );
}

function MiniScreenshot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mini-phone">
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

function GooglePlayBadge({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="play-badge"
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
