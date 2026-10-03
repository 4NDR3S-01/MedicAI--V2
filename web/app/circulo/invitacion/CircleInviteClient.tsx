"use client";

import { useEffect, useMemo, useState } from "react";

const APP_SCHEME = (process.env.NEXT_PUBLIC_APP_DEEP_LINK_BASE_URL ?? "medicai://auth").split("://")[0] || "medicai";

export function CircleInviteClient({ code }: Readonly<{ code: string }>) {
  const [copied, setCopied] = useState(false);
  const formatted = code ? `${code.slice(0, 4)}-${code.slice(4)}` : "";
  const deepLink = useMemo(() => (code ? `${APP_SCHEME}://circle/invite?code=${code}` : ""), [code]);

  // Intenta abrir la app una vez; si no está instalada, la página sigue aquí.
  useEffect(() => {
    if (!deepLink) return;
    const timer = window.setTimeout(() => {
      window.location.href = deepLink;
    }, 400);
    return () => window.clearTimeout(timer);
  }, [deepLink]);

  if (!code) {
    return (
      <div className="mt-7">
        <h1 className="text-2xl font-extrabold">Enlace no válido</h1>
        <p className="mt-3 text-[15px] leading-7 text-[#58728b]">
          Este enlace de invitación está incompleto. Pide a quien te invitó que te lo envíe de nuevo o que te comparta el código.
        </p>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-7">
      <span className="inline-block rounded-full bg-[#1b86e3]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#1b86e3]">
        Invitación al Círculo
      </span>
      <h1 className="mt-4 text-2xl font-extrabold leading-tight">Te invitaron a un Círculo de MedicAI</h1>
      <p className="mt-3 text-[15px] leading-7 text-[#58728b]">
        En el Círculo, familiares y cuidadores se acompañan con los medicamentos y las citas. Al abrir la invitación en la app
        verás quién te invita y qué podrá hacer cada uno antes de aceptar. Nadie verá tu información si no aceptas.
      </p>

      <a
        href={deepLink}
        className="mt-6 inline-block rounded-[14px] bg-[#12a594] px-6 py-3.5 text-[15px] font-extrabold text-[#073730]"
      >
        Abrir en MedicAI
      </a>

      <div className="mt-7 rounded-[18px] border border-[#d6e3ef] bg-[#f3f8fc] p-5">
        <p className="text-sm font-bold uppercase tracking-wide">¿No se abrió la app?</p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[14px] leading-6 text-[#58728b]">
          <li>Instala MedicAI y crea tu cuenta (o inicia sesión).</li>
          <li>Entra en <strong>Círculo</strong> y toca <strong>Tengo un código</strong>.</li>
          <li>Escribe este código:</li>
        </ol>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <code className="rounded-[12px] border border-[#d6e3ef] bg-white px-4 py-2.5 text-2xl font-extrabold tracking-[0.2em]">
            {formatted}
          </code>
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-[12px] border border-[#d6e3ef] bg-white px-4 py-2.5 text-sm font-bold text-[#1b86e3]"
          >
            {copied ? "¡Copiado!" : "Copiar código"}
          </button>
        </div>
        <p className="mt-4 text-[13px] leading-6 text-[#58728b]">La invitación vence a los 7 días.</p>
      </div>
    </div>
  );
}
