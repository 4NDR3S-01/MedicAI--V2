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
    "MedicAI ayuda a recordar citas médicas, tomar medicamentos a tiempo y coordinar círculos familiares de cuidado.",
  keywords: [
    "recordatorio de citas médicas",
    "recordatorio de medicamentos",
    "app médica",
    "cuidado familiar",
  ],
  openGraph: {
    title: "MedicAI | Recordatorios médicos",
    description: "Recordatorios de citas y medicamentos con cuidado familiar.",
    url: "https://medicai.lat",
    siteName: "MedicAI",
    locale: "es_ES",
    type: "website",
  },
  icons: {
    icon: "/logo_app.png",
    apple: "/logo_app.png",
  },
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
