"use client";

import { useEffect, useState } from "react";
import { Camera, Check, FileText, Mic, Pill, Sparkles } from "lucide-react";
import { useIsVisible, usePrefersReducedMotion } from "../../hooks/useInView";

// Guion de la demo: cada paso dura `ms` y luego pasa al siguiente. Al final
// se desvanece y vuelve a empezar (solo mientras se ve en pantalla).
const STEPS = [
  { ms: 1500 }, // 0 escuchando
  { ms: 700 },  // 1 llega la frase dictada
  { ms: 1100 }, // 2 escribiendo…
  { ms: 1900 }, // 3 propone registrar la toma
  { ms: 550 },  // 4 «toca» Registrar
  { ms: 1700 }, // 5 confirmado
  { ms: 1000 }, // 6 foto de la receta
  { ms: 1300 }, // 7 escribiendo…
  { ms: 4200 }, // 8 propone el medicamento nuevo
  { ms: 500 },  // 9 desvanecer y reiniciar
];
const LAST = STEPS.length - 1;
const FINAL_STATIC_STEP = 8;

export function ChatDemo() {
  const [ref, visible] = useIsVisible<HTMLDivElement>(0.35);
  const reducedMotion = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!visible || reducedMotion) return;
    const id = setTimeout(() => setStep((s) => (s >= LAST ? 0 : s + 1)), STEPS[step].ms);
    return () => clearTimeout(id);
  }, [step, visible, reducedMotion]);

  const s = reducedMotion ? FINAL_STATIC_STEP : step;
  const listening = s === 0;
  const typing = s === 2 || s === 7;

  return (
    <div
      ref={ref}
      className="chat-mock"
      role="img"
      aria-label="Ejemplo de conversación con el asistente de MedicAI: registra una toma dictada por voz y lee una receta desde una foto."
    >
      <div className="chat-mock-header">
        <span className="chat-mock-avatar"><Sparkles size={16} /></span>
        <div>
          <strong>Asistente MedicAI</strong>
          <span>{listening ? "Escuchando…" : typing ? "Escribiendo…" : "En línea"}</span>
        </div>
      </div>

      <div className={`chat-mock-body ${s === LAST ? "chat-mock-body--reset" : ""}`} aria-hidden>
        {s >= 1 && (
          <div className="chat-bubble chat-bubble--user chat-enter">
            <Mic size={14} /> Ya me tomé la losartán
          </div>
        )}
        {s >= 3 && (
          <div className="chat-bubble chat-bubble--bot chat-enter">
            ¡Bien hecho! ¿Registro la toma de las 8:00?
            <div className={`chat-proposal ${s >= 5 ? "chat-proposal--done" : ""}`}>
              <div className="chat-proposal-title">
                <Pill size={16} />
                <div>
                  <strong>Losartán 50 mg</strong>
                  <span>Hoy · 8:00 · 1 tableta</span>
                </div>
              </div>
              <div className="chat-proposal-actions">
                {s >= 5 ? (
                  <span className="chat-btn chat-btn--done"><Check size={14} /> Registrada</span>
                ) : (
                  <>
                    <span className={`chat-btn chat-btn--primary ${s === 4 ? "chat-btn--pressed" : ""}`}>
                      <Check size={14} /> Registrar
                    </span>
                    <span className="chat-btn">Ahora no</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
        {s >= 6 && (
          <div className="chat-bubble chat-bubble--user chat-bubble--photo chat-enter">
            <span className="chat-photo"><FileText size={22} /></span>
            <span><Camera size={14} /> ¿Y esta receta nueva?</span>
          </div>
        )}
        {s >= 8 && (
          <div className="chat-bubble chat-bubble--bot chat-enter">
            Veo <strong>Amoxicilina 500 mg</strong>, 1 cápsula cada 8 horas por 7 días. ¿La agrego a tus medicamentos?
            <div className="chat-proposal">
              <div className="chat-proposal-actions">
                <span className="chat-btn chat-btn--primary">Revisar y guardar</span>
              </div>
            </div>
          </div>
        )}
        {typing && (
          <div className="chat-bubble chat-bubble--bot chat-bubble--typing chat-enter">
            <span /><span /><span />
          </div>
        )}
      </div>

      <div className={`chat-mock-input ${listening ? "chat-mock-input--listening" : ""}`}>
        {listening ? (
          <span className="chat-wave" aria-hidden>
            {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ animationDelay: `${(i % 7) * 90}ms` }} />)}
          </span>
        ) : (
          <span>Escribe o habla…</span>
        )}
        <span className="chat-mock-mic"><Mic size={16} /></span>
      </div>
    </div>
  );
}
