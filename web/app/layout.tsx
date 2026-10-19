import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen flex flex-col antialiased">
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
