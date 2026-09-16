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
          <a href="#descargar" className="btn btn-primary">
            Descargar app
          </a>
        </div>
      </header>

      <main className="flex-1">
        <section className="hero">
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
                <a href="#descargar" className="btn btn-primary">
                  Descargar gratis
                </a>
                <a href="#como-funciona" className="btn btn-ghost">
                  Ver cómo funciona
                </a>
              </div>
              <div className="hero-meta">
                <div>
                  <strong>3</strong> recordatorios clave
                </div>
                <div>
                  <strong>1</strong> círculo familiar
                </div>
                <div>
                  <strong>0</strong> olvidos críticos
                </div>
              </div>
            </div>
            <div className="hero-visual">
              <PhonePlaceholder label="/web/public/screenshots/Inicio.jpeg" />
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
                  <MiniPlaceholder label="/web/public/screenshots/registro.jpeg" />
                </div>
                <div className="step-content">
                  <h3>Crea tu perfil</h3>
                  <p>Regístrate y añade los datos básicos de salud en menos de dos minutos.</p>
                </div>
              </article>
              <article className="step">
                <span className="step-number">2</span>
                <div className="mini-phone">
                  <MiniPlaceholder label="/web/public/screenshots/Medicamentos.jpeg" />
                </div>
                <div className="step-content">
                  <h3>Agrega recordatorios</h3>
                  <p>Citas, medicamentos y frecuencias. La app se encarga del calendario.</p>
                </div>
              </article>
              <article className="step">
                <span className="step-number">3</span>
                <div className="mini-phone">
                  <MiniPlaceholder label="/web/public/screenshots/perfil.jpeg" />
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
              <PhonePlaceholder label="/web/public/screenshots/Inicio.jpeg" />
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
              <a href="#" className="btn btn-primary">
                Descargar MedicAI
              </a>
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

function PhonePlaceholder({ label }: { label: string }) {
  return (
    <div className="phone-frame">
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="placeholder">
          <ImageIcon />
          <p>{label}</p>
        </div>
      </div>
    </div>
  );
}

function MiniPlaceholder({ label }: { label: string }) {
  return (
    <div className="placeholder">
      <ImageIcon />
      <p>{label}</p>
    </div>
  );
}

function ImageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
