import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { TEXT_SIZE_KEY } from "./content/site";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://medicai.lat"),
  title: {
    default: "MedicAI",
    template: "%s | MedicAI",
  },
  description:
    "MedicAI te recuerda tus medicamentos y citas médicas, coordina el cuidado de tu familia y te ayuda con un asistente de IA por voz. Gratis para Android.",
  applicationName: "MedicAI",
  keywords: [
    "recordatorio de medicamentos",
    "alarma de pastillas",
    "recordatorio de citas médicas",
    "app para cuidar a mis papás",
    "cuidado familiar",
    "asistente de salud con IA",
  ],
  openGraph: {
    title: "MedicAI | Tu agenda médica, siempre presente",
    description:
      "Medicamentos, citas y el cuidado de tu familia en una sola app, con un asistente al que le puedes hablar.",
    url: "https://medicai.lat",
    siteName: "MedicAI",
    locale: "es_419",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  // Iconos: app/favicon.ico, app/icon.png y app/apple-icon.png (convención de
  // archivos de Next). Antes se servía el logo de 484 KB como favicon.
};

import SmoothScrollProvider from "./components/SmoothScrollProvider";

// Aplica «texto grande» antes de pintar para que la página no salte al cargar.
const TEXT_SIZE_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)})==="large")document.documentElement.dataset.text="large"}catch(e){}`;

// Analítica opcional: Umami alojado por nosotros (sin cookies, no identifica a
// nadie). Solo se carga si están las dos variables; si no, no se mide nada.
const UMAMI_SCRIPT_URL = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL;
const UMAMI_WEBSITE_ID = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: el script de arriba puede añadir data-text antes de hidratar.
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEXT_SIZE_SCRIPT }} />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
        {UMAMI_SCRIPT_URL && UMAMI_WEBSITE_ID && (
          <Script src={UMAMI_SCRIPT_URL} data-website-id={UMAMI_WEBSITE_ID} strategy="afterInteractive" />
        )}
      </body>
    </html>
  );
}
