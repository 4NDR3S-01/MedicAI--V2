"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mail, Menu, X } from "lucide-react";
import { AUDIENCES } from "../content/audiences";
import { PLAY_URL, SUPPORT_EMAIL, TEXT_SIZE_KEY } from "../content/site";


const NAV_LINKS = [
  { hash: "#funciones", label: "Funciones" },
  { hash: "#asistente", label: "Asistente" },
  { hash: "#circulo", label: "Círculo" },
  { hash: "#faq", label: "Preguntas" },
];

export function GooglePlayBadge({ className = "" }: { className?: string }) {
  return (
    <a
      href={PLAY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`play-badge ${className}`}
      aria-label="Disponible en Google Play"
      // Lo cuenta la analítica (Umami) si está configurada; si no, no hace nada.
      data-umami-event="descargar-google-play"
    >
      <Image src="/images/google-play-badge.png" alt="Disponible en Google Play" width={161} height={62} className="play-badge-img" />
    </a>
  );
}

// «Texto grande» vive en <html data-text="large"> (lo aplica antes de pintar el
// script de layout.tsx); este pequeño store avisa a React cuando cambia.
const textSizeListeners = new Set<() => void>();

function subscribeTextSize(listener: () => void) {
  textSizeListeners.add(listener);
  return () => textSizeListeners.delete(listener);
}

function setLargeText(large: boolean) {
  if (large) document.documentElement.dataset.text = "large";
  else delete document.documentElement.dataset.text;
  try {
    localStorage.setItem(TEXT_SIZE_KEY, large ? "large" : "normal");
  } catch {
    // Sin almacenamiento (modo privado): solo dura esta visita.
  }
  textSizeListeners.forEach((l) => l());
}

/** Botón «Aa»: agranda todo el texto del sitio (útil para personas mayores). */
function TextSizeToggle() {
  const large = useSyncExternalStore(
    subscribeTextSize,
    () => document.documentElement.dataset.text === "large",
    () => false
  );

  return (
    <button
      type="button"
      className="text-size-btn"
      onClick={() => setLargeText(!large)}
      aria-pressed={large}
      aria-label={large ? "Usar texto normal" : "Agrandar el texto"}
      title={large ? "Texto normal" : "Texto grande"}
    >
      <span aria-hidden>A</span>
      <span aria-hidden className="text-size-btn-big">A</span>
    </button>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  // En la landing los enlaces son anclas locales; en el resto de páginas llevan a la landing.
  const base = usePathname() === "/" ? "" : "/";

  return (
    <header>
      <div className="container header-inner">
        <Link href="/" className="logo" aria-label="MedicAI inicio">
          Medic<span>AI</span>
        </Link>
        <nav className="nav-links" aria-label="Navegación principal">
          {NAV_LINKS.map((l) => (
            <a key={l.hash} href={base + l.hash}>{l.label}</a>
          ))}
          <Link href="/guias">Guías</Link>
        </nav>
        <div className="header-actions">
          <TextSizeToggle />
          <GooglePlayBadge className="header-play-badge" />
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav
          id="mobile-nav"
          className={`mobile-nav ${menuOpen ? "open" : ""}`}
          aria-label="Menú móvil"
        >
          {NAV_LINKS.map((l) => (
            <a key={l.hash} href={base + l.hash} onClick={() => setMenuOpen(false)}>{l.label}</a>
          ))}
          <Link href="/guias" onClick={() => setMenuOpen(false)}>Guías</Link>
          <GooglePlayBadge />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer>
      <div className="container footer-inner">
        <div className="footer-top">
          <div className="footer-brand">
            <Link href="/" className="logo" aria-label="MedicAI inicio">
              Medic<span>AI</span>
            </Link>
            <p>El organizador médico diseñado para la tranquilidad familiar.</p>
          </div>
          <div className="footer-links">
            <h4>Para ti</h4>
            {AUDIENCES.map((a) => (
              <Link key={a.slug} href={`/para/${a.slug}`}>{a.navLabel}</Link>
            ))}
            <Link href="/guias">Guías</Link>
          </div>
          <div className="footer-links">
            <h4>Legal</h4>
            <Link href="/terminos">Términos y condiciones</Link>
            <Link href="/privacidad">Política de privacidad</Link>
          </div>
          <div className="footer-links">
            <h4>Soporte</h4>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-2">
              <Mail size={16} /> {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} MedicAI. MedicAI no reemplaza la atención de un profesional de la salud.</span>
        </div>
      </div>
    </footer>
  );
}
