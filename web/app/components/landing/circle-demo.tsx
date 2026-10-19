"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Bell, Check, Phone, Pill } from "lucide-react";
import { useIsVisible, usePrefersReducedMotion } from "../../hooks/useInView";

// Guion: suena la alarma de mamá → pasa una hora sin marcarla → te llega el
// aviso → ves su seguimiento → ella la marca y te enteras. Recrea el aviso real
// de dosis olvidada (MissedDoseService, 1 h de retraso).
const STEPS = [
  { ms: 1600, clock: "8:00", caption: "8:00 · Suena la alarma de tu mamá" },
  { ms: 900,  clock: "8:30", caption: "Pasa el tiempo y no la marca…" },
  { ms: 900,  clock: "9:00", caption: "9:00 · Lleva una hora pendiente" },
  { ms: 2400, clock: "9:00", caption: "Te llega un aviso a ti" },
  { ms: 2300, clock: "9:01", caption: "Ves su seguimiento de hoy" },
  { ms: 700,  clock: "9:05", caption: "Ella la marca…" },
  { ms: 3200, clock: "9:05", caption: "…y te enteras al instante" },
  { ms: 500,  clock: "9:05", caption: "" },
];
const LAST = STEPS.length - 1;
const FINAL_STATIC_STEP = 4;

export function CircleDemo() {
  const [ref, visible] = useIsVisible<HTMLDivElement>(0.35);
  const reducedMotion = usePrefersReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!visible || reducedMotion) return;
    const id = setTimeout(() => setStep((s) => (s >= LAST ? 0 : s + 1)), STEPS[step].ms);
    return () => clearTimeout(id);
  }, [step, visible, reducedMotion]);

  const s = reducedMotion ? FINAL_STATIC_STEP : step;
  const { clock, caption } = STEPS[s];
  const taken = s >= 6;
  const overdue = s >= 2 && !taken;

  return (
    <div
      ref={ref}
      className={`circle-demo ${s === LAST ? "circle-demo--reset" : ""}`}
      role="img"
      aria-label="Ejemplo: tu mamá no marca su dosis de las 8:00, a las 9:00 te llega un aviso, ves su seguimiento y te enteras cuando la toma."
    >
      <div className="circle-demo-phones" aria-hidden>
        {/* Teléfono de mamá */}
        <figure className="mini-device">
          <div className="mini-device-screen">
            <div className="mini-status"><span>{clock}</span><span>●●●</span></div>
            <div className="mini-app-title">Hoy</div>
            <div className={`dose-card ${taken ? "dose-card--taken" : overdue ? "dose-card--late" : ""}`}>
              <span className="dose-card-icon">{taken ? <Check size={16} /> : <Pill size={16} />}</span>
              <div>
                <strong>Metformina 850 mg</strong>
                <span>8:00 · 1 tableta</span>
              </div>
              <span className="dose-badge">{taken ? "Tomada" : overdue ? "Atrasada" : "Ahora"}</span>
            </div>
            <div className="dose-card dose-card--taken dose-card--muted">
              <span className="dose-card-icon"><Check size={16} /></span>
              <div>
                <strong>Losartán 50 mg</strong>
                <span>7:00 · 1 tableta</span>
              </div>
              <span className="dose-badge">Tomada</span>
            </div>
            <span className={`mini-take-btn ${s === 5 ? "mini-take-btn--pressed" : ""} ${taken ? "mini-take-btn--hidden" : ""}`}>
              Tomar
            </span>
          </div>
          <figcaption>Teléfono de tu mamá</figcaption>
        </figure>

        {/* Tu teléfono */}
        <figure className="mini-device">
          <div className={`mini-device-screen ${s >= 4 ? "" : "mini-device-screen--lock"}`}>
            {s < 4 ? (
              <>
                <div className="lock-clock">{clock}</div>
                <div className="lock-date">miércoles, 14 de octubre</div>
                <div className={`push-card ${s >= 3 ? "push-card--in" : ""}`}>
                  <div className="push-card-head"><Bell size={12} /> MedicAI · ahora</div>
                  <strong>Mamá no ha marcado su dosis</strong>
                  <span>Metformina 850 mg de las 8:00 sigue pendiente.</span>
                </div>
              </>
            ) : (
              <>
                <div className="mini-status"><span>{clock}</span><span>●●●</span></div>
                <div className="mini-app-title">Seguimiento de hoy</div>
                <div className="care-person">
                  <span className="care-avatar">M</span>
                  <strong>Mamá</strong>
                  <span className={`care-pill ${taken ? "care-pill--ok" : "care-pill--warn"}`}>
                    {taken ? "Al día" : "1 pendiente"}
                  </span>
                </div>
                <div className="care-row"><Check size={14} className="care-ok" /> Losartán · 7:00</div>
                <div className="care-row">
                  {taken ? <Check size={14} className="care-ok" /> : <AlertCircle size={14} className="care-warn" />}
                  Metformina · 8:00
                </div>
                <span className={`mini-call-btn ${taken ? "mini-call-btn--hidden" : ""}`}><Phone size={13} /> Llamar a Mamá</span>
                <div className={`toast ${taken ? "toast--in" : ""}`}>
                  <Check size={14} /> Mamá registró su Metformina
                </div>
              </>
            )}
          </div>
          <figcaption>Tu teléfono</figcaption>
        </figure>
      </div>
      <p className="circle-demo-caption" aria-hidden>
        <span key={s} className="circle-demo-caption-text">{caption}</span>
      </p>
    </div>
  );
}
