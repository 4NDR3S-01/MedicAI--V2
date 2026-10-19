"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { Home as HomeIcon, Pill, Users, CalendarCheck, User, Check, AlarmClockOff, BellOff, Sparkles } from "lucide-react";

// ─── Module data ─────────────────────────────────────────────────────────────
const MODULES = [
  { label: "Inicio",       Icon: HomeIcon,      src: "/screenshots/inicio.jpg",       glow: "rgba(45, 212, 191, 0.35)"  },
  { label: "Medicamentos", Icon: Pill,          src: "/screenshots/medicamentos.jpg", glow: "rgba(167, 139, 250, 0.35)" },
  { label: "Círculo",      Icon: Users,         src: "/screenshots/circulo.jpg",      glow: "rgba(251, 146, 60, 0.35)"  },
  { label: "Citas",        Icon: CalendarCheck, src: "/screenshots/citas.jpg",        glow: "rgba(96, 165, 250, 0.35)"  },
  { label: "Asistente",    Icon: Sparkles,      src: "/screenshots/chat.jpg",         glow: "rgba(129, 140, 248, 0.35)" },
  // Copia con el correo y el teléfono difuminados (el sitio es público).
  { label: "Perfil",       Icon: User,          src: "/screenshots/perfil-web.jpg",   glow: "rgba(52, 211, 153, 0.35)"  },
];

// ─── Alarm demo ──────────────────────────────────────────────────────────────
// Recrea la alarma nativa de la app (mismos botones: Tomar, Posponer (10m),
// Omitir). Suena al cargar y otra vez si el teléfono «se despierta» al volver
// al hero, como máximo cada 30 s.
type AlarmState = "off" | "ringing" | "taken" | "snoozed" | "skipped";

const ALARM_FIRST_DELAY_MS = 2200;
const ALARM_AUTO_TAKE_MS = 9000; // sin interacción, la demo «toca» Tomar sola
const ALARM_RESULT_MS = 2200;
const ALARM_MIN_GAP_MS = 30000;
const ALARM_GLOW = "rgba(45, 212, 191, 0.55)";

const ALARM_RESULTS: Record<Exclude<AlarmState, "off" | "ringing">, { Icon: typeof Check; title: string; text: string }> = {
  taken:   { Icon: Check,         title: "Toma registrada",   text: "Losartán 50 mg · 8:00" },
  snoozed: { Icon: AlarmClockOff, title: "Pospuesta",         text: "Te lo recordamos a las 8:10" },
  skipped: { Icon: BellOff,       title: "Toma omitida",      text: "Queda anotado en tu registro" },
};

function useAlarmDemo(paused: boolean) {
  const [state, setState] = useState<AlarmState>("off");
  const [autoPress, setAutoPress] = useState(false);
  const lastRingRef = useRef(0);

  const ring = useCallback(() => {
    lastRingRef.current = Date.now();
    setState("ringing");
  }, []);

  const resolve = useCallback((result: Exclude<AlarmState, "off" | "ringing">) => setState(result), []);
  const dismiss = useCallback(() => setState("off"), []);

  /** Llamado cuando la pantalla «se despierta» al volver a ver el hero. */
  const ringIfIdle = useCallback(() => {
    if (Date.now() - lastRingRef.current > ALARM_MIN_GAP_MS) ring();
  }, [ring]);

  useEffect(() => {
    const id = setTimeout(ring, ALARM_FIRST_DELAY_MS);
    return () => clearTimeout(id);
  }, [ring]);

  // Si nadie toca nada, la demo muestra el flujo completo: «pulsa» Tomar.
  // Mientras el usuario explora (hover) no corre el reloj.
  useEffect(() => {
    if (state !== "ringing" || paused) return;
    const press = setTimeout(() => setAutoPress(true), ALARM_AUTO_TAKE_MS - 600);
    const take = setTimeout(() => setState("taken"), ALARM_AUTO_TAKE_MS);
    return () => {
      clearTimeout(press);
      clearTimeout(take);
      setAutoPress(false);
    };
  }, [state, paused]);

  // El resultado (registrada, pospuesta, omitida) se muestra un momento.
  useEffect(() => {
    if (state === "off" || state === "ringing") return;
    const id = setTimeout(() => setState("off"), ALARM_RESULT_MS);
    return () => clearTimeout(id);
  }, [state]);

  return { state, autoPress, resolve, dismiss, ringIfIdle };
}

