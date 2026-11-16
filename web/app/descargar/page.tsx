import type { Metadata } from "next";
import { Download } from "lucide-react";
import { SiteFooter, SiteHeader } from "../components/site-chrome";
import { APK_URL, SUPPORT_EMAIL } from "../content/site";

export const metadata: Metadata = {
  title: "Descargar MedicAI para Android",
  description:
    "Descarga gratis MedicAI para Android e instálala en pocos pasos: recordatorios de medicamentos, citas y Círculo de cuidado.",
  alternates: { canonical: "/descargar" },
};

const STEPS = [
  {
    title: "Descarga el archivo",
    text: "Toca «Descargar MedicAI» desde tu teléfono Android. Se guarda un archivo llamado MedicAI.apk.",
  },
  {
    title: "Ábrelo",
    text: "Cuando termine, toca la notificación de descarga o busca MedicAI.apk en la app «Archivos» o «Descargas».",
  },
  {
    title: "Permite la instalación",
    text: "Android te pedirá permiso para instalar apps desde tu navegador (o desde «Archivos»). Toca «Configuración», activa «Permitir de esta fuente» y vuelve atrás.",
  },
  {
    title: "Instala y abre",
    text: "Toca «Instalar». Si Google Play Protect muestra un aviso, elige «Más detalles» → «Instalar de todas formas». Luego abre MedicAI y crea tu cuenta.",
  },
];

export default function DownloadPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 bg-bg text-text">
        <article className="mx-auto max-w-3xl px-5 pb-24 pt-12 leading-relaxed">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Descargar</p>
          <h1 className="font-display mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
            MedicAI para Android
          </h1>
          <p className="mt-4 text-lg text-text-muted">
            Gratis. Mientras llegamos a Google Play, la app se instala directamente desde aquí con el
            archivo oficial (APK). Es la misma versión que publicaremos en la tienda.
          </p>

          <div className="mt-8">
            <a
              href={APK_URL}
              className="btn btn-primary"
              data-umami-event="descargar-apk"
            >
              <Download size={18} aria-hidden />
              Descargar MedicAI
            </a>
            <p className="mt-3 text-sm text-text-muted">Requiere Android 7.0 o superior.</p>
          </div>

          <section
            style={{ paddingBlock: 0 }}
            className="mt-12 text-text-muted"
            aria-labelledby="pasos"
          >
            <h2 id="pasos" className="font-display text-2xl font-semibold text-text">
              Cómo instalarla
            </h2>
            <ol className="mt-4 space-y-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-semibold"
                    style={{ background: "var(--accent)", color: "#042f2e" }}
                    aria-hidden
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-text">{s.title}</p>
                    <p className="mt-1">{s.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section
            style={{ paddingBlock: 0 }}
            className="mt-12 text-text-muted [&_p]:mt-3"
            aria-labelledby="actualizar"
          >
            <h2 id="actualizar" className="font-display text-2xl font-semibold text-text">
              Actualizaciones
            </h2>
            <p>
              Las versiones instaladas desde aquí no se actualizan solas. Para tener la última, vuelve a
              esta página y descarga e instala el archivo otra vez: tus datos y tu sesión se conservan.
            </p>
            <p>
              ¿Tienes problemas para instalarla? Escríbenos a{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Ayuda para instalar MedicAI")}`}
                style={{ color: "var(--accent)" }}
                className="font-medium underline-offset-4 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