function AlarmOverlay({
  state,
  autoPress,
  onResolve,
}: {
  state: AlarmState;
  autoPress: boolean;
  onResolve: (r: Exclude<AlarmState, "off" | "ringing">) => void;
}) {
  const result = state !== "off" && state !== "ringing" ? ALARM_RESULTS[state] : null;

  return (
    <div
      className={`alarm-overlay ${state !== "off" ? "alarm-overlay--on" : ""}`}
      aria-hidden={state === "off"}
      role="group"
      aria-label="Demostración de una alarma de MedicAI"
    >
      <div className={`alarm-ringing ${state === "ringing" ? "alarm-ringing--on" : ""}`}>
        <div className="alarm-clock">8:00</div>
        <div className="alarm-caption">Hora de tu medicamento</div>
        <div className="alarm-pill">
          <span className="alarm-pill-ring" />
          <span className="alarm-pill-ring alarm-pill-ring--2" />
          <Pill size={30} />
        </div>
        <strong className="alarm-med">Losartán 50 mg</strong>
        <span className="alarm-dose">1 tableta · después del desayuno</span>
        <div className="alarm-actions">
          <button
            type="button"
            className={`alarm-btn alarm-btn--take ${autoPress ? "alarm-btn--pressed" : ""}`}
            onClick={() => onResolve("taken")}
            tabIndex={state === "ringing" ? 0 : -1}
          >
            Tomar
          </button>
          <div className="alarm-actions-row">
            <button type="button" className="alarm-btn" onClick={() => onResolve("snoozed")} tabIndex={state === "ringing" ? 0 : -1}>
              Posponer (10m)
            </button>
            <button type="button" className="alarm-btn" onClick={() => onResolve("skipped")} tabIndex={state === "ringing" ? 0 : -1}>
              Omitir
            </button>
          </div>
        </div>
      </div>

      <div className={`alarm-result ${result ? "alarm-result--on" : ""}`} aria-live="polite">
        {result && (
          <>
            <span className="alarm-result-icon"><result.Icon size={28} /></span>
            <strong>{result.title}</strong>
            <span>{result.text}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Interactive Phone Showcase (Hero) ───────────────────────────────────────
export function InteractivePhoneShowcase() {
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

  const alarm = useAlarmDemo(hovered);
  const ringing = alarm.state === "ringing";
  const { ringIfIdle } = alarm;

  // Auto-cycle modules every 3 s when not hovered and no alarm on screen
  useEffect(() => {
    if (hovered || alarm.state !== "off") return;
    const id = setInterval(() => {
      setActiveIdx(i => (i + 1) % MODULES.length);
    }, 3000);
    return () => clearInterval(id);
  }, [hovered, alarm.state]);

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

      // Screen wake flash logic (and the alarm rings again on wake)
      if (prevBrightness < 0.5 && brightness >= 0.5 && flashEl) {
        flashEl.classList.add("screen-wake-flash--on");
        clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => {
          if (flashEl) flashEl.classList.remove("screen-wake-flash--on");
        }, 350);
        ringIfIdle();
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
  }, [ringIfIdle]);

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
  const glowColor = alarm.state !== "off" ? ALARM_GLOW : MODULES[activeIdx].glow;

  // Module switch with fade transition
  const switchModule = (idx: number) => {
    alarm.dismiss();
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
        className={`showcase-phone ${hovered ? "showcase-phone--hovered" : ""} ${ringing ? "showcase-phone--ringing" : ""}`}
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

          <AlarmOverlay state={alarm.state} autoPress={alarm.autoPress} onResolve={alarm.resolve} />

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
        <span className={`showcase-hint-line ${ringing ? "showcase-hint-line--active" : ""}`}>
          Así suena una alarma de MedicAI. Prueba a tocar «Tomar»
        </span>
        <span className={`showcase-hint-line ${!ringing && !hovered ? "showcase-hint-line--active" : ""}`}>
          Toca o pasa el cursor sobre el teléfono para explorar
        </span>
        <span className={`showcase-hint-line ${!ringing && hovered ? "showcase-hint-line--active" : ""}`}>
          Navega entre pantallas
        </span>
      </p>
    </div>
  );
}
